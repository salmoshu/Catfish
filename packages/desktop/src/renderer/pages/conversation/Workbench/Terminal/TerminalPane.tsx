/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { RemoteEnvironment } from '@/common/types/remote/environment';
import { Button } from '@arco-design/web-react';
import { Close, Refresh } from '@icon-park/react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import styles from './Terminal.module.css';

type TerminalPaneProps = {
  paneId: string;
  cwd: string;
  remote?: RemoteEnvironment;
  active: boolean;
  canClose: boolean;
  onFocus: () => void;
  onClose: () => void;
  style: React.CSSProperties;
};

const TerminalPane: React.FC<TerminalPaneProps> = ({
  paneId,
  cwd,
  remote,
  active,
  canClose,
  onFocus,
  onClose,
  style,
}) => {
  const { t } = useTranslation();
  const translateRef = useRef(t);
  translateRef.current = t;
  const hostRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<XTerm | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const terminalIdRef = useRef('');
  const activeRef = useRef(active);
  activeRef.current = active;
  const [status, setStatus] = useState<'starting' | 'running' | 'exited' | 'failed'>('starting');
  const [attempt, setAttempt] = useState(0);

  const fitAndResize = useCallback(() => {
    const host = hostRef.current;
    const terminal = terminalRef.current;
    const fit = fitRef.current;
    if (!host?.clientWidth || !host.clientHeight || !terminal || !fit) return;
    fit.fit();
    terminal.refresh(0, terminal.rows - 1);
    if (terminalIdRef.current) {
      void ipcBridge.embeddedTerminal.resize
        .invoke({ terminal_id: terminalIdRef.current, cols: terminal.cols, rows: terminal.rows })
        .catch(() => {});
    }
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let disposed = false;
    let exited = false;
    const terminal = new XTerm({
      cursorBlink: true,
      fontFamily: 'ui-monospace, SFMono-Regular, Consolas, monospace',
      fontSize: 12,
      scrollback: 10_000,
    });
    const fit = new FitAddon();
    terminal.loadAddon(fit);
    terminal.open(host);
    terminalRef.current = terminal;
    fitRef.current = fit;
    setStatus('starting');
    const syncTheme = (): void => {
      const colors = getComputedStyle(host);
      terminal.options.theme = {
        background: colors.backgroundColor,
        foreground: colors.color,
        cursor: colors.color,
        selectionBackground: colors.getPropertyValue('--color-fill-3').trim() || undefined,
      };
    };
    syncTheme();
    fitAndResize();
    // Subscribe with a known id before spawning so the first shell prompt cannot be lost.
    const terminalId = crypto.randomUUID();
    terminalIdRef.current = terminalId;
    const disposeOutput = ipcBridge.embeddedTerminal.output.on((event) => {
      if (disposed || event.terminal_id !== terminalId) return;
      if (event.type === 'data') terminal.write(event.data ?? '');
      if (event.type === 'exit') {
        exited = true;
        terminalIdRef.current = '';
        setStatus('exited');
        terminal.writeln(`\r\n[${translateRef.current('conversation.explorer.terminal.exited')}]`);
      }
    });
    const dataDisposable = terminal.onData((data) => {
      if (!exited) void ipcBridge.embeddedTerminal.write.invoke({ terminal_id: terminalId, data }).catch(() => {});
    });
    const showFailure = (error: unknown): void => {
      if (disposed) return;
      terminalIdRef.current = '';
      setStatus('failed');
      terminal.writeln(`\r\n${translateRef.current('conversation.explorer.terminal.startFailed')}`);
      if (error) terminal.writeln(error instanceof Error ? error.message : String(error));
    };
    void ipcBridge.embeddedTerminal.start
      .invoke({ terminal_id: terminalId, cwd, remote, cols: terminal.cols, rows: terminal.rows })
      .then((result) => {
        if (disposed) {
          if (result.terminal_id)
            void ipcBridge.embeddedTerminal.kill.invoke({ terminal_id: result.terminal_id }).catch(() => {});
          return;
        }
        if (result.error || !result.terminal_id) {
          showFailure(result.error);
          return;
        }
        if (!exited) {
          setStatus('running');
          fitAndResize();
          if (activeRef.current) terminal.focus();
        }
      })
      .catch(showFailure);
    const resizeObserver = new ResizeObserver(fitAndResize);
    resizeObserver.observe(host);
    const themeObserver = new MutationObserver(syncTheme);
    themeObserver.observe(document.documentElement, { attributes: true });
    themeObserver.observe(document.body, { attributes: true });
    return () => {
      disposed = true;
      resizeObserver.disconnect();
      themeObserver.disconnect();
      disposeOutput();
      dataDisposable.dispose();
      // Closing before start resolves is handled by the continuation above.
      void ipcBridge.embeddedTerminal.kill.invoke({ terminal_id: terminalId }).catch(() => {});
      terminalIdRef.current = '';
      terminal.dispose();
      terminalRef.current = null;
      fitRef.current = null;
    };
  }, [cwd, remote, fitAndResize, attempt]);

  useEffect(() => {
    if (active) terminalRef.current?.focus();
  }, [active]);

  return (
    <div
      className={styles.pane}
      style={style}
      data-terminal-pane={paneId}
      data-active={active}
      onFocusCapture={onFocus}
      onMouseDown={onFocus}
    >
      <div ref={hostRef} className={`${styles.host} bg-[var(--color-bg-5)] text-t-primary`} />
      <div className={styles.actions}>
        {(status === 'failed' || status === 'exited') && (
          <Button
            type='text'
            size='mini'
            icon={<Refresh size={14} />}
            aria-label={t('common.retry')}
            title={t('common.retry')}
            onClick={() => setAttempt((value) => value + 1)}
          />
        )}
        {canClose && (
          <Button
            type='text'
            size='mini'
            icon={<Close size={14} />}
            aria-label={t('common.close')}
            title={t('common.close')}
            onClick={onClose}
          />
        )}
      </div>
    </div>
  );
};

export default TerminalPane;
