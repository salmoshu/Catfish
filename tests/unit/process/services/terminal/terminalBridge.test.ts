import { EventEmitter } from 'node:events';
import type { IpcMainInvokeEvent, WebContents } from 'electron';
import { describe, expect, it, vi } from 'vitest';
import { EMBEDDED_TERMINAL_CHANNELS } from '@/common/adapter/constant';
import { initTerminalBridge, registerTerminalWindow } from '@process/services/terminal';

const mocks = vi.hoisted(() => ({ handle: vi.fn(), once: vi.fn(), spawn: vi.fn() }));
vi.mock('electron', () => ({ ipcMain: { handle: mocks.handle }, app: { once: mocks.once } }));
vi.mock('node-pty', () => ({ spawn: mocks.spawn }));

const contents = () =>
  Object.assign(new EventEmitter(), { id: 1, mainFrame: {}, send: vi.fn(), isDestroyed: () => false });

describe('desktop terminal IPC', () => {
  it('rejects webviews and subframes even when they know a terminal channel', () => {
    initTerminalBridge();
    const owner = contents();
    registerTerminalWindow(owner as unknown as WebContents);
    const handler = mocks.handle.mock.calls.find(([channel]) => channel === EMBEDDED_TERMINAL_CHANNELS.start)?.[1] as (
      event: IpcMainInvokeEvent,
      params: unknown
    ) => unknown;
    const event = { sender: owner, senderFrame: {} } as unknown as IpcMainInvokeEvent;
    expect(() => handler(event, {})).toThrow('application window');
    const otherWindow = contents();
    expect(() =>
      handler({ sender: otherWindow, senderFrame: otherWindow.mainFrame } as unknown as IpcMainInvokeEvent, {})
    ).toThrow('application window');
  });

  it('revokes terminal access when the owning window is destroyed', () => {
    const owner = contents();
    registerTerminalWindow(owner as unknown as WebContents);
    owner.emit('destroyed');
    const handler = mocks.handle.mock.calls.find(([channel]) => channel === EMBEDDED_TERMINAL_CHANNELS.kill)?.[1] as (
      event: IpcMainInvokeEvent,
      params: unknown
    ) => unknown;
    expect(() =>
      handler({ sender: owner, senderFrame: owner.mainFrame } as unknown as IpcMainInvokeEvent, {
        terminal_id: 'terminal-1',
      })
    ).toThrow('application window');
  });
});
