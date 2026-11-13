/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { IConversationTurnCompletedEvent, IResponseMessage } from '@/common/adapter/ipcBridge';
import { parseError } from '@/common/utils';
import { getConversationOrNull } from '@/renderer/pages/conversation/utils/conversationCache';
import { useEffect, useRef } from 'react';
import { localRestartFailed, localRestartStarted, localRestartSucceeded } from './conversationRuntimeViewStore';

type PendingRecovery = { conversation_id: string; turn_id: string };

const keyOf = (conversationId: string, turnId: string): string => `${conversationId}:${turnId}`;

export const isRecoverableEmptyTurnTip = (message: IResponseMessage): boolean => {
  if (message.type !== 'tips') return false;
  const data = message.data as { code?: unknown } | undefined;
  return data?.code === 'ACP_EMPTY_TURN_NEEDS_AUTH';
};

const showRecoveryResult = (
  pending: PendingRecovery,
  code: 'ACP_RUNTIME_RECOVERED' | 'ACP_RUNTIME_RECOVERY_FAILED',
  type: 'success' | 'warning'
): void => {
  ipcBridge.conversation.responseStream.emit({
    type: 'tips',
    conversation_id: pending.conversation_id,
    msg_id: `acp-runtime-recovery:${pending.turn_id}:${code}`,
    turn_id: pending.turn_id,
    data: { type, code, content: '' },
  });
};

/** Restart one transient empty-turn runtime after it becomes idle, without replaying user input. */
export function useAcpEmptyTurnRecovery(): void {
  const pendingRef = useRef(new Map<string, PendingRecovery>());
  const attemptedRef = useRef(new Set<string>());
  const recoveringRef = useRef(new Set<string>());

  useEffect(() => {
    let disposed = false;

    const recover = async (pending: PendingRecovery): Promise<void> => {
      const key = keyOf(pending.conversation_id, pending.turn_id);
      if (recoveringRef.current.has(key) || attemptedRef.current.has(key)) return;
      recoveringRef.current.add(key);
      try {
        const conversation = await getConversationOrNull(pending.conversation_id);
        if (disposed || !conversation?.runtime) {
          pendingRef.current.delete(key);
          return;
        }
        const runtime = conversation.runtime;
        if (runtime.turn_id && runtime.turn_id !== pending.turn_id) {
          pendingRef.current.delete(key);
          return;
        }
        if (runtime.turn_id === pending.turn_id || runtime.is_processing || !runtime.can_send_message) return;

        pendingRef.current.delete(key);
        attemptedRef.current.add(key);
        localRestartStarted(pending.conversation_id);
        try {
          const result = await ipcBridge.conversation.restartRuntime.invoke({
            conversation_id: pending.conversation_id,
          });
          if (disposed) return;
          localRestartSucceeded(pending.conversation_id, result.runtime);
          showRecoveryResult(
            pending,
            result.recovered ? 'ACP_RUNTIME_RECOVERED' : 'ACP_RUNTIME_RECOVERY_FAILED',
            result.recovered ? 'success' : 'warning'
          );
        } catch (error) {
          if (disposed) return;
          let currentRuntime = null;
          try {
            currentRuntime = (await getConversationOrNull(pending.conversation_id))?.runtime ?? null;
          } catch {
            // Keep the local restart gate usable when the follow-up lookup fails.
          }
          if (disposed) return;
          localRestartFailed(pending.conversation_id, currentRuntime, parseError(error) || 'runtime restart failed');
          showRecoveryResult(pending, 'ACP_RUNTIME_RECOVERY_FAILED', 'warning');
        }
      } catch {
        pendingRef.current.delete(key);
      } finally {
        recoveringRef.current.delete(key);
      }
    };

    const offResponse = ipcBridge.conversation.responseStream.on((message: IResponseMessage) => {
      if (!isRecoverableEmptyTurnTip(message) || !message.turn_id) return;
      const key = keyOf(message.conversation_id, message.turn_id);
      if (attemptedRef.current.has(key)) return;
      pendingRef.current.set(key, {
        conversation_id: message.conversation_id,
        turn_id: message.turn_id,
      });
    });
    const offCompleted = ipcBridge.conversation.turnCompleted.on((event: IConversationTurnCompletedEvent) => {
      const key = keyOf(event.session_id, event.turn_id);
      const pending = pendingRef.current.get(key);
      if (!pending) return;
      if (event.state === 'stopped') {
        pendingRef.current.delete(key);
        return;
      }
      void recover(pending);
    });

    return () => {
      disposed = true;
      pendingRef.current.clear();
      attemptedRef.current.clear();
      recoveringRef.current.clear();
      offResponse();
      offCompleted();
    };
  }, []);
}
