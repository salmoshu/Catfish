/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { IResponseMessage } from '@/common/adapter/ipcBridge';
import { isCodexCapacityRetryTip } from '@/common/chat/chatLib';
import { getConversationRuntimeViewSnapshot } from '@/renderer/pages/conversation/runtime/conversationRuntimeViewStore';
import { getConversationOrNull } from '@/renderer/pages/conversation/utils/conversationCache';
import { useEffect, useRef } from 'react';

/**
 * Codex retries a capacity error on its own, but retrying the same saturated
 * model cannot succeed. Without this the turn stays "running" for as long as
 * Codex keeps its retry loop alive, so a retry tip that names capacity cancels
 * the turn instead of waiting it out. Mounted globally (not per conversation)
 * so a stall in a background conversation still gets stopped.
 */

const resolveTurnId = async (message: IResponseMessage): Promise<string | null> => {
  if (message.turn_id) {
    return message.turn_id;
  }

  const activeTurnId = getConversationRuntimeViewSnapshot(message.conversation_id).activeTurnId;
  if (activeTurnId) {
    return activeTurnId;
  }

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
    const stopTurnOnce = async (message: IResponseMessage): Promise<void> => {
      const turn_id = await resolveTurnId(message);
      if (!turn_id) {
        return;
      }

      // Retry attempts share the turn but not the frame's msg_id, so the turn
      // is the identity that keeps one stall from firing a cancel per attempt.
      const stoppedKey = `${message.conversation_id}:${turn_id}`;
      if (stoppedTurnsRef.current.has(stoppedKey)) {
        return;
      }
      stoppedTurnsRef.current.add(stoppedKey);

      try {
        await ipcBridge.conversation.stop.invoke({ conversation_id: message.conversation_id, turn_id });
      } catch {
        // The turn may have ended between the retry tip and this cancel; the
        // backstop is best-effort and must never surface as a send failure.
      }
    };

    return ipcBridge.conversation.responseStream.on((message) => {
      if (!isCodexCapacityRetryTip(message)) {
        return;
      }
      void stopTurnOnce(message);
    });
  }, []);
}
