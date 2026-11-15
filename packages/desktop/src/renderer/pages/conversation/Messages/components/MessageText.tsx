/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IMessageText } from '@/common/chat/chatLib';
import { parseFileMarker, resolveMessageFilePath } from './fileMarker';
import SessionMentionAction from './SessionMentionAction';
import { parseSessionMessageBlock, parseSessionsBlock } from './sessionMarkers';
import { useConversationContextSafe } from '@/renderer/hooks/context/ConversationContext';
import { useLayoutContext } from '@/renderer/hooks/context/LayoutContext';
import { useLocalFilePreview } from '@/renderer/pages/conversation/Preview/hooks/useLocalFilePreview';
import { Alert, Button, Dropdown, Menu, Message, Tooltip } from '@arco-design/web-react';
import { Copy, People } from '@icon-park/react';
import styles from './MessageText.module.css';
import classNames from 'classnames';
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { copyText } from '@/renderer/utils/ui/clipboard';
import StructuredContent from '@renderer/components/chat/StructuredContent';
import FilePreview from '@renderer/components/media/FilePreview';
import HorizontalFileList from '@renderer/components/media/HorizontalFileList';
import MarkdownView from '@renderer/components/Markdown';
import { stripThinkTags, hasThinkTags } from '@renderer/utils/chat/thinkTagFilter';
import { buildTurnClipboardText } from '@renderer/utils/chat/turnCopy';
import { stripSkillSuggest, hasSkillSuggest } from '@renderer/utils/chat/skillSuggestParser';
import { isForkEnabled } from '@/common/chat/forkConversation';
import { useForkConversation } from '@/renderer/hooks/chat/useForkConversation';
import ForkBranchIcon from '@renderer/components/base/ForkBranchIcon';
import ForkConversationDialog from './ForkConversationDialog';

