/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { IResponseMessage } from '@/common/adapter/ipcBridge';
import { isCodexCapacityRetryTip } from '@/common/chat/chatLib';
import { configService } from '@/common/config/configService';
import {
  getConversationRuntimeViewSnapshot,
  localSendAccepted,
  localSendFailed,
  localSendStarted,
} from '@/renderer/pages/conversation/runtime/conversationRuntimeViewStore';
import { getConversationOrNull } from '@/renderer/pages/conversation/utils/conversationCache';
import { pauseConversationCommandQueue } from '@/renderer/pages/conversation/platforms/useConversationCommandQueue';
import { useEffect, useRef } from 'react';

/**
 * Stop a capacity-stalled turn and, when enabled, send a normal continuation.
 * Repeated capacity failures keep continuing until the task completes or a
 * different failure pauses the queue. A turn id is still deduplicated so several
 * retry tips from the same Codex turn cannot send duplicate continuations.
 */
const resolveTurnId = async (message: IResponseMessage): Promise<string | null> => {
  if (message.turn_id) return message.turn_id;

  const activeTurnId = getConversationRuntimeViewSnapshot(message.conversation_id).activeTurnId;
  if (activeTurnId) return activeTurnId;

  try {
    const conversation = await getConversationOrNull(message.conversation_id);
    return conversation?.runtime?.turn_id ?? null;
  } catch {
    return null;
  }
};

export function useCodexCapacityAutoStop(): void {
  const stoppedTurnsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const continueAfterStop = async (conversation_id: string): Promise<void> => {
      localSendStarted(conversation_id);
      try {
        const result = await ipcBridge.acpConversation.sendMessage.invoke({
          conversation_id,
          input: '继续',
          files: [],
        });
        localSendAccepted(conversation_id, result.turn_id, result.runtime, result.msg_id);
      } catch (error) {
        localSendFailed(conversation_id, {
          kind: 'ordinary',
          reason: error instanceof Error ? error.message : String(error),
        });
        pauseConversationCommandQueue(conversation_id);
      }
    };

    const stopTurnOnce = async (message: IResponseMessage, continueTurn: boolean): Promise<void> => {
      const turn_id = await resolveTurnId(message);
      if (!turn_id) {
        pauseConversationCommandQueue(message.conversation_id);
        return;
      }

      const stoppedKey = `${message.conversation_id}:${turn_id}`;
      if (stoppedTurnsRef.current.has(stoppedKey)) return;
      stoppedTurnsRef.current.add(stoppedKey);

      try {
        await ipcBridge.conversation.stop.invoke({ conversation_id: message.conversation_id, turn_id });
      } catch {
        pauseConversationCommandQueue(message.conversation_id);
        return;
      }

      if (continueTurn) await continueAfterStop(message.conversation_id);
    };

    return ipcBridge.conversation.responseStream.on((message) => {
      if (!isCodexCapacityRetryTip(message)) return;

      const continueTurn = configService.get('codex.autoContinueOnCapacity') ?? true;
      if (!continueTurn) pauseConversationCommandQueue(message.conversation_id);
      void stopTurnOnce(message, continueTurn);
    });
  }, []);
}
