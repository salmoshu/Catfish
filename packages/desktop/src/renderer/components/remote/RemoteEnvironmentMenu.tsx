/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Message, Modal, Spin } from '@arco-design/web-react';
import { Check, Delete, Link, Plus } from '@icon-park/react';
import { useTranslation } from 'react-i18next';
import { ipcBridge } from '@/common';
import type { RemoteEnvironmentState, RemoteEnvironmentSummary } from '@/common/types/remote';
import styles from './RemoteConnectionModal.module.css';
import { forgetEnvironmentProjects } from '@/renderer/utils/workspace/environmentProjects';

type RemoteEnvironmentMenuProps = {
  searchQuery: string;
  onClose: () => void;
  // The connection modal must be owned OUTSIDE the dropdown that renders this
  // menu — closing the dropdown unmounts this subtree, and the modal with it.
  onRequestConnection: (environment?: RemoteEnvironmentSummary) => void;
  onRequestWorkspace: (environment: RemoteEnvironmentSummary) => void;
};

const RemoteEnvironmentMenu: React.FC<RemoteEnvironmentMenuProps> = ({
  searchQuery,
  onClose,
  onRequestConnection,
  onRequestWorkspace,
}) => {
  const { t } = useTranslation();
  const [environments, setEnvironments] = useState<RemoteEnvironmentSummary[]>([]);
  const [state, setState] = useState<RemoteEnvironmentState>({
    active: window.__backendEnvironment ?? { type: 'local' },
  });

  const refresh = useCallback(async () => {
    const [items, currentState] = await Promise.all([
      ipcBridge.remoteEnvironment.list.invoke(),
      ipcBridge.remoteEnvironment.state.invoke(),
    ]);
    setEnvironments(items);
    setState(currentState);
  }, []);

  useEffect(() => {
    void refresh();
    return ipcBridge.remoteEnvironment.progress.on((progress) => {
      if (progress.stage === 'connected') void refresh();
      else {
        setEnvironments((items) =>
          items.map((item) => (item.id === progress.environmentId ? { ...item, status: 'connecting' } : item))
        );
      }
    });
  }, [refresh]);

  const filtered = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return environments;
    return environments.filter((item) => {
      const target = item.kind === 'ssh' ? item.host : item.kind === 'wsl' ? item.distribution : item.container;
      return item.name.toLowerCase().includes(query) || target?.toLowerCase().includes(query);
    });
  }, [environments, searchQuery]);

  const disconnect = async () => {
    const result = await ipcBridge.remoteEnvironment.disconnect.invoke();
    if (result.ok === true) window.location.reload();
    else Message.error(result.message || t('guid.workspace.remote.connectFailed'));
  };

  const remove = (environment: RemoteEnvironmentSummary) => {
    onClose();
    Modal.confirm({
      title: t('guid.workspace.remote.removeConfirm'),
      content: t('guid.workspace.remote.removeConfirmContent'),
      onOk: async () => {
        const result = await ipcBridge.remoteEnvironment.remove.invoke({ id: environment.id });
        if (result.ok === false) {
          Message.error(result.message);
          return;
        }
        forgetEnvironmentProjects(environment.id);
        if (state.active.type === 'remote' && state.active.id === environment.id) window.location.reload();
        else await refresh();
      },
    });
  };

  const openConnection = (environment?: RemoteEnvironmentSummary) => {
    if (environment && state.active.type === 'remote' && state.active.id === environment.id) {
      onClose();
      onRequestWorkspace(environment);
      return;
    }
    onRequestConnection(environment);
  };

  return (
    <>
      <div className={styles.sectionDivider} />
      <div className={styles.sectionLabel}>{t('guid.workspace.remote.section')}</div>
      {filtered.map((environment) => {
        const active = state.active.type === 'remote' && state.active.id === environment.id;
        return (
          <div key={environment.id} className={styles.remoteItemRow}>
            <Button type='text' className={styles.remoteItem} onClick={() => openConnection(environment)}>
              <Link size={14} />
              <span className={styles.remoteName}>{environment.name}</span>
              <span className={styles.remoteKind}>{environment.kind.toUpperCase()}</span>
              {environment.status === 'connecting' ? <Spin size={12} /> : active ? <Check size={14} /> : null}
            </Button>
            <Button
              type='text'
              size='small'
              className={styles.removeButton}
              aria-label={t('guid.workspace.remote.remove')}
              onClick={(event) => {
                event.stopPropagation();
                remove(environment);
              }}
            >
              <Delete size={13} />
            </Button>
          </div>
        );
      })}
      <Button type='text' className={styles.actionItem} onClick={() => openConnection()}>
        <Plus size={14} />
        <span>{t('guid.workspace.remote.new')}</span>
      </Button>
      {state.active.type === 'remote' && (
        <Button type='text' className={styles.actionItem} onClick={() => void disconnect()}>
          <Link size={14} />
          <span>{t('guid.workspace.remote.disconnect')}</span>
        </Button>
      )}
    </>
  );
};

export default RemoteEnvironmentMenu;
