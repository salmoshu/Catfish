import { Button, Message, Spin, Tooltip } from '@arco-design/web-react';
import {
  Checklist,
  Delete,
  Down,
  Download,
  EditOne,
  FileText,
  FolderOpen,
  Link,
  Right,
  Search,
  Terminal,
  Time,
} from '@icon-park/react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ipcBridge } from '@/common';
import { getAcpImageFileName } from '@/common/chat/acpToolCallOutput';
import type { NormalizedToolCall, ToolAction, ToolDisplayStatus, ToolMessage } from '@/common/chat/normalizeToolCall';
import { getToolDisplayStatus, normalizeToolMessages, hasRunningToolMessages } from '@/common/chat/normalizeToolCall';
import LocalImageView from '@/renderer/components/media/LocalImageView';
import StructuredContent from '@/renderer/components/chat/StructuredContent';
import MessageFileChanges from '../MessageFileChanges';
import { parseFileChange } from '@/renderer/utils/file/diffUtils';
import { downloadFileFromPath } from '@/renderer/utils/file/download';
import { isAgentToolName } from '../../Workbench/workbenchActivity';
import { openWorkbenchSection } from '../../Workbench/workbenchActivityStore';
import './MessageToolGroupSummary.css';

const ACTION_LABELS: Record<ToolAction, string> = {
  read: 'Read file',
  edit: 'Edit file',
  write: 'Write file',
  execute: 'Run command',
  output: 'Read command output',
  search: 'Search',
  list: 'List files',
  fetch: 'Fetch page',
  delete: 'Delete file',
  wait: 'Wait for result',
};

const ACTION_ICONS: Record<ToolAction | 'other', React.ReactNode> = {
  read: <FileText size='16' />,
  edit: <EditOne size='16' />,
  write: <EditOne size='16' />,
  execute: <Terminal size='16' />,
  output: <Terminal size='16' />,
  search: <Search size='16' />,
  list: <FolderOpen size='16' />,
  fetch: <Link size='16' />,
  delete: <Delete size='16' />,
  wait: <Time size='16' />,
  other: <Checklist size='16' />,
};

const STATUS_LABELS: Record<ToolDisplayStatus, string> = {
  pending: 'Pending',
  running: 'Running',
  completed: 'Completed',
  error: 'Failed',
  canceled: 'Canceled',
  incomplete: 'Incomplete',
};

