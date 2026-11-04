/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { normalizeDbMessage, useUpdateMessageList } from '@renderer/pages/conversation/Messages/hooks';
import { useConversationRuntimeView } from '@renderer/pages/conversation/runtime/useConversationRuntimeView';
import { useEffect, useRef } from 'react';

/**
 * Restore the conversation's latest plan when it is reopened.
 *
 * The paginated message load is not enough: `upsert_message` does not refresh
 * `created_at`, so a plan row stays anchored at the START of its turn and a turn
 * with many tool calls buries it outside the default page. The plan persists
 * across turns (and across an abort followed by a continuation), so recovery
 * runs regardless of whether a turn is currently running.
 *
 * Gated on `hydrated` — the runtime view resolves asynchronously, and firing
 * before it settles would query with stale conversation context.
 */
export const usePlanRecovery = (conversation_id: string): void => {
  const update = useUpdateMessageList();
  const { hydrated } = useConversationRuntimeView(conversation_id);
  const requestedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!conversation_id || !hydrated) return;
    if (requestedRef.current === conversation_id) return;
    requestedRef.current = conversation_id;

    let cancelled = false;
    void ipcBridge.database.getLatestConversationMessageOfType
      .invoke({ conversation_id, type: 'plan' })
      .then((message) => {
        if (cancelled || !message) return;
        const normalized = normalizeDbMessage(message);
        update((list) => (list.some((item) => item.id === normalized.id) ? list : list.concat(normalized)));
      })
      .catch(() => {
        // Best-effort: the bar still fills in from the next live plan frame, and
        // clearing the latch lets a later mount retry.
        requestedRef.current = null;
      });

    return () => {
      cancelled = true;
    };
  }, [conversation_id, hydrated, update]);
};
