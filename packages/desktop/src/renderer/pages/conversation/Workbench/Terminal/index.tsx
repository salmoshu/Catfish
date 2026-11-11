/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { Button } from '@arco-design/web-react';
import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { isElectronDesktop } from '@/renderer/utils/platform';
import type { RemoteEnvironment } from '@/common/types/remote/environment';
import { getActiveBackendEnvironment } from '@/renderer/utils/workspace/backendCache';
import TerminalPane from './TerminalPane';
import {
  createTerminalLayout,
  getTerminalLayoutRects,
  listTerminalPaneIds,
  removeTerminalPane,
  splitTerminalLayout,
  updateTerminalSplitRatio,
  type TerminalDivider,
  type TerminalSplitDirection,
} from './terminalLayout';
import styles from './Terminal.module.css';

// Match Nav-Tools' SquareSplitVertical glyph and its split-right rotation.
const TerminalSplitIcon: React.FC<{ horizontal?: boolean }> = ({ horizontal }) => (
  <svg
    width='14'
    height='14'
    viewBox='0 0 24 24'
    fill='none'
    stroke='currentColor'
    strokeWidth='2'
    strokeLinecap='round'
    strokeLinejoin='round'
    className={horizontal ? 'rotate-90' : undefined}
    aria-hidden='true'
  >
    <rect x='3' y='3' width='18' height='18' rx='2' />
    <path d='M3 12h18' />
  </svg>
);

