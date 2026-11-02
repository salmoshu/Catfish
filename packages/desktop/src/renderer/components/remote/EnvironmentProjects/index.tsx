import React, { useCallback, useEffect, useState } from 'react';
import { Button, Message, Tooltip } from '@arco-design/web-react';
import { Plus, Refresh } from '@icon-park/react';
import classNames from 'classnames';
import { useTranslation } from 'react-i18next';
import { ipcBridge } from '@/common';
import type { RemoteEnvironmentSummary } from '@/common/types/remote';
import KimiIcon from '@/renderer/components/base/KimiIcon';
import WorkspaceCollapse from '@/renderer/pages/conversation/components/WorkspaceCollapse';
import {
  ENVIRONMENT_PROJECTS_CHANGED,
  environmentKey,
  readEnvironmentProjects,
  recordEnvironmentProjects,
  type EnvironmentProjects as History,
} from '@/renderer/utils/workspace/environmentProjects';
import { getLastDirectoryName } from '@/renderer/utils/workspace/workspace';
import RemoteConnectionModal from '../RemoteConnectionModal';
import styles from './EnvironmentProjects.module.css';

type Props = {
  collapsed: boolean;
  heading?: React.ReactNode;
  hidden?: boolean;
  emptyContent?: React.ReactNode;
};

const EnvironmentProjects: React.FC<Props> = ({ collapsed, heading, hidden, emptyContent }) => {
  const { t } = useTranslation();
  const [history, setHistory] = useState(readEnvironmentProjects);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [connection, setConnection] = useState<{ environment: RemoteEnvironmentSummary; route: string }>();
  const [switchingKey, setSwitchingKey] = useState<string | null>(null);
  const switching = switchingKey !== null;
  const active = window.__backendEnvironment;
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

  const reloadRoute = useCallback((route: string) => {
    window.location.hash = route;
    window.location.reload();
  }, []);

  const onConnected = useCallback(() => {
    if (connection) reloadRoute(connection.route);
  }, [connection, reloadRoute]);

  const open = async (entry: History, workspace: string, conversationId?: string) => {
    if (switching) return;
    const route = conversationId
      ? `/conversation/${encodeURIComponent(conversationId)}`
      : `/guid?workspace=${encodeURIComponent(workspace)}`;
    setSwitchingKey(`${environmentKey(entry.environment)}:${workspace}`);
    try {
      if (entry.environment.type === 'local') {
        const result = await ipcBridge.remoteEnvironment.disconnect.invoke();
        if (result.ok === false) throw new Error(result.message);
        reloadRoute(route);
      } else {
        const id = entry.environment.id;
        const result = await ipcBridge.remoteEnvironment.connect.invoke({ id });
        if (result.ok === true) {
          reloadRoute(route);
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
            const key = `${environmentKey(entry.environment)}:${project.workspace}`;
            const isRemote = entry.environment.type === 'remote';
            const name = getLastDirectoryName(project.workspace);
            const actionLabel = isRemote ? t('mcp.connect') : t('conversation.history.newConversationInProject');
            return (
              <WorkspaceCollapse
                key={key}
                expanded={expanded.has(key)}
                siderCollapsed={collapsed}
                stickyHeader
                stickyTop={28}
                onToggle={() => {
                  if (isRemote) {
                    void open(entry, project.workspace);
                    return;
                  }
                  setExpanded((previous) => {
                    const next = new Set(previous);
                    if (next.has(key)) next.delete(key);
                    else next.add(key);
                    return next;
                  });
                }}
                leadingIcon={
                  isRemote ? (
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
                          'hidden group-hover:flex'
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
                {entry.environment.type === 'local' &&
                  project.conversations.map((conversation) => (
                    <Button
                      key={conversation.id}
                      type='text'
                      className={styles.conversation}
                      disabled={switching}
                      title={conversation.name}
                      onClick={() => void open(entry, project.workspace, conversation.id)}
                    >
                      <KimiIcon name='message' size={15} />
                      <span className={styles.conversationName}>{conversation.name}</span>
                    </Button>
                  ))}
              </WorkspaceCollapse>
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
