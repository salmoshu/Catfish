import { Badge, Button } from '@arco-design/web-react';
import { CloseSmall } from '@icon-park/react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { NormalizedToolCall, NormalizedToolStatus } from '@/common/chat/normalizeToolCall';
import { useLatestRef } from '@/renderer/hooks/ui/useLatestRef';
import { useLayoutContext } from '@/renderer/hooks/context/LayoutContext';
import { ExplorerContainer } from '@/renderer/pages/conversation/explorer/ExplorerContainer';
import { useCurrentConversation } from '@/renderer/pages/conversation/explorer/currentConversationStore';
import MessageAcpTerminalOutput from '@/renderer/pages/conversation/Messages/acp/MessageAcpTerminalOutput';
import { PreviewPanel, usePreviewContext } from '@/renderer/pages/conversation/Preview';
import { ScmPanel } from '@/renderer/pages/conversation/SourceControl/ScmPanel';
import { WorkbenchTabs } from './WorkbenchTabs';
import type { WorkbenchSection } from './workbenchActivity';
import { useWorkbenchActivity, WORKBENCH_OPEN_EVENT, type WorkbenchOpenDetail } from './workbenchActivityStore';
import './workbench.css';

const SECTIONS = new Set<WorkbenchSection>(['files', 'changes', 'preview', 'terminal', 'agents']);
const sectionStorageKey = (projectId: string) => `workbench-section:${projectId}`;
const readSection = (projectId: string): WorkbenchSection => {
  try {
    const stored = localStorage.getItem(sectionStorageKey(projectId));
    return SECTIONS.has(stored as WorkbenchSection) ? (stored as WorkbenchSection) : 'files';
  } catch {
    return 'files';
  }
};

const WorkbenchAgentCard: React.FC<{ agent: NormalizedToolCall }> = ({ agent }) => {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const statusLabels: Record<NormalizedToolStatus, string> = {
    pending: t('messages.workbench.status.pending', { defaultValue: 'Pending' }),
    running: t('messages.workbench.status.running', { defaultValue: 'Running' }),
    completed: t('messages.workbench.status.completed', { defaultValue: 'Completed' }),
    error: t('messages.workbench.status.error', { defaultValue: 'Failed' }),
    canceled: t('messages.workbench.status.canceled', { defaultValue: 'Canceled' }),
  };
  const badgeStatus =
    agent.status === 'completed'
      ? 'success'
      : agent.status === 'error'
        ? 'error'
        : agent.status === 'running'
          ? 'processing'
          : 'default';

  return (
    <div className='workbench-agent-card' data-status={agent.status}>
      <Button
        type='text'
        className='workbench-agent-card__header'
        aria-expanded={expanded}
        onClick={() => setExpanded((value) => !value)}
      >
        <Badge status={badgeStatus} />
        <span className='workbench-agent-card__title'>{agent.name}</span>
        <span className='workbench-agent-card__status'>{statusLabels[agent.status]}</span>
      </Button>
      {agent.description && <div className='workbench-agent-card__description'>{agent.description}</div>}
      {expanded && (
        <div className='workbench-agent-card__detail'>
          {agent.input && <pre>{agent.input}</pre>}
          {agent.output && <pre>{agent.output}</pre>}
        </div>
      )}
    </div>
  );
};

type WorkbenchPanelProps = {
  projectId: string;
  collapsed?: boolean;
  onCollapse?: () => void;
  onExpand?: () => void;
  onSectionChange?: (section: WorkbenchSection) => void;
};

