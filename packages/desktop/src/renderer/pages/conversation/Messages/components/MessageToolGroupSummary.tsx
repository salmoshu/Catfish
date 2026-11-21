import { Button, Message, Spin, Tooltip } from '@arco-design/web-react';
import {
  Caution,
  CheckSmall,
  Checklist,
  CloseSmall,
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
import StructuredContent, { parseStructuredValue } from '@/renderer/components/chat/StructuredContent';
import { usePreviewLauncher } from '@/renderer/hooks/file/usePreviewLauncher';
import { getFileTypeInfo } from '@/renderer/utils/file/fileType';
import { extractContentFromDiff, parseFileChange, type FileChangeInfo } from '@/renderer/utils/file/diffUtils';
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

const basename = (path: string): string => path.split(/[/\\]/).findLast((part) => part.length > 0) ?? path;

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;

const stringValue = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() ? value.trim() : undefined;

/** Unified-diff body without the git/file headers the row already shows. */
const diffBodyLines = (diff: string): string[] =>
  diff.split('\n').filter((line) => {
    if (!line) return false;
    if (line.startsWith('diff --git')) return false;
    if (line.startsWith('index ')) return false;
    if (line.startsWith('--- ')) return false;
    if (line.startsWith('+++ ')) return false;
    if (line.startsWith('\\')) return false;
    return true;
  });

const DiffCounts: React.FC<{ insertions: number; deletions: number }> = ({ insertions, deletions }) =>
  insertions + deletions > 0 ? (
    <span className='tool-row__counts'>
      {insertions > 0 && <span className='tool-row__additions'>+{insertions}</span>}
      {deletions > 0 && <span className='tool-row__deletions'>−{deletions}</span>}
    </span>
  ) : null;

const StatusGlyph: React.FC<{ status: ToolDisplayStatus; label: string }> = ({ status, label }) => {
  if (status === 'running' || status === 'pending') return <Spin size={12} />;
  if (status === 'completed')
    return <CheckSmall theme='outline' size={15} fill='currentColor' className='tool-status__ok' aria-label={label} />;
  if (status === 'error')
    return (
      <CloseSmall theme='outline' size={15} fill='currentColor' className='tool-status__fail' aria-label={label} />
    );
  if (status === 'canceled' || status === 'incomplete')
    return <Caution theme='outline' size={14} fill='currentColor' className='tool-status__warn' aria-label={label} />;
  return null;
};

const ToolDiffPreview: React.FC<{
  file: FileChangeInfo;
  onOpen: (file: FileChangeInfo) => void;
  onDiff: (file: FileChangeInfo) => void;
}> = ({ file, onOpen, onDiff }) => {
  const { t } = useTranslation();
  const lines = useMemo(() => diffBodyLines(file.diff), [file.diff]);
  const visible = lines.slice(0, 80);
  const hiddenCount = lines.length - visible.length;

  return (
    <div className='tool-diff' data-testid='tool-diff-preview'>
      <div className='tool-diff__header'>
        <Button type='text' className='tool-diff__path' title={file.fullPath} onClick={() => onOpen(file)}>
          <span className='tool-diff__directory'>
            {file.fullPath.slice(0, Math.max(0, file.fullPath.length - file.file_name.length))}
          </span>
          <span className='tool-diff__name'>{file.file_name}</span>
        </Button>
        <Button
          type='text'
          className='tool-diff__counts'
          aria-label={`${t('messages.fileChanges')}: ${file.fullPath}`}
          onClick={() => onDiff(file)}
        >
          <DiffCounts insertions={file.insertions} deletions={file.deletions} />
        </Button>
      </div>
      <pre className='tool-diff__body'>
        {visible.map((line, index) => {
          const kind = line.startsWith('@@')
            ? 'hunk'
            : line.startsWith('+')
              ? 'add'
              : line.startsWith('-')
                ? 'del'
                : 'context';
          return (
            <div key={index} className={`tool-diff__line tool-diff__line--${kind}`}>
              {line || ' '}
            </div>
          );
        })}
      </pre>
      {hiddenCount > 0 && (
        <div className='tool-diff__more'>
          {t('messages.toolGroup.diffMoreLines', { count: hiddenCount, defaultValue: '{{count}} more lines' })}
        </div>
      )}
    </div>
  );
};

const ToolItemDetail: React.FC<{ item: NormalizedToolCall; isProcessing: boolean }> = ({ item, isProcessing }) => {
  const { t } = useTranslation();
  const { launchPreview } = usePreviewLauncher();
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
  const isEdit = displayItem.action === 'edit' || displayItem.action === 'write';
  const isExecute = displayItem.action === 'execute';

  const parsedInput = useMemo(() => asRecord(parseStructuredValue(displayItem.input)), [displayItem.input]);

  // Some ACP backends only expose the edit payload in rawInput; synthesize the
  // same preview the diff content would have produced.
  const diffFiles = useMemo<FileChangeInfo[]>(() => {
    if (displayItem.diffs?.length) {
      return displayItem.diffs.map((diff) => parseFileChange(diff.path, diff.old_text, diff.new_text ?? ''));
    }
    if (!isEdit) return [];
    const path =
      stringValue(parsedInput?.file_path) ?? stringValue(parsedInput?.path) ?? stringValue(parsedInput?.file_name);
    const after = parsedInput?.new_string ?? parsedInput?.new_text ?? parsedInput?.content ?? parsedInput?.new_source;
    if (!path || typeof after !== 'string') return [];
    const before = parsedInput?.old_string ?? parsedInput?.old_text ?? parsedInput?.old_source;
    return [parseFileChange(path, typeof before === 'string' ? before : undefined, after)];
  }, [displayItem.diffs, isEdit, parsedInput]);

  const editTotals = useMemo(
    () =>
      diffFiles.reduce(
        (total, file) => ({
          insertions: total.insertions + file.insertions,
          deletions: total.deletions + file.deletions,
        }),
        { insertions: 0, deletions: 0 }
      ),
    [diffFiles]
  );

  const primaryPath = diffFiles[0]?.fullPath ?? displayItem.filePath;
  const primaryName = primaryPath ? basename(primaryPath) : undefined;
  const command = displayItem.command;
  const cwd =
    stringValue(parsedInput?.cwd) ??
    stringValue(parsedInput?.workdir) ??
    stringValue(parsedInput?.working_directory) ??
    stringValue(parsedInput?.workingDirectory);

  const hasDetail = Boolean(
    diffFiles.length ||
    command ||
    displayItem.input ||
    displayItem.output ||
    item.truncated ||
    item.imagePath ||
    displayItem.description
  );
  const [messageApi, messageContext] = Message.useMessage();

  const openFile = useCallback(
    (file: FileChangeInfo, asDiff = false) => {
      openWorkbenchSection('changes');
      const { contentType, editable, language } = getFileTypeInfo(file.file_name);
      if (asDiff) {
        void launchPreview({
          placement: 'sidebar',
          file_name: file.file_name,
          contentType: 'diff',
          editable: false,
          language: 'diff',
          diffContent: file.diff,
        });
        return;
      }
      void launchPreview({
        placement: 'sidebar',
        relativePath: file.fullPath,
        file_name: file.file_name,
        contentType,
        editable,
        language,
        fallbackContent: editable ? extractContentFromDiff(file.diff) : undefined,
        diffContent: file.diff,
      });
    },
    [launchPreview]
  );

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

  // t3code-style subtitle: the file for edits, the command for shell work, and
  // the existing description for every other tool.
  const subtitle = diffFiles.length > 0 && primaryName ? primaryName : isExecute ? command : displayItem.description;

  const heading = (
    <>
      <span
        className={`tool-row__rail ${displayStatus === 'error' ? 'text-danger' : needsAttention ? 'text-warning' : ''}`}
        aria-label={statusLabel}
      >
        {displayStatus === 'running' && !isExecute ? <Spin size={12} /> : ACTION_ICONS[displayItem.action ?? 'other']}
      </span>
      <span className='tool-row__heading'>
        <span className='tool-row__name'>{actionLabel}</span>
        {subtitle && subtitle !== actionLabel && (
          <span className={`tool-row__description${isExecute ? ' tool-row__description--mono' : ''}`} title={subtitle}>
            {subtitle}
          </span>
        )}
        {diffFiles.length > 0 && <DiffCounts insertions={editTotals.insertions} deletions={editTotals.deletions} />}
      </span>
      {isExecute && <StatusGlyph status={displayStatus} label={statusLabel} />}
      {needsAttention && !isExecute && (
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
    <div className='tool-row' data-status={displayStatus}>
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
          {diffFiles.map((file) => (
            <ToolDiffPreview
              key={file.fullPath}
              file={file}
              onOpen={(change) => openFile(change)}
              onDiff={(change) => openFile(change, true)}
            />
          ))}
          {command && (
            <div className='tool-command'>
              <div className='tool-detail-label'>{t('messages.toolGroup.command', { defaultValue: 'Bash' })}</div>
              <pre className='tool-command__text' dir='ltr'>
                {command}
              </pre>
              {cwd && <StructuredContent value={{ workdir: cwd }} />}
            </div>
          )}
          {!command && displayItem.input && (
            <div className='tool-detail-section'>
              <div className='tool-detail-label'>{t('messages.toolGroup.input', { defaultValue: 'Input' })}</div>
              <StructuredContent value={displayItem.input} />
            </div>
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
              onClick={() => void handleDownloadImage(item.imagePath!)}
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
