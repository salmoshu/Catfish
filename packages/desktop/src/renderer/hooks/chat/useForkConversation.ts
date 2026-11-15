/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { parseError } from '@/common/utils';
import { Message } from '@arco-design/web-react';
import { useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { emitter } from '@/renderer/utils/emitter';
import type { TFunction } from 'i18next';
import { findConfigOption, getOptionCurrentValue } from '@/renderer/hooks/agent/useAcpConfigOptions';

const pendingOperations = new Map<string, string>();

export type ForkConversationOptions = {
  targetAgentId?: string;
  modelId?: string;
  thoughtLevel?: string;
  mode?: string;
};

const applyForkConfiguration = async (conversationId: string, options: ForkConversationOptions): Promise<void> => {
  const runtime = await ipcBridge.conversation.ensureRuntime.invoke({ conversation_id: conversationId });
  const selections = [
    { category: 'model', fallbackIds: ['model'], value: options.modelId },
    { category: 'thought_level', fallbackIds: ['thought_level', 'reasoning_effort'], value: options.thoughtLevel },
    { category: 'mode', fallbackIds: ['mode'], value: options.mode },
  ];
  for (const selection of selections) {
    if (!selection.value) continue;
    const option = findConfigOption(runtime.config_options, selection.category, selection.fallbackIds);
    if (!option || (option.options.length > 0 && !option.options.some((choice) => choice.value === selection.value))) {
      throw new Error(`Unsupported fork ${selection.category} option`);
    }
    if (getOptionCurrentValue(option) === selection.value) continue;
    // Runtime writes are sequential because concurrent updates are rejected as config_update_in_progress.
    // eslint-disable-next-line no-await-in-loop
    await ipcBridge.acpConversation.setConfigOption.invoke({
      conversation_id: conversationId,
      option_id: option.id,
      value: selection.value,
    });
  }
};

/**
 * Map a fork API failure to a user-facing message. The backend carries stable
 * `FORK_*` reason prefixes (409/422); anything else falls back to the raw
 * parsed message.
 */
export function getForkErrorMessage(error: unknown, t: TFunction): string {
  const raw = parseError(error);
  if (raw.includes('FORK_TURN_IN_FLIGHT')) return t('messages.fork.errorTurnInFlight');
  if (raw.includes('FORK_PARENT_UNBOUND')) return t('messages.fork.errorParentUnbound');
  if (raw.includes('FORK_POINT_UNSUPPORTED')) return t('messages.fork.errorPointUnsupported');
  if (raw.includes('FORK_TARGET_UNAVAILABLE')) return t('messages.fork.errorTargetUnavailable');
  if (raw.includes('FORK_OPERATION_CONFLICT')) return t('messages.fork.errorOperationConflict');
  if (raw.includes('FORK_UNSUPPORTED')) return t('messages.fork.errorUnsupported');
  return t('messages.fork.errorGeneric', { message: raw });
}

/**
 * Fork the current conversation at a message: call the fork API, jump into the
 * forked conversation, and pre-warm its runtime so a backend-side fork failure
 * surfaces immediately instead of on the first send.
 */
export function useForkConversation(conversationId: string | undefined) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const forkingRef = useRef(false);

  return useCallback(
    async (messageId: string, options: ForkConversationOptions = {}) => {
      if (!conversationId || forkingRef.current) return;
      forkingRef.current = true;
      const { targetAgentId, modelId, thoughtLevel, mode } = options;
      const key = `${conversationId}:${messageId}:${JSON.stringify([targetAgentId, modelId, thoughtLevel, mode])}`;
      const operationId = pendingOperations.get(key) ?? crypto.randomUUID();
      pendingOperations.set(key, operationId);
      try {
        const forked = await ipcBridge.conversation.fork.invoke({
          conversation_id: conversationId,
          message_id: messageId,
          operation_id: operationId,
          ...(targetAgentId ? { target_agent_id: targetAgentId, continue_task: true } : {}),
        });
        if (!forked?.id) {
          throw new Error('fork returned no conversation');
        }
        pendingOperations.delete(key);
        emitter.emit('chat.history.refresh');
        void navigate(`/conversation/${forked.id}`);
        // Materialize the target before applying its runtime-specific options.
        if (modelId || thoughtLevel || mode) {
          void applyForkConfiguration(forked.id, options).catch((error) => {
            Message.error(t('messages.fork.configApplyFailed', { message: parseError(error) }));
          });
        } else {
          void ipcBridge.conversation.ensureRuntime.invoke({ conversation_id: forked.id }).catch((): void => undefined);
        }
      } catch (error) {
        console.error('Failed to fork conversation:', error);
        Message.error(getForkErrorMessage(error, t));
      } finally {
        forkingRef.current = false;
      }
    },
    [conversationId, navigate, t]
  );
}
