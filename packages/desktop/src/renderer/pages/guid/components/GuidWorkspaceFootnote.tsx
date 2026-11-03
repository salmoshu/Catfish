/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { addRecentWorkspace, DEFAULT_RECENT_WS_KEY, getRecentWorkspaces } from '@/renderer/components/workspace';
import { AionInlineSearchInput } from '@/renderer/components/base';
import { Tooltip } from '@arco-design/web-react';
import { Close, Down } from '@icon-park/react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import RemoteEnvironmentMenu from '@/renderer/components/remote/RemoteEnvironmentMenu';
import RemoteConnectionModal from '@/renderer/components/remote/RemoteConnectionModal';
import type { RemoteEnvironmentSummary } from '@/common/types/remote';
import { isElectronDesktop } from '@/renderer/utils/platform';
import styles from '../index.module.css';
import KimiIcon from '@renderer/components/base/KimiIcon';

const REMOTE_WORKSPACE_PICKER_PENDING_KEY = 'aionui:remote-workspace-picker:pending';
const LOCAL_WORKSPACE_PICKER_PENDING_KEY = 'aionui:local-workspace-picker:pending';

const consumeWorkspacePickerRequest = (key: string, environmentType: 'local' | 'remote'): boolean => {
  if (window.__backendEnvironment?.type !== environmentType) return false;
  try {
    if (sessionStorage.getItem(key) !== '1') return false;
    sessionStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
};

type GuidWorkspaceFootnoteProps = {
  workspaceDir: string;
  onSelectWorkspace: (dir: string) => void;
  onClearWorkspace: () => void;
};

const FolderIcon = ({ size = 12 }: { size?: number }) => (
  <KimiIcon name='folder' size={size} style={{ lineHeight: 0, flexShrink: 0 }} />
);

const PlusIcon = () => <KimiIcon name='plus' size={13} style={{ flexShrink: 0 }} />;

const GuidWorkspaceFootnote: React.FC<GuidWorkspaceFootnoteProps> = ({
  workspaceDir,
  onSelectWorkspace,
  onClearWorkspace,
}) => {
  const { t } = useTranslation();
  const recentWorkspaces = getRecentWorkspaces(DEFAULT_RECENT_WS_KEY);
  const [open, setOpen] = useState(false);
  const [connectionModal, setConnectionModal] = useState<{ open: boolean; environment?: RemoteEnvironmentSummary }>({
    open: false,
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});
  const triggerRef = useRef<HTMLButtonElement | HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const browseCurrentBackend = useCallback(() => {
    setOpen(false);
    ipcBridge.dialog.showOpen
      .invoke({ properties: ['openDirectory', 'createDirectory'] })
      .then((dirs) => {
        if (dirs && dirs[0]) {
          addRecentWorkspace(dirs[0]);
          onSelectWorkspace(dirs[0]);
        }
      })
      .catch((error) => {
        console.error('Failed to open directory dialog:', error);
      });
  }, [onSelectWorkspace]);

  const handleBrowseWorkspace = useCallback(() => {
    if (window.__backendEnvironment?.type !== 'remote') {
      browseCurrentBackend();
      return;
    }
    setOpen(false);
    try {
      sessionStorage.setItem(LOCAL_WORKSPACE_PICKER_PENDING_KEY, '1');
    } catch {
      // A reload can still return to the local project list without storage.
    }
    void ipcBridge.remoteEnvironment.disconnect
      .invoke()
      .then((result) => {
        if (result.ok === false) throw new Error(result.message);
        window.location.reload();
      })
      .catch((error: unknown) => console.error('Failed to return to the local backend:', error));
  }, [browseCurrentBackend]);

  useEffect(() => {
    if (consumeWorkspacePickerRequest(REMOTE_WORKSPACE_PICKER_PENDING_KEY, 'remote')) browseCurrentBackend();
    if (consumeWorkspacePickerRequest(LOCAL_WORKSPACE_PICKER_PENDING_KEY, 'local')) browseCurrentBackend();
  }, [browseCurrentBackend]);

  const handleSelectPath = useCallback(
    (path: string) => {
      addRecentWorkspace(path, DEFAULT_RECENT_WS_KEY);
      setOpen(false);
      setSearchQuery('');
      if (window.__backendEnvironment?.type !== 'remote') {
        onSelectWorkspace(path);
        return;
      }
      void ipcBridge.remoteEnvironment.disconnect
        .invoke()
        .then((result) => {
          if (result.ok === false) throw new Error(result.message);
          window.location.hash = `/guid?workspace=${encodeURIComponent(path)}`;
          window.location.reload();
        })
        .catch((error: unknown) => console.error('Failed to open the local project:', error));
    },
    [onSelectWorkspace]
  );

  const openDropdown = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    // position above the trigger, aligned to left edge
    setDropdownStyle({
      position: 'fixed',
      left: rect.left,
      bottom: window.innerHeight - rect.top + 6,
      minWidth: 230,
      zIndex: 9999,
    });
    setOpen(true);
    setTimeout(() => searchRef.current?.focus(), 50);
  }, []);

  const closeDropdown = useCallback(() => {
    setOpen(false);
    setSearchQuery('');
  }, []);

  const toggleOpen = useCallback(() => {
    if (open) closeDropdown();
    else openDropdown();
  }, [open, openDropdown, closeDropdown]);

  // close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        triggerRef.current &&
        !triggerRef.current.contains(target) &&
        dropdownRef.current &&
        !dropdownRef.current.contains(target)
      ) {
        closeDropdown();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, closeDropdown]);

  const filteredRecent = recentWorkspaces.filter((p) => {
    if (!searchQuery) return true;
    const name = p.split(/[\\/]/).pop() || p;
    return (
      name.toLowerCase().includes(searchQuery.toLowerCase()) || p.toLowerCase().includes(searchQuery.toLowerCase())
    );
  });

  const workspaceName = workspaceDir ? workspaceDir.split(/[\\/]/).pop() || workspaceDir : '';
  const backendEnvironment = window.__backendEnvironment;

  const dropdownEl = open
    ? createPortal(
        <div ref={dropdownRef} className={styles.wsDropdown} style={dropdownStyle}>
          <div className='mb-8px'>
            <AionInlineSearchInput
              className='w-full'
              ref={searchRef}
              value={searchQuery}
              onChange={setSearchQuery}
              placeholder={t('guid.workspace.searchPlaceholder')}
            />
          </div>

          {filteredRecent.map((path) => {
            const name = path.split(/[\\/]/).pop() || path;
            const isActive = path === workspaceDir;
            return (
              <div
                key={path}
                className={`${styles.wsDropdownItem} ${isActive ? styles.wsDropdownItemActive : ''}`}
                onClick={() => handleSelectPath(path)}
              >
                <KimiIcon name='folder' size={13} style={{ lineHeight: 0, flexShrink: 0 }} />
                <span className={styles.wsDropdownItemName}>{name}</span>
                {isActive && <KimiIcon name='check' size={12} style={{ marginInlineStart: 'auto', flexShrink: 0 }} />}
              </div>
            );
          })}

          {filteredRecent.length > 0 && <div className={styles.wsDropdownSep} />}

          <div className={`${styles.wsDropdownItem} ${styles.wsDropdownItemAccent}`} onClick={handleBrowseWorkspace}>
            <PlusIcon />
            <span>{t('team.create.chooseDifferentFolder')}</span>
          </div>

          {isElectronDesktop() && (
            <RemoteEnvironmentMenu
              searchQuery={searchQuery}
              onClose={closeDropdown}
              onRequestConnection={(environment) => {
                closeDropdown();
                setConnectionModal({ open: true, environment });
              }}
              onRequestWorkspace={browseCurrentBackend}
            />
          )}

          <>
            <div className={styles.wsDropdownSep} />
            <div
              className={`${styles.wsDropdownItem} ${workspaceDir ? styles.wsDropdownItemMuted : styles.wsDropdownItemMutedDisabled}`}
              onClick={() => {
                if (workspaceDir) onClearWorkspace();
                closeDropdown();
              }}
            >
              <KimiIcon name='folder-closed' size={13} style={{ flexShrink: 0 }} />
              <span>{t('guid.workspace.noProject')}</span>
            </div>
          </>
        </div>,
        document.body
      )
    : null;

  return (
    <div className={styles.workspaceFootnote}>
      {backendEnvironment && (backendEnvironment.type !== 'remote' || workspaceName) && (
        <Tooltip
          content={backendEnvironment.type === 'remote' ? workspaceName : t('guid.workspace.remote.local')}
          position='top'
        >
          <span
            role='img'
            aria-label={backendEnvironment.type === 'remote' ? workspaceName : t('guid.workspace.remote.local')}
            className='inline-flex items-center justify-center rounded-6px bg-aou-1 p-4px text-aou-6'
          >
            <KimiIcon name={backendEnvironment.type === 'remote' ? 'globe' : 'device-desktop'} size={14} />
          </span>
        </Tooltip>
      )}
      {workspaceDir ? (
        <>
          <Tooltip content={workspaceName} position='top'>
            <div className={styles.workspacePill}>
              <button
                ref={triggerRef as React.RefObject<HTMLButtonElement>}
                className={styles.workspacePillMain}
                onClick={toggleOpen}
              >
                <KimiIcon
                  name={backendEnvironment?.type === 'remote' ? 'globe' : 'folder'}
                  size={14}
                  style={{ lineHeight: 0, flexShrink: 0 }}
                />
                <span className={styles.workspacePillName}>{workspaceName}</span>
                <Down
                  theme='outline'
                  size='12'
                  fill='currentColor'
                  style={{ flexShrink: 0, transform: 'translateY(1px)' }}
                />
              </button>
              <span
                role='button'
                aria-label={t('guid.workspace.clearWorkspace')}
                className={styles.workspacePillClose}
                onClick={(e) => {
                  e.stopPropagation();
                  onClearWorkspace();
                }}
              >
                <Close theme='outline' size='10' fill='currentColor' />
              </span>
            </div>
          </Tooltip>
          {dropdownEl}
        </>
      ) : (
        <>
          <button
            ref={triggerRef as React.RefObject<HTMLButtonElement>}
            className={styles.workspaceEmptyBtn}
            data-testid='workspace-selector-btn'
            onClick={toggleOpen}
          >
            <FolderIcon size={14} />
            <span>{t('guid.workspace.workInProject')}</span>
            <Down
              theme='outline'
              size='12'
              fill='currentColor'
              style={{ flexShrink: 0, transform: 'translateY(1px)' }}
            />
          </button>
          {dropdownEl}
        </>
      )}
      {connectionModal.open && (
        <RemoteConnectionModal
          visible
          environment={connectionModal.environment}
          onClose={() => setConnectionModal({ open: false })}
          onConnected={() => {
            try {
              sessionStorage.setItem(REMOTE_WORKSPACE_PICKER_PENDING_KEY, '1');
            } catch {
              // Storage can be unavailable in hardened browser contexts.
            }
            window.location.reload();
          }}
        />
      )}
    </div>
  );
};

export default GuidWorkspaceFootnote;
