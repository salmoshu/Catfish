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
const PLAN_RETRY_DELAYS_MS = [250, 750];

export const usePlanRecovery = (conversation_id: string): void => {
  const update = useUpdateMessageList();
  const { hydrated, isProcessing, activeTurnId } = useConversationRuntimeView(conversation_id);
  const requestedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!conversation_id || !hydrated) return;
    const requestKey = `${conversation_id}:${activeTurnId ?? 'idle'}`;
    if (requestedRef.current === requestKey) return;
    requestedRef.current = requestKey;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const recover = (attempt: number) => {
      void ipcBridge.database.getLatestConversationMessageOfType
        .invoke({ conversation_id, type: 'plan' })
        .then((message) => {
          if (cancelled) return;
          if (message) {
            const normalized = normalizeDbMessage(message);
            update((list) => (list.some((item) => item.id === normalized.id) ? list : list.concat(normalized)));
            return;
          }
          if (attempt < PLAN_RETRY_DELAYS_MS.length) {
            timer = setTimeout(() => recover(attempt + 1), PLAN_RETRY_DELAYS_MS[attempt]);
          } else {
            requestedRef.current = null;
          }
        })
        .catch(() => {
          if (!cancelled) requestedRef.current = null;
        });
    };
    recover(0);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [conversation_id, hydrated, isProcessing, activeTurnId, update]);
};
