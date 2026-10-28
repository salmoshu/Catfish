import React, { useCallback, useEffect, useState } from 'react';
import { Button, Message, Tooltip } from '@arco-design/web-react';
import { Plus } from '@icon-park/react';
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
  const [switching, setSwitching] = useState(false);
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
    setSwitching(true);
    try {
      if (entry.environment.type === 'local') {
        const result = await ipcBridge.remoteEnvironment.disconnect.invoke();
        if (result.ok === false) throw new Error(result.message);
        reloadRoute(route);
      } else {
        const id = entry.environment.id;
        const environments = await ipcBridge.remoteEnvironment.list.invoke();
        const environment = environments.find((item) => item.id === id);
        if (!environment) throw new Error(t('guid.workspace.remote.connectFailed'));
        setConnection({ environment, route });
      }
    } catch (error) {
      Message.error(error instanceof Error ? error.message : t('guid.workspace.remote.connectFailed'));
    } finally {
      setSwitching(false);
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
            const environmentName =
              entry.environment.type === 'remote' ? entry.environment.name : t('guid.workspace.remote.local');
            const name = project.workspace.split(/[\\/]/).filter(Boolean).pop() || project.workspace;
            return (
              <WorkspaceCollapse
                key={key}
                expanded={expanded.has(key)}
                siderCollapsed={collapsed}
                onToggle={() =>
                  setExpanded((previous) => {
                    const next = new Set(previous);
                    if (next.has(key)) next.delete(key);
                    else next.add(key);
                    return next;
                  })
                }
                header={
                  <Tooltip content={`${environmentName} · ${project.workspace}`}>
                    <span className={styles.projectName}>
                      <span role='img' aria-label={environmentName} className={styles.environment}>
                        <KimiIcon name={entry.environment.type === 'remote' ? 'globe' : 'device-desktop'} size={14} />
                      </span>
                      {name}
                    </span>
                  </Tooltip>
                }
                trailing={
                  <Tooltip content={t('conversation.history.newConversationInProject')}>
                    <Button
                      type='text'
                      size='mini'
                      disabled={switching}
                      aria-label={t('conversation.history.newConversationInProject')}
                      onClick={() => void open(entry, project.workspace)}
                    >
                      <Plus size={14} />
                    </Button>
                  </Tooltip>
                }
              >
                {project.conversations.map((conversation) => (
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