export const WorkbenchPanel: React.FC<WorkbenchPanelProps> = ({
  projectId,
  collapsed = false,
  onCollapse,
  onExpand,
  onSectionChange,
}) => {
  const { t } = useTranslation();
  const [activeSection, setActiveSection] = useState<WorkbenchSection>(() => readSection(projectId));
  const conversationId = useCurrentConversation();
  const activity = useWorkbenchActivity(conversationId);
  const { isOpen: previewOpen, activeTab, openPreview, openBrowserTab } = usePreviewContext();
  const isMobile = Boolean(useLayoutContext()?.isMobile);
  const collapsedRef = useLatestRef(collapsed);
  const onExpandRef = useLatestRef(onExpand);
  const isMobileRef = useLatestRef(isMobile);

  useEffect(() => {
    setActiveSection(readSection(projectId));
  }, [projectId]);

  useEffect(() => {
    try {
      localStorage.setItem(sectionStorageKey(projectId), activeSection);
    } catch {
      // Keep the current in-memory selection when storage is unavailable.
    }
  }, [activeSection, projectId]);

  useEffect(() => {
    onSectionChange?.(activeSection);
  }, [activeSection, onSectionChange]);

  useEffect(() => {
    if (previewOpen && !isMobileRef.current) {
      setActiveSection('preview');
      if (collapsedRef.current) onExpandRef.current?.();
    } else {
      setActiveSection((current) => (current === 'preview' ? 'files' : current));
    }
  }, [previewOpen, collapsedRef, onExpandRef, isMobileRef]);

  useEffect(() => {
    const handleOpen = (event: Event) => {
      const section = (event as CustomEvent<WorkbenchOpenDetail>).detail?.section;
      if (!SECTIONS.has(section)) return;
      setActiveSection(section);
      if (collapsedRef.current) onExpandRef.current?.();
    };
    window.addEventListener(WORKBENCH_OPEN_EVENT, handleOpen);
    return () => window.removeEventListener(WORKBENCH_OPEN_EVENT, handleOpen);
  }, [collapsedRef, onExpandRef]);

  const selectSection = useCallback(
    (section: WorkbenchSection) => {
      setActiveSection(section);
      if (section !== 'preview' || previewOpen) return;
      if (activeTab) {
        openPreview(activeTab.content, activeTab.content_type, activeTab.metadata);
      } else {
        openBrowserTab();
      }
    },
    [activeTab, openBrowserTab, openPreview, previewOpen]
  );

  const tabItems = useMemo(
    () =>
      [
        { id: 'files' as const, label: t('messages.workbench.files', { defaultValue: 'Files' }) },
        { id: 'changes' as const, label: t('messages.workbench.changes', { defaultValue: 'Changes' }) },
        { id: 'preview' as const, label: t('messages.workbench.preview', { defaultValue: 'Preview' }) },
        {
          id: 'terminal' as const,
          label: t('messages.workbench.terminal', { defaultValue: 'Terminal' }),
          count: activity.terminals.length,
        },
        {
          id: 'agents' as const,
          label: t('messages.workbench.agents', { defaultValue: 'Agents' }),
          count: activity.agents.length,
        },
      ].filter((item) => !isMobile || item.id !== 'preview'),
    [activity.agents.length, activity.terminals.length, isMobile, t]
  );

  return (
    <div className='workbench' data-workbench data-active-section={activeSection}>
      <div className='workbench-header'>
        <WorkbenchTabs
          items={tabItems}
          activeSection={activeSection}
          label={t('messages.workbench.tabsLabel', { defaultValue: 'Workbench sections' })}
          onSelect={selectSection}
        />
        {onCollapse && (
          <Button
            type='text'
            size='small'
            className='workbench-collapse'
            aria-label={t('messages.workbench.collapse', { defaultValue: 'Collapse Workbench' })}
            onClick={onCollapse}
            icon={<CloseSmall size='14' />}
          />
        )}
      </div>
      <div className='workbench-body'>
        <section
          id='workbench-panel-files'
          role={activeSection === 'preview' ? 'complementary' : 'tabpanel'}
          aria-labelledby='workbench-tab-files'
          className={activeSection === 'preview' ? 'workbench-files-pane--rail' : undefined}
          hidden={activeSection !== 'files' && activeSection !== 'preview'}
        >
          <ExplorerContainer projectId={projectId} />
        </section>
        <section
          id='workbench-panel-changes'
          role='tabpanel'
          aria-labelledby='workbench-tab-changes'
          hidden={activeSection !== 'changes'}
        >
          <ScmPanel projectId={projectId} />
        </section>
        <section
          id='workbench-panel-preview'
          role='tabpanel'
          aria-labelledby='workbench-tab-preview'
          className='preview-panel'
          hidden={activeSection !== 'preview'}
        >
          {previewOpen && activeTab ? (
            <PreviewPanel />
          ) : (
            <div className='workbench-empty'>
              <span>
                {t('messages.workbench.previewEmpty', {
                  defaultValue: 'Open a file, diff or browser tab from the workspace.',
                })}
              </span>
              <Button type='primary' size='small' onClick={() => openBrowserTab()}>
                {t('messages.workbench.openBrowser', { defaultValue: 'New browser tab' })}
              </Button>
            </div>
          )}
        </section>
        <section
          id='workbench-panel-terminal'
          role='tabpanel'
          aria-labelledby='workbench-tab-terminal'
          hidden={activeSection !== 'terminal'}
        >
          {activity.terminals.length > 0 ? (
            <div className='workbench-activity-list'>
              {activity.terminals.map((message) => (
                <MessageAcpTerminalOutput key={message.id} message={message} />
              ))}
            </div>
          ) : (
            <div className='workbench-empty'>
              {t('messages.workbench.terminalEmpty', {
                defaultValue: 'Terminal output from agent commands will appear here.',
              })}
            </div>
          )}
        </section>
        <section
          id='workbench-panel-agents'
          role='tabpanel'
          aria-labelledby='workbench-tab-agents'
          hidden={activeSection !== 'agents'}
        >
          {activity.agents.length > 0 ? (
            <div className='workbench-activity-list'>
              {activity.agents.map((agent) => (
                <WorkbenchAgentCard key={agent.key} agent={agent} />
              ))}
            </div>
          ) : (
            <div className='workbench-empty'>
              {t('messages.workbench.agentsEmpty', {
                defaultValue: 'Subagent activity will appear here when the agent starts a task.',
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
