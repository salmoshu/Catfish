/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { TChatConversation } from '@/common/config/storage';
import { Spin } from '@arco-design/web-react';
import React, { useEffect, useRef, useState } from 'react';
import AcpChat from '@/renderer/pages/conversation/platforms/acp/AcpChat';
import { useGuidAssistantSelection } from '@/renderer/pages/guid/hooks/useGuidAssistantSelection';

/** A real agent chat whose backend conversation is deleted when its preview tab closes. */
const SideChatPanel: React.FC<{ workspace?: string }> = ({ workspace }) => {
  const { selectedAssistant, selectedAssistantId, selectedAssistantBackend } = useGuidAssistantSelection({});
  const [conversation, setConversation] = useState<TChatConversation | null>(null);
  const conversationIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!selectedAssistantId) return;
    let cancelled = false;
    setConversation(null);
    void ipcBridge.conversation.create
      .invoke({
        name: 'Side Chat',
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
          void ipcBridge.conversation.remove.invoke({ id: created.id });
          return;
        }
        conversationIdRef.current = created.id;
        setConversation(created);
      });
    return () => {
      cancelled = true;
      if (conversationIdRef.current) {
        void ipcBridge.conversation.remove.invoke({ id: conversationIdRef.current });
        conversationIdRef.current = null;
      }
    };
  }, [selectedAssistantId, workspace]);

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
