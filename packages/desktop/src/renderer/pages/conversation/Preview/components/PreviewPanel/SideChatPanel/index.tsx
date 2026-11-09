/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { TChatConversation } from '@/common/config/storage';
import { Button, Spin } from '@arco-design/web-react';
import { useTranslation } from 'react-i18next';
import React, { useEffect, useRef, useState } from 'react';
import AcpChat from '@/renderer/pages/conversation/platforms/acp/AcpChat';
import { useGuidAssistantSelection } from '@/renderer/pages/guid/hooks/useGuidAssistantSelection';
import AcpModelSelector from '@/renderer/components/agent/AcpModelSelector';
import { getConversationOrNull } from '@/renderer/pages/conversation/utils/conversationCache';
import styles from './SideChatPanel.module.css';

/** A temporary agent conversation retained while hidden and deleted when closed. */
const SideChatPanel: React.FC<{ workspace?: string; sourceConversationId?: string }> = ({
  workspace,
  sourceConversationId,
}) => {
  const { t } = useTranslation();
  const conversationNameRef = useRef(t('conversation.welcome.newConversation'));
  // The side chat keeps its original settings when the main conversation changes.
  const [initialSourceId] = useState(sourceConversationId);
  const [sourceConversation, setSourceConversation] = useState<TChatConversation | null>(null);
  const [sourceLoading, setSourceLoading] = useState(Boolean(initialSourceId));
  const sourceExtra = sourceConversation?.extra as
    | { current_model_id?: string; thought_level?: string; preset_assistant_id?: string }
    | undefined;
  const sourceAssistantId = sourceConversation?.assistant?.id ?? sourceExtra?.preset_assistant_id;
  const { selectedAssistant, selectedAssistantId, selectedAssistantBackend, assistants } = useGuidAssistantSelection({
    preselectAssistantId: sourceAssistantId,
    locationKey: initialSourceId,
  });
  const waitingForSourceAssistant = Boolean(
    sourceAssistantId &&
    assistants.some((assistant) => assistant.id === sourceAssistantId) &&
    selectedAssistantId !== sourceAssistantId
  );
  const [conversation, setConversation] = useState<TChatConversation | null>(null);
  const conversationIdRef = useRef<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    if (!initialSourceId) {
      setSourceConversation(null);
      setSourceLoading(false);
      return;
    }
    setSourceLoading(true);
    void getConversationOrNull(initialSourceId)
      .then((source) => {
        if (!cancelled) setSourceConversation(source);
      })
      .catch(() => {
        if (!cancelled) setSourceConversation(null);
      })
      .finally(() => {
        if (!cancelled) setSourceLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [initialSourceId]);

  useEffect(() => {
    if (!selectedAssistantId || sourceLoading || waitingForSourceAssistant) return;
    let cancelled = false;
    setConversation(null);
    setError(null);
    const removeConversation = (id: string): void => {
      void ipcBridge.conversation.remove.invoke({ id }).catch(() => {});
    };
    void ipcBridge.conversation.create
      .invoke({
        name: conversationNameRef.current,
        assistant: { id: selectedAssistantId },
        extra: {
          workspace,
          custom_workspace: Boolean(workspace),
          is_temporary_workspace: true,
          side_chat: true,
          ...(sourceExtra?.current_model_id ? { current_model_id: sourceExtra.current_model_id } : {}),
          ...(sourceExtra?.thought_level ? { thought_level: sourceExtra.thought_level } : {}),
        },
      })
      .then((created) => {
        if (cancelled) {
          removeConversation(created.id);
          return;
        }
        conversationIdRef.current = created.id;
        setConversation(created);
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : String(reason));
      });
    return () => {
      cancelled = true;
      if (conversationIdRef.current) {
        removeConversation(conversationIdRef.current);
        conversationIdRef.current = null;
      }
    };
  }, [
    selectedAssistantId,
    waitingForSourceAssistant,
    sourceExtra?.current_model_id,
    sourceExtra?.thought_level,
    sourceLoading,
    workspace,
    attempt,
  ]);

  if (error) {
    return (
      <div
        role='alert'
        className='m-16px p-16px rounded-12px border border-[var(--color-border-2)] bg-fill-1 text-t-primary'
      >
        <p className='mb-12px text-13px break-words'>{error}</p>
        <Button size='small' onClick={() => setAttempt((value) => value + 1)}>
          {t('common.retry')}
        </Button>
      </div>
    );
  }
  if (!conversation) return <Spin className='m-24px' />;
  const createdExtra = conversation.extra as { current_model_id?: string; thought_level?: string } | undefined;
  const modelSelector = (
    <AcpModelSelector
      conversation_id={conversation.id}
      backend={selectedAssistantBackend}
      initialModelId={createdExtra?.current_model_id}
      initialThoughtLevel={createdExtra?.thought_level}
    />
  );
  return (
    <div className={styles.panel} data-side-chat-composer>
      <AcpChat
        conversation_id={conversation.id}
        workspace={workspace}
        backend={selectedAssistantBackend || 'kimi'}
        agent_name={selectedAssistant?.name}
        assistantId={selectedAssistantId ?? undefined}
        composerTools={modelSelector}
      />
    </div>
  );
};

export default SideChatPanel;
