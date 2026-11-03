import React, { useCallback, useEffect, useState } from 'react';
import { Button, Message, Spin, Tooltip } from '@arco-design/web-react';
import { Plus, Refresh } from '@icon-park/react';
import classNames from 'classnames';
import { useTranslation } from 'react-i18next';
import { ipcBridge } from '@/common';
import type { RemoteEnvironmentSummary } from '@/common/types/remote';
import KimiIcon from '@/renderer/components/base/KimiIcon';
import WorkspaceCollapse from '@/renderer/pages/conversation/components/WorkspaceCollapse';
import { ConversationIdentityIcon } from '@/renderer/pages/conversation/GroupedHistory/ConversationRow';
import type { TChatConversation } from '@/common/config/storage';
import {
  ENVIRONMENT_PROJECTS_CHANGED,
  environmentKey,
  environmentProjectKey,
  readEnvironmentProjects,
  recordEnvironmentProjects,
  type EnvironmentProject,
  type EnvironmentProjects as History,
} from '@/renderer/utils/workspace/environmentProjects';
import { getLastDirectoryName } from '@/renderer/utils/workspace/workspace';
import { connectOrResumeEnvironment, switchBackendRoute } from '@/renderer/utils/workspace/backendSwitch';
import { getBackendEnvironment } from '@/common/adapter/httpBridge';
import RemoteConnectionModal from '../RemoteConnectionModal';
import styles from './EnvironmentProjects.module.css';
import {
  toggleExpandedWorkspace,
  useWorkspaceExpansionState,
} from '@/renderer/pages/conversation/GroupedHistory/hooks/useWorkspaceExpansionState';

type Props = {
  collapsed: boolean;
  heading?: React.ReactNode;
  hidden?: boolean;
  emptyContent?: React.ReactNode;
  getProjectOrder?: (environment: History['environment'], project: EnvironmentProject) => number;
  isConversationGenerating?: (conversationId: string) => boolean;
};