const EmbeddedTerminalPanel: React.FC<{ workspacePath?: string }> = ({ workspacePath }) => {
  const { t } = useTranslation();
  const [rootPaneId] = useState(() => crypto.randomUUID());
  const [layout, setLayout] = useState(() => createTerminalLayout(rootPaneId));
  const [activePane, setActivePane] = useState<string>(rootPaneId);
  const backend = getActiveBackendEnvironment();
  const remoteId = backend.type === 'remote' ? backend.id : null;
  const [remote, setRemote] = useState<RemoteEnvironment | undefined>();
  useEffect(() => {
    let cancelled = false;
    if (!remoteId) {
      setRemote(undefined);
      return;
    }
    const listProvider = ipcBridge.remoteEnvironment?.list;
    if (!listProvider) {
      setRemote(undefined);
      return;
    }
    void listProvider
      .invoke()
      .then((environments) => {
        if (!cancelled) setRemote(environments.find((environment) => environment.id === remoteId));
      })
      .catch(() => {
        if (!cancelled) setRemote(undefined);
      });
    return () => {
      cancelled = true;
    };
  }, [remoteId]);
  const hostRef = useRef<HTMLDivElement>(null);
  const draggedSplitRef = useRef<string | null>(null);
  const { panes, dividers } = getTerminalLayoutRects(layout);
  const split = (direction: TerminalSplitDirection): void => {
    const newPaneId = crypto.randomUUID();
    setLayout((current) => splitTerminalLayout(current, activePane, newPaneId, direction));
    setActivePane(newPaneId);
  };
  const closePane = (paneId: string): void => {
    const next = removeTerminalPane(layout, paneId);
    if (!next) return;
    setLayout(next);
    if (activePane === paneId) setActivePane(listTerminalPaneIds(next)[0]);
  };
  const resize = (divider: TerminalDivider, event: React.PointerEvent): void => {
    if (draggedSplitRef.current !== divider.id) return;
    const rect = hostRef.current?.getBoundingClientRect();
    if (!rect?.width || !rect.height) return;
    const ratio =
      divider.direction === 'horizontal'
        ? (((event.clientX - rect.left) / rect.width) * 100 - divider.left) / divider.width
        : (((event.clientY - rect.top) / rect.height) * 100 - divider.top) / divider.height;
    setLayout((current) => updateTerminalSplitRatio(current, divider.id, ratio));
  };

  if (!isElectronDesktop()) {
    return (
      <div className='h-full flex items-center justify-center p-16px text-13px text-t-tertiary'>
        {t('conversation.explorer.terminal.unavailable')}
      </div>
    );
  }
  if (remoteId && !remote) {
    return (
      <div className='h-full flex items-center justify-center p-16px text-13px text-t-tertiary'>
        {t('common.loading')}
      </div>
    );
  }
  if (!workspacePath) {
    return (
      <div className='h-full flex items-center justify-center p-16px text-13px text-t-tertiary'>
        {t('conversation.explorer.terminal.selectWorkspace')}
      </div>
    );
  }
  return (
    <div className='h-full min-h-0 flex flex-col' data-testid='embedded-terminal-panel'>
      <div
        className={`${styles.toolbar} shrink-0 flex items-center gap-4px px-8px py-4px border-b border-[var(--color-border-2)]`}
      >
        <span className='min-w-0 flex-1 truncate text-12px text-t-secondary' title={workspacePath}>
          {workspacePath}
        </span>
        <Button
          type='text'
          size='mini'
          icon={<TerminalSplitIcon horizontal />}
          aria-label={t('conversation.explorer.terminal.splitHorizontal')}
          title={t('conversation.explorer.terminal.splitHorizontal')}
          onClick={() => split('horizontal')}
        />
        <Button
          type='text'
          size='mini'
          icon={<TerminalSplitIcon />}
          aria-label={t('conversation.explorer.terminal.splitVertical')}
          title={t('conversation.explorer.terminal.splitVertical')}
          onClick={() => split('vertical')}
        />
      </div>
      <div ref={hostRef} className='relative min-h-0 flex-1 overflow-hidden'>
        {panes.map((pane) => (
          <TerminalPane
            key={pane.paneId}
            paneId={pane.paneId}
            cwd={workspacePath}
            remote={remote}
            active={activePane === pane.paneId}
            canClose={panes.length > 1}
            onFocus={() => setActivePane(pane.paneId)}
            onClose={() => closePane(pane.paneId)}
            style={{ left: `${pane.left}%`, top: `${pane.top}%`, width: `${pane.width}%`, height: `${pane.height}%` }}
          />
        ))}
        {dividers.map((divider) => {
          const horizontal = divider.direction === 'horizontal';
          return (
            <Button
              key={divider.id}
              type='text'
              className={styles.divider}
              role='separator'
              aria-label={t(
                horizontal
                  ? 'conversation.explorer.terminal.splitHorizontal'
                  : 'conversation.explorer.terminal.splitVertical'
              )}
              aria-orientation={horizontal ? 'vertical' : 'horizontal'}
              aria-valuemin={15}
              aria-valuemax={85}
              aria-valuenow={Math.round(divider.ratio * 100)}
              style={
                horizontal
                  ? {
                      left: `${divider.left + divider.width * divider.ratio}%`,
                      top: `${divider.top}%`,
                      width: 4,
                      height: `${divider.height}%`,
                    }
                  : {
                      top: `${divider.top + divider.height * divider.ratio}%`,
                      left: `${divider.left}%`,
                      height: 4,
                      width: `${divider.width}%`,
                    }
              }
              onPointerDown={(event) => {
                draggedSplitRef.current = divider.id;
                event.currentTarget.setPointerCapture(event.pointerId);
                event.preventDefault();
              }}
              onPointerMove={(event) => resize(divider, event)}
              onPointerUp={(event) => {
                draggedSplitRef.current = null;
                event.currentTarget.releasePointerCapture(event.pointerId);
              }}
              onPointerCancel={() => {
                draggedSplitRef.current = null;
              }}
              onKeyDown={(event) => {
                const decrease = horizontal ? 'ArrowLeft' : 'ArrowUp';
                const increase = horizontal ? 'ArrowRight' : 'ArrowDown';
                if (event.key !== decrease && event.key !== increase) return;
                event.preventDefault();
                setLayout((current) =>
                  updateTerminalSplitRatio(current, divider.id, divider.ratio + (event.key === decrease ? -0.05 : 0.05))
                );
              }}
            />
          );
        })}
      </div>
    </div>
  );
};

export default EmbeddedTerminalPanel;
