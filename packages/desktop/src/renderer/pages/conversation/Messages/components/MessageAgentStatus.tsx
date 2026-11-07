/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IMessageAgentStatus } from '@/common/chat/chatLib';
import { Badge, Typography } from '@arco-design/web-react';
import React from 'react';
import { useTranslation } from 'react-i18next';
import ButlerDiagnoseButton from '@/renderer/components/base/ButlerDiagnoseButton';
import FeedbackButton from '@/renderer/components/base/FeedbackButton';

const { Text } = Typography;

interface MessageAgentStatusProps {
  message: IMessageAgentStatus;
}

/**
 * Unified agent status message component for all ACP-based agents (Claude, Qwen, Codex, etc.)
 */
const MessageAgentStatus: React.FC<MessageAgentStatusProps> = ({ message }) => {
  const { t } = useTranslation();
  const { backend, status, agent_name } = message.content;

  // Resolve display name: explicit agent_name > capitalized backend.
  const display_name = agent_name || backend.charAt(0).toUpperCase() + backend.slice(1);

  // Hide disconnected status from historical messages (no longer emitted but may exist in DB)
  if ((status as string) === 'disconnected') return null;

  const getStatusBadge = () => {
    switch (status) {
      case 'connecting':
        return <Badge status='processing' text={t('acp.status.connecting', { agent: display_name })} />;
      case 'connected':
        return <Badge status='success' text={t('acp.status.connected', { agent: display_name })} />;
      case 'authenticated':
        return <Badge status='success' text={t('acp.status.authenticated', { agent: display_name })} />;
      case 'session_active':
        return <Badge status='success' text={t('acp.status.session_active', { agent: display_name })} />;
      case 'error':
        return <Badge status='error' text={t('acp.status.error')} />;
      default:
        return <Badge status='default' text={t('acp.status.unknown')} />;
    }
  };

  const isError = status === 'error';

  return (
    <div className='agent-status-message flex items-center gap-3 p-3 rounded-lg border border-[var(--color-border-2)] bg-fill-1 text-t-secondary'>
      <div className='flex items-center gap-2'>
        <Text style={{ fontWeight: 'bold' }} className='capitalize'>
          {display_name}
        </Text>
      </div>

      <div className='flex-1 flex items-center gap-6px'>
        {getStatusBadge()}
        {isError && (
          <>
            <ButlerDiagnoseButton errorText={`${display_name}: ${t('acp.status.error')}`} />
            <FeedbackButton module='conversation-session' />
          </>
        )}
      </div>
    </div>
  );
};

export default MessageAgentStatus;