const EnvironmentProjects: React.FC<Props> = ({
  collapsed,
  heading,
  hidden,
  emptyContent,
  getProjectOrder,
  isConversationGenerating,
}) => {
  const { t } = useTranslation();
  const [history, setHistory] = useState(readEnvironmentProjects);
  const expandedWorkspaces = useWorkspaceExpansionState();
  const [connection, setConnection] = useState<{ environment: RemoteEnvironmentSummary; route: string }>();
  const [switchingKey, setSwitchingKey] = useState<string | null>(null);
  const switching = switchingKey !== null;
  const active = getBackendEnvironment();
  const otherHistory = active
    ? history.filter((entry) => environmentKey(entry.environment) !== environmentKey(active))
    : [];

  useEffect(() => {
    const refresh = () => setHistory(readEnvironmentProjects());
    window.addEventListener(ENVIRONMENT_PROJECTS_CHANGED, refresh);
    window.addEventListener('storage', refresh);
    refresh();
    if (active?.type === 'remote') {
      void ipcBridge.remoteEnvironment.localConversations
        .invoke()
        .then((items) => recordEnvironmentProjects(items, { type: 'local' }))
        .catch((error: unknown) => console.warn('Failed to refresh local project index:', error));
    }
    return () => {
      window.removeEventListener(ENVIRONMENT_PROJECTS_CHANGED, refresh);
      window.removeEventListener('storage', refresh);
    };
  }, [active?.type]);

  const reloadRoute = useCallback(async (route: string) => {
    await switchBackendRoute(route);
  }, []);

  const onConnected = useCallback(() => {
    if (connection) void reloadRoute(connection.route);
  }, [connection, reloadRoute]);

  const open = async (entry: History, workspace: string, conversationId?: string) => {
    if (switching) return;
    const route = conversationId
      ? `/conversation/${encodeURIComponent(conversationId)}`
      : `/guid?workspace=${encodeURIComponent(workspace)}`;
    setSwitchingKey(`${environmentKey(entry.environment)}:${workspace}`);
    try {
      if (entry.environment.type === 'local') {
        const result = await ipcBridge.remoteEnvironment.activate.invoke({});
        if (result.ok === false) throw new Error(result.message);
        await reloadRoute(route);
      } else {
        const id = entry.environment.id;
        const result = await connectOrResumeEnvironment(id);
        if (result.ok === true) {
          await reloadRoute(route);
          return;
        }
        const environments = await ipcBridge.remoteEnvironment.list.invoke();
        const environment = environments.find((item) => item.id === id);
        if (!environment) throw new Error(t('guid.workspace.remote.connectFailed'));
        setConnection({ environment, route });
      }
    } catch (error) {
      Message.error(error instanceof Error ? error.message : t('guid.workspace.remote.connectFailed'));
    } finally {
      setSwitchingKey(null);
    }
  };

  const hasProjects = otherHistory.some((entry) => entry.projects.length > 0);
  return (
    <>
      {hasProjects ? heading : emptyContent}
      {!hidden &&
        otherHistory.map((entry) =>
          entry.projects.map((project) => {
            const key = environmentProjectKey(entry.environment, project.workspace);
            const isRemote = entry.environment.type === 'remote';
            const name = getLastDirectoryName(project.workspace);
            const actionLabel = isRemote ? t('mcp.connect') : t('conversation.history.newConversationInProject');
            const projectExpanded = expandedWorkspaces.includes(key) || expandedWorkspaces.includes(project.workspace);
            const projectRunning = project.conversations.some((conversation) =>
              isConversationGenerating?.(conversation.id)
            );
            return (
              <div key={key} style={{ order: getProjectOrder?.(entry.environment, project) }}>
                <WorkspaceCollapse
                  expanded={projectExpanded}
                  siderCollapsed={collapsed}
                  stickyHeader
                  stickyTop={28}
                  onToggle={() => toggleExpandedWorkspace(key, [project.workspace])}
                  leadingIcon={
                    projectRunning ? (
                      <Spin size={16} data-testid='cached-project-running' />
                    ) : isRemote ? (
                      <span role='img' aria-label={name} className={styles.environment}>
                        <KimiIcon name='globe' size={16} />
                      </span>
                    ) : undefined
                  }
                  header={
                    <Tooltip content={name}>
                      <span className='text-14px font-[500] truncate flex-1 text-t-primary min-w-0'>{name}</span>
                    </Tooltip>
                  }
                  trailing={
                    <span className='flex items-center gap-6px'>
                      <Tooltip content={actionLabel} position='top'>
                        <span
                          role='button'
                          tabIndex={0}
                          aria-label={actionLabel}
                          aria-disabled={switching}
                          className={classNames(
                            'flex-center cursor-pointer transition-colors text-t-secondary hover:text-t-primary size-20px rd-4px sider-action-btn',
                            switchingKey === key ? 'flex' : 'hidden group-hover:flex'
                          )}
                          onClick={(event) => {
                            event.stopPropagation();
                            void open(entry, project.workspace);
                          }}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault();
                              event.stopPropagation();
                              void open(entry, project.workspace);
                            }
                          }}
                        >
                          {isRemote ? (
                            <Refresh
                              theme='outline'
                              size='14'
                              fill='currentColor'
                              className={classNames('block leading-none', { loading: switchingKey === key })}
                            />
                          ) : (
                            <Plus theme='outline' size='14' fill='currentColor' className='block leading-none' />
                          )}
                        </span>
                      </Tooltip>
                    </span>
                  }
                >
                  {project.conversations.map((conversation) => {
                    const cachedConversation = {
                      id: conversation.id,
                      name: conversation.name,
                      type: conversation.type ?? 'acp',
                      created_at: conversation.modifiedAt,
                      modified_at: conversation.modifiedAt,
                      assistant: conversation.assistant,
                      extra: {
                        workspace: project.workspace,
                        custom_workspace: true,
                        backend: conversation.backend,
                        assistant_id: conversation.assistant_id,
                        preset_assistant_id: conversation.preset_assistant_id,
                        custom_agent_id: conversation.custom_agent_id,
                        agent_id: conversation.agent_id,
                        agent_name: conversation.agent_name,
                      },
                    } as TChatConversation;
                    return (
                      <Button
                        key={conversation.id}
                        type='text'
                        className={`chat-history__item ${styles.conversation}`}
                        disabled={switching}
                        title={conversation.name}
                        onClick={() => void open(entry, project.workspace, conversation.id)}
                      >
                        <span className='size-22px flex items-center justify-center shrink-0 leading-none'>
                          {isConversationGenerating?.(conversation.id) ? (
                            <Spin size={14} data-testid='cached-conversation-running' />
                          ) : (
                            <ConversationIdentityIcon conversation={cachedConversation} />
                          )}
                        </span>
                        <span className={styles.conversationName}>{conversation.name}</span>
                      </Button>
                    );
                  })}
                </WorkspaceCollapse>
              </div>
            );
          })
        )}
      {connection && (
        <RemoteConnectionModal
          visible
          environment={connection.environment}
          onClose={() => setConnection(undefined)}
          onConnected={onConnected}
        />
      )}
    </>
  );
};

export default EnvironmentProjects;
