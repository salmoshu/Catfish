import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TChatConversation } from '@/common/config/storage';
import type { BackendEnvironment } from '@/common/types/remote';
import { recordEnvironmentProjects } from '@/renderer/utils/workspace/environmentProjects';
import EnvironmentProjects from '@/renderer/components/remote/EnvironmentProjects';

const mocks = vi.hoisted(() => ({
  local: vi.fn(),
  list: vi.fn(),
  connect: vi.fn(),
  disconnect: vi.fn(),
  reload: vi.fn(),
  error: vi.fn(),
}));
vi.mock('@/common', () => ({
  ipcBridge: {
    remoteEnvironment: {
      localConversations: { invoke: mocks.local },
      list: { invoke: mocks.list },
      connect: { invoke: mocks.connect },
      disconnect: { invoke: mocks.disconnect },
    },
  },
}));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@arco-design/web-react', async (original) => ({
  ...(await original<typeof import('@arco-design/web-react')>()),
  Message: { error: mocks.error },
}));
vi.mock('@/renderer/components/remote/RemoteConnectionModal', () => ({
  default: ({ onConnected }: { onConnected: () => void }) => <button onClick={onConnected}>complete-connection</button>,
}));

const remote: BackendEnvironment = { type: 'remote', id: 'wsl-1', name: 'Ubuntu-20.04', kind: 'wsl' };
const conversation = (id: string, workspace: string): TChatConversation =>
  ({
    id,
    name: id,
    type: 'acp',
    created_at: 1,
    modified_at: 2,
    extra: { backend: 'kimi', workspace, custom_workspace: true },
  }) as TChatConversation;

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  window.__backendEnvironment = { type: 'local' };
  mocks.local.mockResolvedValue([conversation('local-chat', 'E:/LocalProject')]);
  mocks.list.mockResolvedValue([{ ...remote, status: 'disconnected', createdAt: 1, updatedAt: 1 }]);
  mocks.connect.mockResolvedValue({ ok: true, data: remote });
  mocks.disconnect.mockResolvedValue({ ok: true, data: { type: 'local' } });
  vi.stubGlobal('location', { ...window.location, hash: '#/guid', reload: mocks.reload });
});
afterEach(() => {
  cleanup();
  delete window.__backendEnvironment;
  vi.unstubAllGlobals();
});

