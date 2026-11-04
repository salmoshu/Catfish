import { Badge, Button } from '@arco-design/web-react';
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { NormalizedToolCall, NormalizedToolStatus } from '@/common/chat/normalizeToolCall';
import { useLatestRef } from '@/renderer/hooks/ui/useLatestRef';
import { useLayoutContext } from '@/renderer/hooks/context/LayoutContext';
import { ExplorerContainer } from '@/renderer/pages/conversation/explorer/ExplorerContainer';
import { useCurrentConversation } from '@/renderer/pages/conversation/explorer/currentConversationStore';
import MessageAcpTerminalOutput from '@/renderer/pages/conversation/Messages/acp/MessageAcpTerminalOutput';
import { PreviewPanel, usePreviewContext } from '@/renderer/pages/conversation/Preview';
import type { WorkbenchSection } from './workbenchActivity';
import {
  notifyWorkbenchSectionChange,
  useWorkbenchActivity,
  WORKBENCH_OPEN_EVENT,
  type WorkbenchOpenDetail,
} from './workbenchActivityStore';
import './workbench.css';

const SECTIONS = new Set<WorkbenchSection>(['files', 'changes', 'preview', 'terminal', 'agents', 'plan']);
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
    notifyWorkbenchSectionChange(activeSection);
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
      notifyWorkbenchSectionChange(section);
      if (section !== 'preview' || previewOpen) return;
      if (activeTab) {
        openPreview(activeTab.content, activeTab.content_type, activeTab.metadata);
      } else {
        openBrowserTab();
      }
    },
    [activeTab, openBrowserTab, openPreview, previewOpen]
  );

  return (
    <div className='workbench' data-workbench data-active-section={activeSection}>
      <div className='workbench-body'>
        <section
          id='workbench-panel-files'
          role={activeSection === 'preview' || activeSection === 'plan' ? 'complementary' : 'tabpanel'}
          aria-labelledby='workbench-tab-files'
          hidden={activeSection === 'preview' || activeSection === 'plan'}
        >
          <ExplorerContainer
            projectId={projectId}
            activeSection={activeSection}
            contentHidden={activeSection === 'terminal' || activeSection === 'agents' || activeSection === 'plan'}
            onSectionChange={selectSection}
          />
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
          id='workbench-panel-plan'
          role='tabpanel'
          aria-label={t('conversation.planBar.title')}
          hidden={activeSection !== 'plan'}
        >
          {conversationId && <div data-plan-panel-slot={conversationId} className='h-full min-h-0 flex-1' />}
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
