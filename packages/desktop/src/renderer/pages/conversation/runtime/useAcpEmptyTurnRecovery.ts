/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { IConversationTurnCompletedEvent, IResponseMessage } from '@/common/adapter/ipcBridge';
import type { TMessage } from '@/common/chat/chatLib';
import { localSendAccepted, localSendFailed, localSendStarted } from './conversationRuntimeViewStore';
import { getConversationOrNull } from '@/renderer/pages/conversation/utils/conversationCache';
import { useEffect, useRef } from 'react';

type PendingRetry = { conversation_id: string; turn_id: string };

const keyOf = (conversationId: string, turnId: string): string => `${conversationId}:${turnId}`;

export const isRecoverableEmptyTurnTip = (message: IResponseMessage): boolean => {
  if (message.type !== 'tips') return false;
  const data = message.data as { code?: unknown } | undefined;
  return data?.code === 'ACP_EMPTY_TURN_NEEDS_AUTH';
};

export const latestUserText = (messages: TMessage[]): { id: string; text: string } | null => {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.type !== 'text' || message.position !== 'right') continue;
    const text = typeof message.content?.content === 'string' ? message.content.content.trim() : '';
    if (text) return { id: message.id, text };
  }
  return null;
};

/** Retry one transient empty ACP turn after an application restart, never the same user message twice. */
export function useAcpEmptyTurnRecovery(): void {
  const pendingRef = useRef(new Map<string, PendingRetry>());
  const retriedMessageIdsRef = useRef(new Set<string>());
  const sendingRef = useRef(new Set<string>());

  useEffect(() => {
    let disposed = false;

    const retry = async (pending: PendingRetry): Promise<void> => {
      const key = keyOf(pending.conversation_id, pending.turn_id);
      if (sendingRef.current.has(key)) return;
      sendingRef.current.add(key);
      try {
        const conversation = await getConversationOrNull(pending.conversation_id);
        if (disposed || !conversation?.runtime) return;
        const runtime = conversation.runtime;
        if (runtime.turn_id && runtime.turn_id !== pending.turn_id) {
          pendingRef.current.delete(key);
          return;
        }
        if (runtime.turn_id === pending.turn_id || runtime.is_processing || !runtime.can_send_message) return;

        const page = await ipcBridge.database.getConversationMessages.invoke({
          conversation_id: pending.conversation_id,
          limit: 30,
          content_mode: 'full',
        });
        const original = latestUserText(page.items);
        if (!original || retriedMessageIdsRef.current.has(original.id)) {
          pendingRef.current.delete(key);
          return;
        }

        retriedMessageIdsRef.current.add(original.id);
        pendingRef.current.delete(key);
        localSendStarted(pending.conversation_id);
        try {
          const result = await ipcBridge.acpConversation.sendMessage.invoke({
            conversation_id: pending.conversation_id,
            input: original.text,
            files: [],
          });
          if (!disposed) localSendAccepted(pending.conversation_id, result.turn_id, result.runtime, result.msg_id);
        } catch (error) {
          if (!disposed) {
            localSendFailed(pending.conversation_id, {
              kind: 'ordinary',
              reason: error instanceof Error ? error.message : String(error),
            });
          }
        }
      } finally {
        sendingRef.current.delete(key);
      }
    };

    const offResponse = ipcBridge.conversation.responseStream.on((message: IResponseMessage) => {
      if (!isRecoverableEmptyTurnTip(message) || !message.turn_id) return;
      pendingRef.current.set(keyOf(message.conversation_id, message.turn_id), {
        conversation_id: message.conversation_id,
        turn_id: message.turn_id,
      });
    });
    const offCompleted = ipcBridge.conversation.turnCompleted.on((event: IConversationTurnCompletedEvent) => {
      const key = keyOf(event.session_id, event.turn_id);
      const pending = pendingRef.current.get(key);
      if (pending) void retry(pending);
    });

    return () => {
      disposed = true;
      pendingRef.current.clear();
      sendingRef.current.clear();
      offResponse();
      offCompleted();
    };
  }, []);
}