const ToolItemDetail: React.FC<{ item: NormalizedToolCall; isProcessing: boolean }> = ({ item, isProcessing }) => {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    if (!isProcessing) setExpanded(false);
  }, [isProcessing]);
  const [fullItem, setFullItem] = useState<NormalizedToolCall | null>(null);
  const [loadingFull, setLoadingFull] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const displayItem = fullItem ?? item;
  const displayStatus = getToolDisplayStatus(displayItem.status, isProcessing);
  const statusLabel = t(`messages.toolStatus.${displayStatus}`, { defaultValue: STATUS_LABELS[displayStatus] });
  const actionLabel = displayItem.action
    ? t(`messages.toolActions.${displayItem.action}`, { defaultValue: ACTION_LABELS[displayItem.action] })
    : displayItem.name === 'Tool'
      ? t('messages.toolActions.other', { defaultValue: 'Tool' })
      : displayItem.name;
  const needsAttention = ['error', 'canceled', 'incomplete'].includes(displayStatus);
  const hasDetail = Boolean(
    displayItem.input || displayItem.output || displayItem.diffs?.length || item.truncated || item.imagePath
  );
  const [messageApi, messageContext] = Message.useMessage();
  const handleDownloadImage = useCallback(
    async (path: string) => {
      try {
        await downloadFileFromPath(path, getAcpImageFileName(path));
        messageApi.success(t('acp.image.download_success'));
      } catch (error) {
        console.error('[MessageToolGroupSummary] Failed to download image:', error);
        messageApi.error(t('acp.image.download_error'));
      }
    },
    [messageApi, t]
  );

  const loadFullItem = async () => {
    if (!item.truncated || fullItem || loadingFull || !item.conversationId || !item.messageId) return;
    setLoadingFull(true);
    setLoadError(false);
    try {
      const message = await ipcBridge.database.getConversationMessage.invoke({
        conversation_id: item.conversationId,
        message_id: item.messageId,
      });
      const next = normalizeToolMessages([message as ToolMessage]).find((candidate) => candidate.key === item.key);
      if (next) setFullItem(next);
      else setLoadError(true);
    } catch {
      setLoadError(true);
    } finally {
      setLoadingFull(false);
    }
  };

  const toggleExpanded = () => {
    const nextExpanded = !expanded;
    setExpanded(nextExpanded);
    if (nextExpanded) {
      void loadFullItem();
      if (isAgentToolName(displayItem.name)) openWorkbenchSection('agents');
    }
  };

  const heading = (
    <>
      <span
        className={`tool-row__rail ${displayStatus === 'error' ? 'text-danger' : needsAttention ? 'text-warning' : ''}`}
        aria-label={statusLabel}
      >
        {displayStatus === 'running' ? <Spin size={12} /> : ACTION_ICONS[displayItem.action ?? 'other']}
      </span>
      <span className='tool-row__heading'>
        <span className='tool-row__name'>{actionLabel}</span>
        {displayItem.description && displayItem.description !== actionLabel && (
          <span className='tool-row__description' title={displayItem.description}>
            {displayItem.description}
          </span>
        )}
      </span>
      {needsAttention && (
        <span className={`shrink-0 text-12px ${displayStatus === 'error' ? 'text-danger' : 'text-warning'}`}>
          {statusLabel}
        </span>
      )}
      {hasDetail && (
        <span className={`tool-row__chevron${expanded ? ' tool-row__chevron--open' : ''}`}>
          <Down size='12' />
        </span>
      )}
    </>
  );

  return (
    <div className='tool-row'>
      {messageContext}
      {hasDetail ? (
        <Button type='text' className='tool-row__button' aria-expanded={expanded} onClick={toggleExpanded}>
          {heading}
        </Button>
      ) : (
        <div className='tool-row__button tool-row__button--static'>{heading}</div>
      )}
      {expanded && hasDetail && (
        <div className='tool-detail-panel'>
          {loadingFull && (
            <div className='tool-detail-label'>{t('common.loading', { defaultValue: 'Loading...' })}</div>
          )}
          {loadError && (
            <div className='tool-detail-label'>
              {t('messages.toolGroup.loadFailed', { defaultValue: 'Failed to load full output' })}
            </div>
          )}
          {displayItem.input && (
            <div className='tool-detail-section'>
              <div className='tool-detail-label'>{t('messages.toolGroup.input', { defaultValue: 'Input' })}</div>
              <StructuredContent value={displayItem.input} />
            </div>
          )}
          {displayItem.diffs && displayItem.diffs.length > 0 && (
            <MessageFileChanges
              diffsChanges={displayItem.diffs.map((diff) => parseFileChange(diff.path, diff.old_text, diff.new_text))}
            />
          )}
          {displayItem.output && (
            <div className='tool-detail-section'>
              <div className='tool-detail-label'>{t('messages.toolGroup.output', { defaultValue: 'Output' })}</div>
              <StructuredContent value={displayItem.output} />
            </div>
          )}
        </div>
      )}
      {item.imagePath && (
        <div className='group relative ml-28px mt-8px overflow-hidden rounded-12px border bg-1 p-2 max-w-280px'>
          <LocalImageView
            src={item.imagePath}
            alt={item.imagePath.split(/[/\\]/).pop() || t('acp.image.generated_alt')}
            className='max-w-full max-h-320px object-contain rounded-8px'
          />
          <Tooltip content={t('acp.image.download')}>
            <Button
              aria-label={t('acp.image.download_aria')}
              className='!absolute end-10px top-10px !h-28px !w-28px !p-0 opacity-0 shadow-sm transition-opacity group-hover:opacity-90 focus:opacity-100'
              type='secondary'
              size='mini'
              shape='circle'
              icon={<Download theme='outline' size='14' />}
              onClick={() => void handleDownloadImage(item.imagePath)}
            />
          </Tooltip>
        </div>
      )}
    </div>
  );
};

const MessageToolGroupSummary: React.FC<{
  messages: ToolMessage[];
  isProcessing?: boolean;
  variant?: 'group' | 'step';
}> = ({ messages, isProcessing = true, variant = 'group' }) => {
  const { t } = useTranslation();
  const hasRunning = isProcessing && hasRunningToolMessages(messages);
  const [showMore, setShowMore] = useState(isProcessing);

  useEffect(() => {
    setShowMore(isProcessing);
  }, [isProcessing]);

  const tools = useMemo(() => normalizeToolMessages(messages), [messages]);

  if (tools.length === 0) return null;
  if (variant === 'step') {
    return (
      <div className='tool-group-summary'>
        {tools.map((item) => (
          <ToolItemDetail key={item.key} item={item} isProcessing={isProcessing} />
        ))}
      </div>
    );
  }

  return (
    <div className='tool-group-summary' data-processing={hasRunning ? 'true' : 'false'}>
      <Button
        type='text'
        className='tool-group-summary__header'
        aria-expanded={showMore}
        onClick={() => setShowMore((current) => !current)}
      >
        <span className='tool-group-summary__icon'>
          {hasRunning ? <Spin size={12} data-testid='tool-group-running' /> : <Checklist theme='outline' size='14' />}
        </span>
        <span className='tool-group-summary__label'>
          {t('messages.toolGroup.viewSteps', { count: tools.length, defaultValue: 'View Steps · {{count}}' })}
        </span>
        <span className={`tool-group-summary__arrow${showMore ? ' tool-group-summary__arrow--open' : ''}`}>
          <Right theme='outline' size='12' />
        </span>
      </Button>
      {showMore && (
        <div className='tool-group-summary__body'>
          {tools.map((item) => (
            <ToolItemDetail key={item.key} item={item} isProcessing={isProcessing} />
          ))}
        </div>
      )}
    </div>
  );
};

export default React.memo(MessageToolGroupSummary);