describe('projects across environments', () => {
  it('loads and displays local projects while a remote backend is active', async () => {
    window.__backendEnvironment = remote;
    render(<EnvironmentProjects collapsed={false} />);
    fireEvent.click(await screen.findByText('LocalProject'));
    expect(screen.getByRole('button', { name: 'local-chat' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'LocalProject' })).toBeInTheDocument();
    expect(screen.queryByText('guid.workspace.remote.local')).not.toBeInTheDocument();
  });

  it('uses only a globe and workspace basename for cached remote projects', () => {
    recordEnvironmentProjects([conversation('remote-chat', '/home/user/RemoteProject')], remote);
    render(<EnvironmentProjects collapsed={false} />);

    const icon = screen.getByRole('img', { name: 'RemoteProject' });
    expect(icon.querySelector('[data-kimi-icon="globe"]')).toBeInTheDocument();
    expect(icon.parentElement?.querySelectorAll('svg')).toHaveLength(1);
    expect(screen.queryByRole('img', { name: /Ubuntu/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/Ubuntu/)).not.toBeInTheDocument();
  });

  it('matches local hover actions without offering a dead archive action', async () => {
    recordEnvironmentProjects([conversation('remote-chat', '/home/user/RemoteProject')], remote);
    render(<EnvironmentProjects collapsed={false} />);

    const newConversation = screen.getByRole('button', { name: 'conversation.history.newConversationInProject' });
    const projectActions = screen.getByLabelText('common.more');
    expect(newConversation).toHaveClass('hidden', 'group-hover:flex');
    expect(projectActions).toHaveClass('hidden', 'group-hover:flex');

    fireEvent.click(projectActions);
    expect(await screen.findByText('mcp.connect')).toBeInTheDocument();
    expect(screen.queryByText('conversation.history.archiveProject')).not.toBeInTheDocument();
  });

  it('does not render cached remote sessions while the environment is inactive', () => {
    recordEnvironmentProjects([conversation('remote-chat', '/home/user/RemoteProject')], remote);
    render(<EnvironmentProjects collapsed={false} />);

    fireEvent.click(screen.getByText('RemoteProject'));
    expect(screen.queryByText('remote-chat')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'remote-chat' })).not.toBeInTheDocument();
  });

  it('connects directly and reloads the selected workspace only after success', async () => {
    recordEnvironmentProjects([conversation('remote-chat', '/home/user/Remote Project')], remote);
    render(<EnvironmentProjects collapsed={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'conversation.history.newConversationInProject' }));

    await waitFor(() => expect(mocks.reload).toHaveBeenCalledOnce());
    expect(mocks.connect).toHaveBeenCalledWith({ id: 'wsl-1' });
    expect(mocks.list).not.toHaveBeenCalled();
    expect(mocks.disconnect).not.toHaveBeenCalled();
    expect(window.location.hash).toBe('/guid?workspace=%2Fhome%2Fuser%2FRemote%20Project');
    expect(screen.queryByRole('button', { name: 'complete-connection' })).not.toBeInTheDocument();
  });

  it('keeps the route and uses the modal only as a failed-connection fallback', async () => {
    mocks.connect.mockResolvedValue({ ok: false, code: 'connection_failed', message: 'Unavailable' });
    recordEnvironmentProjects([conversation('remote-chat', '/home/user/RemoteProject')], remote);
    render(<EnvironmentProjects collapsed={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'conversation.history.newConversationInProject' }));

    expect(await screen.findByRole('button', { name: 'complete-connection' })).toBeInTheDocument();
    expect(mocks.connect).toHaveBeenCalledWith({ id: 'wsl-1' });
    expect(mocks.reload).not.toHaveBeenCalled();
    expect(window.location.hash).toBe('#/guid');
  });

  it('returns to the local backend before opening a local conversation', async () => {
    window.__backendEnvironment = remote;
    render(<EnvironmentProjects collapsed={false} />);
    fireEvent.click(await screen.findByText('LocalProject'));
    fireEvent.click(screen.getByRole('button', { name: 'local-chat' }));
    await waitFor(() => expect(mocks.reload).toHaveBeenCalledOnce());
    expect(mocks.disconnect).toHaveBeenCalledOnce();
    expect(window.location.hash).toBe('/conversation/local-chat');
  });

  it('keeps the current environment and route when switching fails', async () => {
    window.__backendEnvironment = remote;
    mocks.disconnect.mockResolvedValue({ ok: false, code: 'failed', message: 'Disconnect failed' });
    render(<EnvironmentProjects collapsed={false} />);
    fireEvent.click(await screen.findByText('LocalProject'));
    fireEvent.click(screen.getByRole('button', { name: 'local-chat' }));
    await waitFor(() => expect(mocks.error).toHaveBeenCalledWith('Disconnect failed'));
    expect(mocks.reload).not.toHaveBeenCalled();
    expect(window.location.hash).toBe('#/guid');
  });

  it('retains cached local projects when the local backend refresh fails', async () => {
    window.__backendEnvironment = remote;
    recordEnvironmentProjects([conversation('cached-local', 'E:/CachedProject')], { type: 'local' });
    mocks.local.mockRejectedValue(new Error('Local backend unavailable'));
    render(<EnvironmentProjects collapsed={false} />);
    fireEvent.click(await screen.findByText('CachedProject'));
    expect(screen.getByRole('button', { name: 'cached-local' })).toBeInTheDocument();
  });
});
