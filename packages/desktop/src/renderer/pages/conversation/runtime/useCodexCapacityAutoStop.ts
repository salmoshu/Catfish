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
 * Codex retries a capacity error on its own, but retrying the same saturated
 * model cannot succeed. Stop that turn, then optionally send one normal
 * continuation. A second capacity failure in the same chain pauses the queue
 * instead of creating an unbounded stop/continue loop.
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
  const continuedConversationsRef = useRef<Set<string>>(new Set());

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

      if (continueTurn) {
        continuedConversationsRef.current.add(message.conversation_id);
        await continueAfterStop(message.conversation_id);
      }
    };

    const offResponse = ipcBridge.conversation.responseStream.on((message) => {
      if (!isCodexCapacityRetryTip(message)) return;

      const autoContinue = configService.get('codex.autoContinueOnCapacity') ?? true;
      const continueTurn = autoContinue && !continuedConversationsRef.current.has(message.conversation_id);
      if (!continueTurn) pauseConversationCommandQueue(message.conversation_id);
      void stopTurnOnce(message, continueTurn);
    });
    const offCompleted = ipcBridge.conversation.turnCompleted.on((event) => {
      if (event.state === 'ai_waiting_input') {
        continuedConversationsRef.current.delete(event.session_id);
      }
    });

    return () => {
      offResponse();
      offCompleted();
    };
  }, []);
}
