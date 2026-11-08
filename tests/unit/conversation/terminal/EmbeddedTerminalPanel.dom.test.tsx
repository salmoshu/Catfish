import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EmbeddedTerminalOutput, EmbeddedTerminalStartParams } from '@/common/types/platform/electron';
import type { BackendEnvironment } from '@/common/types/remote';
import EmbeddedTerminalPanel from '@/renderer/pages/conversation/Workbench/Terminal';

const mocks = vi.hoisted(() => ({
  start: vi.fn(),
  write: vi.fn(),
  resize: vi.fn(),
  kill: vi.fn(),
  desktop: vi.fn(() => true),
  environment: vi.fn<() => BackendEnvironment>(() => ({ type: 'local' })),
  listeners: new Set<(output: EmbeddedTerminalOutput) => void>(),
  terminals: [] as {
    write: ReturnType<typeof vi.fn>;
    writeln: ReturnType<typeof vi.fn>;
    dispose: ReturnType<typeof vi.fn>;
  }[],
}));
vi.mock('@/common', () => ({
  ipcBridge: {
    embeddedTerminal: {
      start: { invoke: mocks.start },
      write: { invoke: mocks.write },
      resize: { invoke: mocks.resize },
      kill: { invoke: mocks.kill },
      output: {
        on: (listener: (output: EmbeddedTerminalOutput) => void) => {
          mocks.listeners.add(listener);
          return () => mocks.listeners.delete(listener);
        },
      },
    },
  },
}));
vi.mock('@/renderer/utils/platform', () => ({ isElectronDesktop: mocks.desktop }));
vi.mock('@/renderer/utils/workspace/backendCache', () => ({ getActiveBackendEnvironment: mocks.environment }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@xterm/addon-fit', () => ({
  FitAddon: class {
    fit = vi.fn();
  },
}));
vi.mock('@xterm/xterm', () => ({
  Terminal: class {
    cols = 100;
    rows = 30;
    options = {};
    write = vi.fn();
    writeln = vi.fn();
    dispose = vi.fn();
    loadAddon = vi.fn();
    open = vi.fn();
    focus = vi.fn();
    refresh = vi.fn();
    onData = () => ({ dispose: vi.fn() });
    constructor() {
      mocks.terminals.push(this);
    }
  },
}));

describe('embedded terminal panes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.terminals.length = 0;
    mocks.listeners.clear();
    mocks.desktop.mockReturnValue(true);
    mocks.environment.mockReturnValue({ type: 'local' });
    mocks.start.mockImplementation(async (params: EmbeddedTerminalStartParams) => ({
      terminal_id: params.terminal_id,
    }));
    mocks.write.mockResolvedValue(undefined);
    mocks.resize.mockResolvedValue(undefined);
    mocks.kill.mockResolvedValue(undefined);
  });

  it('keeps running shells when splitting and closes only the selected pane', async () => {
    render(<EmbeddedTerminalPanel workspacePath='/repo' />);
    await waitFor(() => expect(mocks.start).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: 'conversation.explorer.terminal.splitHorizontal' }));
    await waitFor(() => expect(mocks.start).toHaveBeenCalledTimes(2));
    fireEvent.click(screen.getByRole('button', { name: 'conversation.explorer.terminal.splitVertical' }));
    await waitFor(() => expect(mocks.start).toHaveBeenCalledTimes(3));
    expect(mocks.terminals[0].dispose).not.toHaveBeenCalled();
    const paneId = mocks.start.mock.calls[2][0].terminal_id;
    fireEvent.click(screen.getAllByRole('button', { name: 'common.close' })[2]);
    await waitFor(() => expect(mocks.kill).toHaveBeenCalledWith({ terminal_id: paneId }));
    expect(mocks.start).toHaveBeenCalledTimes(3);
  });

  it('receives a shell prompt emitted before the start response arrives', async () => {
    mocks.start.mockImplementation(async (params: EmbeddedTerminalStartParams) => {
      mocks.listeners.forEach((listener) =>
        listener({ terminal_id: params.terminal_id, type: 'data', data: 'prompt> ' })
      );
      return { terminal_id: params.terminal_id };
    });
    render(<EmbeddedTerminalPanel workspacePath='/repo' />);
    await waitFor(() => expect(mocks.terminals[0].write).toHaveBeenCalledWith('prompt> '));
  });

  it('shows a startup failure and lets the user retry', async () => {
    mocks.start.mockRejectedValueOnce(new Error('Missing native module'));
    render(<EmbeddedTerminalPanel workspacePath='/repo' />);
    fireEvent.click(await screen.findByRole('button', { name: 'common.retry' }));
    await waitFor(() => expect(mocks.start).toHaveBeenCalledTimes(2));
    expect(mocks.terminals[0].writeln).toHaveBeenCalledWith('Missing native module');
    expect(screen.queryByRole('button', { name: 'common.retry' })).toBeNull();
  });

  it('cleans up a shell that finishes starting after its pane closes', async () => {
    let finish!: (value: { terminal_id: string }) => void;
    mocks.start.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      })
    );
    const { unmount } = render(<EmbeddedTerminalPanel workspacePath='/repo' />);
    const terminalId = mocks.start.mock.calls[0][0].terminal_id;
    unmount();
    await act(async () => finish({ terminal_id: terminalId }));
    expect(mocks.kill).toHaveBeenLastCalledWith({ terminal_id: terminalId });
    expect(mocks.listeners.size).toBe(0);
  });

  it('retains the shell when translation functions change', async () => {
    const { rerender } = render(<EmbeddedTerminalPanel workspacePath='/repo' />);
    await waitFor(() => expect(mocks.start).toHaveBeenCalledTimes(1));
    rerender(<EmbeddedTerminalPanel workspacePath='/repo' />);
    expect(mocks.start).toHaveBeenCalledTimes(1);
    expect(mocks.terminals[0].dispose).not.toHaveBeenCalled();
  });

  it('resizes a split with the keyboard', async () => {
    render(<EmbeddedTerminalPanel workspacePath='/repo' />);
    fireEvent.click(screen.getByRole('button', { name: 'conversation.explorer.terminal.splitHorizontal' }));
    fireEvent.keyDown(screen.getByRole('separator'), { key: 'ArrowRight' });
    expect(screen.getByRole('separator')).toHaveAttribute('aria-valuenow', '55');
    await waitFor(() => expect(mocks.start).toHaveBeenCalledTimes(2));
  });

  it('does not start a shell without a project directory', () => {
    render(<EmbeddedTerminalPanel />);
    expect(screen.getByText('conversation.explorer.terminal.selectWorkspace')).toBeInTheDocument();
    expect(mocks.start).not.toHaveBeenCalled();
  });

  it('does not launch a local shell for a remote project', () => {
    mocks.environment.mockReturnValue({ type: 'remote', id: 'remote-1', name: 'Remote project', kind: 'ssh' });
    render(<EmbeddedTerminalPanel workspacePath='/remote/repo' />);
    expect(screen.getByText('conversation.explorer.terminal.unavailable')).toBeInTheDocument();
    expect(mocks.start).not.toHaveBeenCalled();
  });

  it('does not attempt desktop IPC from a browser', () => {
    mocks.desktop.mockReturnValue(false);
    render(<EmbeddedTerminalPanel workspacePath='/repo' />);
    expect(mocks.start).not.toHaveBeenCalled();
  });
});
