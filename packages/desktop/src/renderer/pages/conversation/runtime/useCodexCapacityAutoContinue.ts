/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { IConversationTurnCompletedEvent, IResponseMessage } from '@/common/adapter/ipcBridge';
import {
  isCodexCapacityRetryTip,
  isCodexCapacityTerminalError,
  isCodexRetryExhaustionError,
  isCodexRetryTip,
} from '@/common/chat/chatLib';
import { configService } from '@/common/config/configService';
import {
  localSendAccepted,
  localSendFailed,
  localSendStarted,
} from '@/renderer/pages/conversation/runtime/conversationRuntimeViewStore';
import { getConversationOrNull } from '@/renderer/pages/conversation/utils/conversationCache';
import {
  pauseConversationCommandQueue,
  resumeConversationCommandQueue,
} from '@/renderer/pages/conversation/platforms/useConversationCommandQueue';
import { emitter } from '@/renderer/utils/emitter';
import { useEffect, useRef } from 'react';

const showCapacityRecovery = (
  pending: PendingContinuation,
  code: 'CODEX_CAPACITY_CONTINUED' | 'CODEX_CAPACITY_CONTINUE_FAILED',
  type: 'success' | 'warning'
): void => {
  const content =
    code === 'CODEX_CAPACITY_CONTINUED'
      ? 'The previous turn ended because the selected model is at capacity. Catfish sent Continue automatically, and Codex accepted the new turn.'
      : 'Catfish could not automatically send Continue after the capacity failure. Queued commands remain paused; continue manually when ready.';
  emitter.emit('codex.capacity.recovery', {
    type: 'tips',
    conversation_id: pending.conversation_id,
    msg_id: `codex-capacity-recovery:${pending.turn_id}:${code}`,
    turn_id: pending.turn_id,
    data: { type, code, content },
  });
};

type PendingContinuation = {
  conversation_id: string;
  turn_id: string;
};

const continuationKey = (conversation_id: string, turn_id: string): string => `${conversation_id}:${turn_id}`;

/**
 * Codex owns its in-turn retry loop. Catfish only continues after a terminal
 * capacity failure, once the backend has released that turn. Cancelling on a
 * retry-progress tip would interrupt tool work and race the continuation
 * against the still-active turn.
 */
export function useCodexCapacityAutoContinue(): void {
  const pendingTurnsRef = useRef<Map<string, PendingContinuation>>(new Map());
  const continuingTurnsRef = useRef<Set<string>>(new Set());
  const capacityRetryTurnsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    let disposed = false;

    const continueWhenReleased = async (pending: PendingContinuation): Promise<void> => {
      const key = continuationKey(pending.conversation_id, pending.turn_id);
      if (continuingTurnsRef.current.has(key)) return;
      continuingTurnsRef.current.add(key);

      try {
        const conversation = await getConversationOrNull(pending.conversation_id);
        if (disposed || !conversation) {
          pendingTurnsRef.current.delete(key);
          return;
        }

        const runtime = conversation.runtime;
        if (!runtime) return;

        if (runtime.turn_id && runtime.turn_id !== pending.turn_id) {
          // The user or another flow already opened a newer turn. The stale
          // capacity continuation must not interrupt or duplicate that work.
          pendingTurnsRef.current.delete(key);
          resumeConversationCommandQueue(pending.conversation_id);
          return;
        }

        if (runtime.turn_id === pending.turn_id || runtime.is_processing || !runtime.can_send_message) {
          // The relay publishes completion once before finalization and once
          // after the orchestrator releases its claim. Keep the pending request
          // for the latter instead of sending into the old turn and getting 409.
          return;
        }

        pendingTurnsRef.current.delete(key);
        localSendStarted(pending.conversation_id);
        try {
          const result = await ipcBridge.acpConversation.sendMessage.invoke({
            conversation_id: pending.conversation_id,
            input: '继续',
            files: [],
          });
          if (disposed) return;
          localSendAccepted(pending.conversation_id, result.turn_id, result.runtime, result.msg_id);
          resumeConversationCommandQueue(pending.conversation_id);
          showCapacityRecovery(pending, 'CODEX_CAPACITY_CONTINUED', 'success');
        } catch (error) {
          if (!disposed) {
            localSendFailed(pending.conversation_id, {
              kind: 'ordinary',
              reason: error instanceof Error ? error.message : String(error),
            });
            showCapacityRecovery(pending, 'CODEX_CAPACITY_CONTINUE_FAILED', 'warning');
          }
          pauseConversationCommandQueue(pending.conversation_id);
        }
      } catch {
        pendingTurnsRef.current.delete(key);
        pauseConversationCommandQueue(pending.conversation_id);
        if (!disposed) showCapacityRecovery(pending, 'CODEX_CAPACITY_CONTINUE_FAILED', 'warning');
      } finally {
        continuingTurnsRef.current.delete(key);
      }
    };

    const offResponse = ipcBridge.conversation.responseStream.on((message: IResponseMessage) => {
      const turnId = message.turn_id;
      const key = turnId ? continuationKey(message.conversation_id, turnId) : null;

      if (isCodexCapacityRetryTip(message)) {
        if (key) capacityRetryTurnsRef.current.add(key);
        return;
      }
      if (isCodexRetryTip(message)) {
        // A newer non-capacity retry supersedes the earlier capacity reason.
        if (key) capacityRetryTurnsRef.current.delete(key);
        return;
      }

      const isTerminalCapacity =
        isCodexCapacityTerminalError(message) ||
        Boolean(key && capacityRetryTurnsRef.current.has(key) && isCodexRetryExhaustionError(message));
      if (message.type === 'error' && key) capacityRetryTurnsRef.current.delete(key);
      if (!isTerminalCapacity) return;

      pauseConversationCommandQueue(message.conversation_id);
      if (!(configService.get('codex.autoContinueOnCapacity') ?? true) || !turnId || !key) return;

      pendingTurnsRef.current.set(key, {
        conversation_id: message.conversation_id,
        turn_id: turnId,
      });
    });

    const offCompleted = ipcBridge.conversation.turnCompleted.on((event: IConversationTurnCompletedEvent) => {
      const key = continuationKey(event.session_id, event.turn_id);
      capacityRetryTurnsRef.current.delete(key);
      const pending = pendingTurnsRef.current.get(key);
      if (pending) void continueWhenReleased(pending);
    });

    return () => {
      disposed = true;
      pendingTurnsRef.current.clear();
      continuingTurnsRef.current.clear();
      capacityRetryTurnsRef.current.clear();
      offResponse();
      offCompleted();
    };
  }, []);
}
