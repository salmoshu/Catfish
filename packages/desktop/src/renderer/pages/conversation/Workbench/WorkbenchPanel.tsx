import { Badge, Button } from '@arco-design/web-react';
import { ArrowLeft, Close } from '@icon-park/react';
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { NormalizedToolCall, NormalizedToolStatus } from '@/common/chat/normalizeToolCall';
import { ExplorerContainer } from '@/renderer/pages/conversation/explorer/ExplorerContainer';
import { useCurrentConversation } from '@/renderer/pages/conversation/explorer/currentConversationStore';
import { PreviewPanel, usePreviewContext } from '@/renderer/pages/conversation/Preview';
import SideChatPanel from '@/renderer/pages/conversation/Preview/components/PreviewPanel/SideChatPanel';
import type { WorkbenchSection } from './workbenchActivity';
import {
  notifyWorkbenchSectionChange,
  useWorkbenchActivity,
  WORKBENCH_OPEN_EVENT,
  type WorkbenchOpenDetail,
} from './workbenchActivityStore';
import { useWorkbenchPanelState } from './workbenchPanelState';
import './workbench.css';

const SECTIONS = new Set<WorkbenchSection>(['files', 'changes', 'preview', 'terminal', 'agents', 'plan', 'side-chat']);
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

export const WorkbenchPanel: React.FC<WorkbenchPanelProps> = ({ projectId, onSectionChange }) => {
  const { t } = useTranslation();
  const conversationId = useCurrentConversation();
  const { state, update } = useWorkbenchPanelState(projectId, conversationId);
  const activeSection: WorkbenchSection = state.section;
  const activity = useWorkbenchActivity(conversationId);
  const { isOpen: previewOpen, activeTab, openPreview, openBrowserTab, sideChat, closeSideChat } = usePreviewContext();
  useEffect(() => {
    onSectionChange?.(activeSection);
    notifyWorkbenchSectionChange(activeSection);
  }, [activeSection, onSectionChange]);

  useEffect(() => {
    if ((!previewOpen && activeSection === 'preview') || (!sideChat && activeSection === 'side-chat')) {
      update((current) => ({ ...current, section: 'files' }));
    }
  }, [previewOpen, sideChat, activeSection, update]);

  useEffect(() => {
    const handleOpen = (event: Event) => {
      const section = (event as CustomEvent<WorkbenchOpenDetail>).detail?.section;
      if (!SECTIONS.has(section)) return;
      update((current) =>
        section === 'plan'
          ? { ...current, workspaceOpen: false, planOpen: true }
          : { ...current, section, workspaceOpen: true }
      );
    };
    window.addEventListener(WORKBENCH_OPEN_EVENT, handleOpen);
    return () => window.removeEventListener(WORKBENCH_OPEN_EVENT, handleOpen);
  }, [update]);

  const selectSection = useCallback(
    (section: WorkbenchSection) => {
      if (section === 'plan') {
        update((current) => ({ ...current, workspaceOpen: false, planOpen: true }));
        return;
      }
      update((current) => ({ ...current, section, workspaceOpen: true }));
      notifyWorkbenchSectionChange(section);
      if (section !== 'preview' || previewOpen) return;
      if (activeTab) {
        openPreview(activeTab.content, activeTab.content_type, activeTab.metadata);
      } else {
        openBrowserTab();
      }
    },
    [activeTab, openBrowserTab, openPreview, previewOpen, update]
  );

  return (
    <div className='workbench' data-workbench data-active-section={activeSection}>
      <div className='workbench-body'>
        <section
          id={`workbench-panel-${activeSection === 'terminal' || activeSection === 'changes' ? activeSection : 'files'}`}
          role={activeSection === 'preview' || activeSection === 'side-chat' ? 'complementary' : 'tabpanel'}
          aria-labelledby={`workbench-tab-${activeSection === 'terminal' || activeSection === 'changes' ? activeSection : 'files'}`}
          hidden={activeSection === 'preview' || activeSection === 'side-chat'}
        >
          <ExplorerContainer
            projectId={projectId}
            activeSection={activeSection}
            contentHidden={activeSection === 'agents'}
            terminalActivity={activity.terminals}
            onSectionChange={selectSection}
          />
        </section>
        <section
          data-side-chat-panel
          aria-label={t('conversation.welcome.newConversation')}
          hidden={activeSection !== 'side-chat'}
          className='h-full min-h-0 flex flex-col'
        >
          <div className='flex items-center gap-8px shrink-0 px-12px h-44px border-b border-[var(--color-border-2)]'>
            <Button
              type='text'
              size='mini'
              icon={<ArrowLeft size={16} />}
              aria-label={t('common.back')}
              onClick={() => selectSection('files')}
            />
            <span className='flex-1 text-13px font-medium text-t-primary'>
              {sideChat?.title || t('conversation.welcome.newConversation')}
            </span>
            <Button
              type='text'
              size='mini'
              icon={<Close size={16} />}
              aria-label={t('common.close')}
              onClick={closeSideChat}
            />
          </div>
          {sideChat && (
            <SideChatPanel workspace={sideChat.workspace} sourceConversationId={conversationId ?? undefined} />
          )}
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