/** Format a message timestamp with its full local date and time. */
export const formatMessageTime = (timestamp: number): string => {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}`;
};
import MessageCronBadge from './MessageCronBadge';
import { resolveAgentLogo, useAgentLogos } from '@/renderer/utils/model/agentLogo';
import TeammateMessageAvatar from './TeammateMessageAvatar';

const CODE_STYLE = { marginTop: 4, marginBlock: 4 };

type TeamContextResetNotice = {
  kind: 'context_reset';
  member_name: string;
  runtime_status: 'ready' | 'failed';
};

export const parseTeamContextResetNotice = (content: string): TeamContextResetNotice | null => {
  try {
    const value = JSON.parse(content) as Record<string, unknown>;
    if (
      value.kind === 'context_reset' &&
      typeof value.member_name === 'string' &&
      (value.runtime_status === 'ready' || value.runtime_status === 'failed')
    ) {
      return value as TeamContextResetNotice;
    }
  } catch {
    // Ordinary teammate/system text is not a semantic notice.
  }
  return null;
};

const useFormatContent = (content: string) => {
  return useMemo(() => {
    try {
      const json = JSON.parse(content);
      const isJson = typeof json === 'object';
      return {
        json: isJson,
        data: isJson ? json : content,
      };
    } catch {
      return { data: content };
    }
  }, [content]);
};

/**
 * Hover-revealed copy + fork + timestamp row. Kept separate from the text
 * bubble so a turn whose LAST item is a tool/file summary can render the same
 * row after that summary instead of leaving it between the text and the tools.
 */
export const MessageTextActions: React.FC<{
  message: IMessageText;
  /** Every text segment of the turn; when present, copying uses the whole turn. */
  turnTexts?: string[];
  /** Copy payload for a single message (used when no turn segments are given). */
  fallbackCopyText: string;
  isUserMessage?: boolean;
  isLastMessage?: boolean;
  hasForkAnchor?: boolean;
}> = ({
  message,
  turnTexts,
  fallbackCopyText,
  isUserMessage = false,
  isLastMessage = false,
  hasForkAnchor = false,
}) => {
  const { t } = useTranslation();
  const [showCopyAlert, setShowCopyAlert] = useState(false);
  const [forkDialogMode, setForkDialogMode] = useState<'current' | 'agent' | null>(null);
  const [forkLoading, setForkLoading] = useState(false);
  const conversationContext = useConversationContextSafe();
  const forkConversation = useForkConversation(conversationContext?.conversation_id);
  const layout = useLayoutContext();
  const isMobile = layout?.isMobile ?? false;

  // Mobile has no hover affordance, so the row is dropped entirely — system-
  // level long-press still copies.
  if (isMobile) return null;

  const handleCopy = () => {
    const textToCopy = turnTexts?.length ? buildTurnClipboardText(turnTexts) : fallbackCopyText;
    copyText(textToCopy)
      .then(() => {
        setShowCopyAlert(true);
        setTimeout(() => setShowCopyAlert(false), 2000);
      })
      .catch(() => {
        Message.error(t('common.copyFailed'));
      });
  };

  const showForkButton = isForkEnabled(conversationContext?.forkCapability, {
    isLastMessage,
    hasTurnAnchor: hasForkAnchor,
  });

  return (
    <>
      <div
        className={classNames('h-32px flex items-center mt-4px gap-8px', {
          'flex-row-reverse': isUserMessage,
        })}
      >
        <Tooltip content={t('common.copy', { defaultValue: 'Copy' })}>
          <Button
            type='text'
            size='mini'
            aria-label={t('common.copy', { defaultValue: 'Copy' })}
            className='p-4px rd-4px !text-t-secondary hover:!text-t-primary hover:!bg-fill-2 transition-colors opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto focus-within:opacity-100 focus-within:pointer-events-auto'
            onClick={handleCopy}
            icon={<Copy theme='outline' size='16' fill='currentColor' />}
          />
        </Tooltip>
        {showForkButton && (
          <Dropdown
            trigger={['hover', 'click']}
            position='bottom'
            droplist={
              <Menu
                onClickMenuItem={(key) => {
                  if (key === 'current') setForkDialogMode('current');
                  if (key === 'agent') setForkDialogMode('agent');
                }}
              >
                <Menu.Item key='current'>
                  <ForkBranchIcon size={14} fill='currentColor' /> {t('messages.fork.action')}
                </Menu.Item>
                <Menu.Item key='agent'>
                  <People size={14} /> {t('messages.fork.toAnotherAgent')}
                </Menu.Item>
              </Menu>
            }
          >
            <Button
              type='text'
              size='mini'
              aria-label={t('messages.fork.action')}
              className='p-4px rd-4px !text-t-secondary hover:!text-t-primary hover:!bg-fill-2 transition-colors opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto focus-within:opacity-100 focus-within:pointer-events-auto'
              loading={forkLoading}
              aria-haspopup='menu'
              data-testid='message-fork-button'
              icon={<ForkBranchIcon size={16} fill='currentColor' />}
            />
          </Dropdown>
        )}
        {message.created_at && (
          <span className='text-12px text-t-secondary opacity-0 group-hover:opacity-100 transition-opacity select-none'>
            {formatMessageTime(message.created_at)}
          </span>
        )}
      </div>
      {forkDialogMode !== null && (
        <ForkConversationDialog
          sourceBackend={conversationContext?.backend}
          sourceAssistantId={conversationContext?.assistantId}
          defaultToAnotherAgent={forkDialogMode === 'agent'}
          submitting={forkLoading}
          onCancel={() => setForkDialogMode(null)}
          onSubmit={(options) => {
            setForkDialogMode(null);
            setForkLoading(true);
            void forkConversation(message.msg_id ?? message.id, options).finally(() => setForkLoading(false));
          }}
        />
      )}
      {showCopyAlert && (
        <Alert
          type='success'
          content={t('messages.copySuccess')}
          showIcon
          className='fixed top-20px left-50% transform -translate-x-50% z-9999 w-max max-w-[80%]'
          style={{ boxShadow: 'var(--shadow-card)' }}
          closable={false}
        />
      )}
    </>
  );
};

const MessageText: React.FC<{
  message: IMessageText;
  showCopyRow?: boolean;
  isLastMessage?: boolean;
  hasForkAnchor?: boolean;
  /** All text segments of this message's turn, in order — the copy button
   * copies the whole reply, not just the segment it happens to sit on. */
  turnTexts?: string[];
}> = ({ message, showCopyRow = true, isLastMessage = false, hasForkAnchor = false, turnTexts }) => {
  const logos = useAgentLogos();
  // Filter think tags from content before rendering
  // 在渲染前过滤 think 标签
  const contentToRender = useMemo(() => {
    let content = message.content.content;
    if (typeof content === 'string') {
      if (hasThinkTags(content)) {
        content = stripThinkTags(content);
      }
      // Strip any inline [SKILL_SUGGEST] blocks (now handled via separate skill_suggest message type)
      if (hasSkillSuggest(content)) {
        content = stripSkillSuggest(content);
      }
      return content;
    }
    return content;
  }, [message.content.content]);

  const { t } = useTranslation();
  const isUserMessage = message.position === 'right';
  // Delivered-but-not-yet-consumed marker for messages sent mid-turn to a
  // supporting backend (claude/codex). The message already reached the
  // server (it's rendered); this only answers "has the agent picked it up
  // yet" — an IM delivered/read style badge, never a ghost/dashed bubble.
  const isPendingDelivery = isUserMessage && message.status === 'pending';
  const isTeammateMessage = message.position === 'left' && message.content.teammateMessage === true;
  const senderName = message.content.senderName;
  const senderAgentType = message.content.senderAgentType;
  const senderConversationId = message.content.senderConversationId;
  const { text, files } = useMemo(
    () => parseFileMarker(contentToRender, isUserMessage),
    [contentToRender, isUserMessage]
  );
  // Cross-session markers. Both live on USER messages: the sender-side
  // `[[AION_SESSIONS]]` block is appended to the user's own message, and a
  // delivery is persisted as a user message too. Not parsing them would show
  // raw marker text in a bubble.
  const { text: textWithoutMentions, sessions: mentionedSessions } = useMemo(
    () => (isUserMessage ? parseSessionsBlock(text) : { text, sessions: [] }),
    [isUserMessage, text]
  );
  const { text: visibleText, source: deliverySource } = useMemo(
    () => (isUserMessage ? parseSessionMessageBlock(textWithoutMentions) : { text: textWithoutMentions, source: null }),
    [isUserMessage, textWithoutMentions]
  );
  const contextResetNotice = useMemo(
    () => (isTeammateMessage && senderName === 'team_system' ? parseTeamContextResetNotice(text) : null),
    [isTeammateMessage, senderName, text]
  );
  const renderedText = contextResetNotice
    ? t(
        contextResetNotice.runtime_status === 'ready'
          ? 'team.systemNotice.contextResetSuccess'
          : 'team.systemNotice.contextResetRuntimeFailed',
        { memberName: contextResetNotice.member_name }
      )
    : visibleText;
  const { data, json } = useFormatContent(renderedText);
  const shouldRenderPlainText = isUserMessage || Boolean(contextResetNotice);
  const conversationContext = useConversationContextSafe();
  const handleLocalFileLink = useLocalFilePreview(conversationContext?.workspace);
  const resolvedFiles = useMemo(
    () => files.map((file_path) => resolveMessageFilePath(file_path, conversationContext?.workspace)),
    [conversationContext?.workspace, files]
  );

  // 过滤空内容，避免渲染空DOM
  if (!message.content.content || (typeof message.content.content === 'string' && !message.content.content.trim())) {
    return null;
  }

  const baseText = shouldRenderPlainText ? renderedText : json ? JSON.stringify(data, null, 2) : renderedText;
  const fileList = files.length ? `Files:\n${files.map((path) => `- ${path}`).join('\n')}\n\n` : '';

  const cronMeta = message.content.cronMeta;
  const displaySenderName = senderName === 'team_system' ? t('team.systemNotice.sender') : senderName;
  const fallbackBackendLogo = senderAgentType ? resolveAgentLogo(logos, { backend: senderAgentType }) : null;

  return (
    <>
      <div className={classNames('min-w-0 flex flex-col group', isUserMessage ? 'items-end' : 'items-start')}>
        {cronMeta && <MessageCronBadge meta={cronMeta} />}
        {isTeammateMessage && displaySenderName && (
          <div className='flex items-center gap-6px mb-4px'>
            <TeammateMessageAvatar
              senderName={displaySenderName}
              senderConversationId={senderConversationId}
              backendLogo={fallbackBackendLogo}
            />
            <span className='text-12px text-t-secondary'>{displaySenderName}</span>
          </div>
        )}
        {deliverySource && (
          <div
            className={classNames('mb-4px flex items-center gap-4px text-12px text-t-secondary', {
              'self-end': isUserMessage,
            })}
          >
            <SessionMentionAction
              id={deliverySource.fromId}
              name={deliverySource.fromName || deliverySource.fromId}
              label={t('conversation.crossSession.fromBadge', {
                name: deliverySource.fromName || deliverySource.fromId,
                defaultValue: 'From conversation {{name}}',
              })}
            />
            {deliverySource.workspace && deliverySource.workspace !== 'same' && (
              <span
                className='px-4px rounded-4px'
                style={{ background: 'var(--color-fill-2)' }}
                title={deliverySource.workspace}
              >
                {t('conversation.crossSession.otherWorkspace', { defaultValue: 'different workspace' })}
              </span>
            )}
          </div>
        )}
        {mentionedSessions.length > 0 && (
          <div className={classNames('mb-4px flex flex-wrap gap-4px', { 'self-end': isUserMessage })}>
            {mentionedSessions.map((session) => (
              <SessionMentionAction
                key={session.id}
                id={session.id}
                name={session.name}
                label={`@@${session.name}`}
                title={session.workspace}
                chip
              />
            ))}
          </div>
        )}
        {files.length > 0 && (
          <div className={classNames('mt-6px min-w-0 max-w-full', { 'self-end': isUserMessage })}>
            {resolvedFiles.length === 1 ? (
              <div className='flex items-center'>
                <FilePreview path={resolvedFiles[0]} onRemove={() => undefined} readonly />
              </div>
            ) : (
              <HorizontalFileList>
                {resolvedFiles.map((path) => (
                  <FilePreview key={path} path={path} onRemove={() => undefined} readonly />
                ))}
              </HorizontalFileList>
            )}
          </div>
        )}
        <div
          className={classNames('min-w-0 [&>p:first-child]:mt-0px [&>p:last-child]:mb-0px', styles.bubble, {
            [styles.user]: isUserMessage || cronMeta,
            [styles.teammate]: isTeammateMessage,
            [styles.assistant]: !(isUserMessage || cronMeta || isTeammateMessage),
          })}
        >
          {shouldRenderPlainText ? (
            <div className='whitespace-pre-wrap [overflow-wrap:anywhere]' data-testid='message-text-content'>
              {renderedText}
            </div>
          ) : json ? (
            <div data-testid='message-text-content'>
              <StructuredContent value={data} />
            </div>
          ) : (
            <div data-testid='message-text-content'>
              <MarkdownView codeStyle={CODE_STYLE} onLocalFileLink={handleLocalFileLink}>
                {data}
              </MarkdownView>
            </div>
          )}
        </div>
        {isPendingDelivery && (
          <div className='text-12px text-t-secondary mt-4px select-none' data-testid='message-status-badge'>
            {t('messages.delivery.pending', { defaultValue: 'Unread' })}
          </div>
        )}
        {/* For AI replies split across several text messages, only the turn's
            action anchor shows this row (showCopyRow); user messages always do. */}
        {showCopyRow && (
          <MessageTextActions
            message={message}
            turnTexts={turnTexts}
            fallbackCopyText={fileList + baseText}
            isUserMessage={isUserMessage}
            isLastMessage={isLastMessage}
            hasForkAnchor={hasForkAnchor}
          />
        )}
      </div>
    </>
  );
};

export default MessageText;
