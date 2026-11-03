import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RemoteEnvironmentSummary } from '@/common/types/remote';
import GuidWorkspaceFootnote from '@renderer/pages/guid/components/GuidWorkspaceFootnote';

const PENDING_KEY = 'aionui:remote-workspace-picker:pending';
const reloadMock = vi.fn();
const remoteMocks = vi.hoisted(() => ({ showOpen: vi.fn(), disconnect: vi.fn() }));
const environment: RemoteEnvironmentSummary = {
  id: 'wsl-ubuntu',
  kind: 'wsl',
  name: 'Ubuntu 20.04',
  distribution: 'Ubuntu 20.04',
  createdAt: 1,
  updatedAt: 1,
  status: 'connected',
};

vi.mock('@/common', () => ({
  ipcBridge: {
    dialog: { showOpen: { invoke: remoteMocks.showOpen } },
    remoteEnvironment: { disconnect: { invoke: remoteMocks.disconnect } },
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@renderer/components/remote/RemoteConnectionModal', () => ({
  default: ({ onConnected }: { onConnected: () => void }) => <button onClick={onConnected}>mock-connected</button>,
}));

vi.mock('@renderer/components/remote/RemoteEnvironmentMenu', () => ({
  default: ({
    onRequestConnection,
    onRequestWorkspace,
  }: {
    onRequestConnection: (environment: RemoteEnvironmentSummary) => void;
    onRequestWorkspace: (environment: RemoteEnvironmentSummary) => void;
  }) => (
    <>
      <button onClick={() => onRequestConnection(environment)}>mock-connect-environment</button>
      <button onClick={() => onRequestWorkspace(environment)}>mock-active-workspace</button>
    </>
  ),
}));

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(() => ({
    matches: false,
    media: '',
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

const renderFootnote = (workspaceDir = '') => {
  const onSelectWorkspace = vi.fn();
  render(
    <GuidWorkspaceFootnote
      workspaceDir={workspaceDir}
      onSelectWorkspace={onSelectWorkspace}
      onClearWorkspace={vi.fn()}
    />
  );
  return onSelectWorkspace;
};

describe('GuidWorkspaceFootnote remote directory selection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    localStorage.clear();
    window.__backendEnvironment = { type: 'local' };
    remoteMocks.showOpen.mockResolvedValue([]);
    remoteMocks.disconnect.mockResolvedValue({ ok: true, data: { type: 'local' } });
    vi.stubGlobal('location', { ...window.location, hash: '#/guid', reload: reloadMock });
  });

  afterEach(() => {
    cleanup();
    delete window.__backendEnvironment;
    vi.unstubAllGlobals();
  });

  it('queues the directory picker before reloading a successful connection', () => {
    renderFootnote();

    fireEvent.click(screen.getByTestId('workspace-selector-btn'));
    fireEvent.click(screen.getByText('mock-connect-environment'));
    fireEvent.click(screen.getByText('mock-connected'));

    expect(sessionStorage.getItem(PENDING_KEY)).toBe('1');
    expect(reloadMock).toHaveBeenCalledOnce();
    expect(remoteMocks.showOpen).not.toHaveBeenCalled();
  });

  it('opens the picker after reconnecting and selects the real remote path', async () => {
    window.__backendEnvironment = { type: 'remote', id: environment.id, name: environment.name, kind: 'wsl' };
    sessionStorage.setItem(PENDING_KEY, '1');
    remoteMocks.showOpen.mockResolvedValue(['/home/winchell/CatfishCore']);
    const onSelectWorkspace = renderFootnote();

    await waitFor(() => expect(onSelectWorkspace).toHaveBeenCalledWith('/home/winchell/CatfishCore'));
    expect(remoteMocks.showOpen).toHaveBeenCalledWith({ properties: ['openDirectory', 'createDirectory'] });
    expect(sessionStorage.getItem(PENDING_KEY)).toBeNull();
    expect(JSON.parse(localStorage.getItem('aionui:recent-workspaces:remote:wsl-ubuntu') ?? '[]')).toEqual([
      '/home/winchell/CatfishCore',
    ]);
  });

  it('does not set a workspace when the post-connection picker is cancelled', async () => {
    window.__backendEnvironment = { type: 'remote', id: environment.id, name: environment.name, kind: 'wsl' };
    sessionStorage.setItem(PENDING_KEY, '1');
    remoteMocks.showOpen.mockResolvedValue(undefined);
    const onSelectWorkspace = renderFootnote();

    await waitFor(() => expect(remoteMocks.showOpen).toHaveBeenCalledOnce());
    expect(sessionStorage.getItem(PENDING_KEY)).toBeNull();
    expect(onSelectWorkspace).not.toHaveBeenCalled();
  });

  it('opens the picker for an active environment without reconnecting', async () => {
    window.__backendEnvironment = { type: 'remote', id: environment.id, name: environment.name, kind: 'wsl' };
    remoteMocks.showOpen.mockResolvedValue(['/home/winchell/E-Wagon']);
    const onSelectWorkspace = renderFootnote();

    fireEvent.click(screen.getByTestId('workspace-selector-btn'));
    fireEvent.click(screen.getByText('mock-active-workspace'));

    await waitFor(() => expect(onSelectWorkspace).toHaveBeenCalledWith('/home/winchell/E-Wagon'));
    expect(remoteMocks.showOpen).toHaveBeenCalledOnce();
    expect(reloadMock).not.toHaveBeenCalled();
    expect(screen.queryByText('mock-connected')).toBeNull();
    expect(screen.queryByRole('img', { name: environment.name })).not.toBeInTheDocument();
    expect(screen.queryByText(environment.name)).not.toBeInTheDocument();
  });

  it('shows local recent projects by default and disconnects before opening one', async () => {
    window.__backendEnvironment = { type: 'remote', id: environment.id, name: environment.name, kind: 'wsl' };
    localStorage.setItem('aionui:recent-workspaces', JSON.stringify(['E:/LocalProject']));
    localStorage.setItem('aionui:recent-workspaces:remote:wsl-ubuntu', JSON.stringify(['/home/RemoteProject']));
    const onSelectWorkspace = renderFootnote('/home/CurrentProject');

    fireEvent.click(screen.getByText('CurrentProject'));
    expect(screen.getByText('LocalProject')).toBeInTheDocument();
    expect(screen.queryByText('RemoteProject')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('LocalProject'));

    await waitFor(() => expect(reloadMock).toHaveBeenCalledOnce());
    expect(remoteMocks.disconnect).toHaveBeenCalledOnce();
    expect(window.location.hash).toBe('/guid?workspace=E%3A%2FLocalProject');
    expect(onSelectWorkspace).not.toHaveBeenCalled();
  });

  it('returns to the local backend before opening the main local folder picker', async () => {
    window.__backendEnvironment = { type: 'remote', id: environment.id, name: environment.name, kind: 'wsl' };
    renderFootnote();

    fireEvent.click(screen.getByTestId('workspace-selector-btn'));
    fireEvent.click(screen.getByText('team.create.chooseDifferentFolder'));

    await waitFor(() => expect(reloadMock).toHaveBeenCalledOnce());
    expect(remoteMocks.disconnect).toHaveBeenCalledOnce();
    expect(sessionStorage.getItem('aionui:local-workspace-picker:pending')).toBe('1');
    expect(remoteMocks.showOpen).not.toHaveBeenCalled();
  });

  it('uses only the workspace basename in remote tooltips and accessible labels', async () => {
    window.__backendEnvironment = { type: 'remote', id: environment.id, name: environment.name, kind: 'wsl' };
    const workspaceDir = '\\\\wsl$\\Ubuntu-20.04\\home\\winchell\\CatfishCore';
    renderFootnote(workspaceDir);

    const icon = screen.getByRole('img', { name: 'CatfishCore' });
    expect(document.querySelectorAll('[data-kimi-icon="globe"]')).toHaveLength(2);
    expect(document.querySelector('[data-kimi-icon="folder"]')).not.toBeInTheDocument();
    fireEvent.mouseOver(icon);
    expect((await screen.findAllByText('CatfishCore')).length).toBeGreaterThan(0);
    expect(screen.queryByRole('img', { name: /Ubuntu/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/Ubuntu/)).not.toBeInTheDocument();
    expect(screen.queryByText(workspaceDir)).not.toBeInTheDocument();
  });
});
