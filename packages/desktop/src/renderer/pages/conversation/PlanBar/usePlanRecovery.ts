/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { normalizeDbMessage, useUpdateMessageList } from '@renderer/pages/conversation/Messages/hooks';
import { useConversationRuntimeView } from '@renderer/pages/conversation/runtime/useConversationRuntimeView';
import { useEffect } from 'react';

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

  useEffect(() => {
    if (!conversation_id || !hydrated) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const recover = (attempt: number) => {
      void ipcBridge.database.getLatestConversationMessageOfType
        .invoke({ conversation_id, type: 'plan' })
        .then((message) => {
          if (cancelled) return;
          if (message) {
            const normalized = normalizeDbMessage(message);
            update((list) => {
              const index = list.findIndex((item) => item.id === normalized.id);
              if (index < 0) return list.concat(normalized);
              const existing = list[index];
              if (normalized.type !== 'plan' || existing.type !== 'plan') return list;
              if ((normalized.content.updated_at ?? 0) <= (existing.content.updated_at ?? 0)) return list;
              const next = list.slice();
              next[index] = normalized;
              return next;
            });
            return;
          }
          if (attempt < PLAN_RETRY_DELAYS_MS.length) {
            timer = setTimeout(() => recover(attempt + 1), PLAN_RETRY_DELAYS_MS[attempt]);
          }
        })
        .catch(() => {
          if (!cancelled && attempt < PLAN_RETRY_DELAYS_MS.length) {
            timer = setTimeout(() => recover(attempt + 1), PLAN_RETRY_DELAYS_MS[attempt]);
          }
        });
    };
    recover(0);
    const refresh = () => {
      if (!document.hidden) recover(0);
    };
    window.addEventListener('focus', refresh);
    window.addEventListener('online', refresh);

    return () => {
      window.removeEventListener('focus', refresh);
      window.removeEventListener('online', refresh);
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [conversation_id, hydrated, isProcessing, activeTurnId, update]);
};
