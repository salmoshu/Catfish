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

/** A temporary agent conversation retained while hidden and deleted when closed. */
const SideChatPanel: React.FC<{ workspace?: string }> = ({ workspace }) => {
  const { t } = useTranslation();
  const conversationNameRef = useRef(t('conversation.welcome.newConversation'));
  const { selectedAssistant, selectedAssistantId, selectedAssistantBackend } = useGuidAssistantSelection({});
  const [conversation, setConversation] = useState<TChatConversation | null>(null);
  const conversationIdRef = useRef<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!selectedAssistantId) return;
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
  }, [selectedAssistantId, workspace, attempt]);

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
  return (
    <AcpChat
      conversation_id={conversation.id}
      workspace={workspace}
      backend={selectedAssistantBackend || 'kimi'}
      agent_name={selectedAssistant?.name}
      assistantId={selectedAssistantId ?? undefined}
    />
  );
};

export default SideChatPanel;
