import type { BadgeProps } from '@arco-design/web-react';
import { Badge, Button, Message, Spin, Tooltip } from '@arco-design/web-react';
import { Checklist, Down, Download, Right } from '@icon-park/react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ipcBridge } from '@/common';
import { getAcpImageFileName } from '@/common/chat/acpToolCallOutput';
import type { NormalizedToolCall, NormalizedToolStatus, ToolMessage } from '@/common/chat/normalizeToolCall';
import { normalizeToolMessages, hasRunningToolMessages } from '@/common/chat/normalizeToolCall';
import LocalImageView from '@/renderer/components/media/LocalImageView';
import { downloadFileFromPath } from '@/renderer/utils/file/download';
import { isAgentToolName } from '../../Workbench/workbenchActivity';
import { openWorkbenchSection } from '../../Workbench/workbenchActivityStore';
import './MessageToolGroupSummary.css';

const statusToBadge = (status: NormalizedToolStatus): BadgeProps['status'] => {
  switch (status) {
    case 'completed':
      return 'success';
    case 'error':
      return 'error';
    case 'running':
      return 'processing';
    case 'canceled':
      return 'default';
    case 'pending':
    default:
      return 'default';
  }
};

const ToolItemDetail: React.FC<{ item: NormalizedToolCall; isProcessing: boolean }> = ({ item, isProcessing }) => {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const [fullItem, setFullItem] = useState<NormalizedToolCall | null>(null);
  const [loadingFull, setLoadingFull] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const displayItem = fullItem ?? item;
  const hasDetail = Boolean(displayItem.input || displayItem.output || item.truncated || item.imagePath);
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
      <span className='tool-row__rail'>
        <Badge
          status={statusToBadge(isProcessing ? item.status : 'completed')}
          className={isProcessing && item.status === 'running' ? 'badge-breathing' : ''}
        />
      </span>
      <span className='tool-row__heading'>
        <span className='tool-row__name'>{displayItem.name}</span>
        {displayItem.description && displayItem.description !== displayItem.name && (
          <span className='tool-row__description'>{displayItem.description}</span>
        )}
      </span>
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
              <pre className='tool-detail-content'>{displayItem.input}</pre>
            </div>
          )}
          {displayItem.output && (
            <div className='tool-detail-section'>
              <div className='tool-detail-label'>{t('messages.toolGroup.output', { defaultValue: 'Output' })}</div>
              <pre className='tool-detail-content'>{displayItem.output}</pre>
            </div>
          )}
        </div>
      )}
      {item.imagePath && (
        <div className='group relative ml-28px mt-8px overflow-hidden rounded-12px border bg-1 p-2 max-w-280px'>
          <LocalImageView
            src={item.imagePath}
            alt={getAcpImageFileName(item.imagePath)}
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

const MessageToolGroupSummary: React.FC<{ messages: ToolMessage[]; isProcessing?: boolean }> = ({
  messages,
  isProcessing = true,
}) => {
  const { t } = useTranslation();
  const hasRunning = isProcessing && hasRunningToolMessages(messages);
  const [showMore, setShowMore] = useState(hasRunning);

  useEffect(() => {
    if (hasRunning) setShowMore(true);
  }, [hasRunning]);

  const tools = useMemo(() => normalizeToolMessages(messages), [messages]);

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
