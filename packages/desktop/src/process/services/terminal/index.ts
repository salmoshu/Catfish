/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { app, ipcMain, type IpcMainInvokeEvent, type WebContents } from 'electron';
import { EMBEDDED_TERMINAL_CHANNELS } from '@/common/adapter/constant';
import type { EmbeddedTerminalAPI, EmbeddedTerminalStartParams } from '@/common/types/platform/electron';
import { TerminalService } from './TerminalService';

const windows = new Map<number, WebContents>();
const terminals = new TerminalService({
  loadPty: () => import('node-pty'),
  emit: (ownerId, output) => {
    const owner = windows.get(ownerId);
    if (owner && !owner.isDestroyed()) owner.send(EMBEDDED_TERMINAL_CHANNELS.output, output);
  },
});
let initialized = false;

const ownerId = (event: IpcMainInvokeEvent): number => {
  if (windows.get(event.sender.id) !== event.sender || event.senderFrame !== event.sender.mainFrame) {
    throw new Error('Terminal requests must come from the application window');
  }
  return event.sender.id;
};

/** Register the trusted application renderer and clean up its PTYs on reload or close. */
export function registerTerminalWindow(contents: WebContents): void {
  windows.set(contents.id, contents);
  terminals.registerOwner(contents.id);
  contents.on('did-start-navigation', (_event, _url, isInPlace, isMainFrame) => {
    if (isMainFrame && !isInPlace) {
      terminals.closeOwner(contents.id);
      terminals.registerOwner(contents.id);
    }
  });
  contents.once('destroyed', () => {
    windows.delete(contents.id);
    terminals.closeOwner(contents.id);
  });
  contents.on('render-process-gone', () => terminals.closeOwner(contents.id));
}

/** Install desktop-only IPC handlers; terminal data is sent solely to its owning window. */
export function initTerminalBridge(): void {
  if (initialized) return;
  initialized = true;
  ipcMain.handle(EMBEDDED_TERMINAL_CHANNELS.start, (event, params: EmbeddedTerminalStartParams) =>
    terminals.start(ownerId(event), params)
  );
  ipcMain.handle(EMBEDDED_TERMINAL_CHANNELS.write, (event, params: Parameters<EmbeddedTerminalAPI['write']>[0]) =>
    terminals.write(ownerId(event), params?.terminal_id, params?.data)
  );
  ipcMain.handle(EMBEDDED_TERMINAL_CHANNELS.resize, (event, params: Parameters<EmbeddedTerminalAPI['resize']>[0]) =>
    terminals.resize(ownerId(event), params?.terminal_id, params?.cols, params?.rows)
  );
  ipcMain.handle(EMBEDDED_TERMINAL_CHANNELS.kill, (event, params: Parameters<EmbeddedTerminalAPI['kill']>[0]) =>
    terminals.kill(ownerId(event), params?.terminal_id)
  );
  app.once('will-quit', () => terminals.dispose());
}
