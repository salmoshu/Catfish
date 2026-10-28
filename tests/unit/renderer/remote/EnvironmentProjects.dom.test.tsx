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
  disconnect: vi.fn(),
  reload: vi.fn(),
  error: vi.fn(),
}));
vi.mock('@/common', () => ({
  ipcBridge: {
    remoteEnvironment: {
      localConversations: { invoke: mocks.local },
      list: { invoke: mocks.list },
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
vi.mock('@/renderer/pages/conversation/components/WorkspaceCollapse', () => ({
  default: ({
    header,
    trailing,
    children,
    onToggle,
  }: {
    header: React.ReactNode;
    trailing: React.ReactNode;
    children: React.ReactNode;
    onToggle: () => void;
  }) => (
    <section>
      <button onClick={onToggle}>{header}</button>
      {trailing}
      {children}
    </section>
  ),
}));

const remote: BackendEnvironment = { type: 'remote', id: 'wsl-1', name: 'Ubuntu', kind: 'wsl' };
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
    expect(await screen.findByText('LocalProject')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'local-chat' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'guid.workspace.remote.local' })).toBeInTheDocument();
    expect(screen.queryByText('guid.workspace.remote.local')).not.toBeInTheDocument();
  });

  it('reconnects before opening a remote conversation on its own backend', async () => {
    recordEnvironmentProjects([conversation('remote-chat', '/home/user/RemoteProject')], remote);
    render(<EnvironmentProjects collapsed={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'remote-chat' }));
    fireEvent.click(await screen.findByRole('button', { name: 'complete-connection' }));
    expect(mocks.reload).toHaveBeenCalledOnce();
    expect(window.location.hash).toBe('/conversation/remote-chat');
    expect(mocks.disconnect).not.toHaveBeenCalled();
    expect(screen.getByRole('img', { name: 'Ubuntu' })).toBeInTheDocument();
    expect(screen.queryByText('Ubuntu')).not.toBeInTheDocument();
  });

  it('preserves the selected project path when starting a new remote conversation', async () => {
    recordEnvironmentProjects([conversation('remote-chat', '/home/user/Remote Project')], remote);
    render(<EnvironmentProjects collapsed={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'conversation.history.newConversationInProject' }));
    fireEvent.click(await screen.findByRole('button', { name: 'complete-connection' }));
    expect(window.location.hash).toBe('/guid?workspace=%2Fhome%2Fuser%2FRemote%20Project');
  });

  it('returns to the local backend before opening a local conversation', async () => {
    window.__backendEnvironment = remote;
    render(<EnvironmentProjects collapsed={false} />);
    fireEvent.click(await screen.findByRole('button', { name: 'local-chat' }));
    await waitFor(() => expect(mocks.reload).toHaveBeenCalledOnce());
    expect(mocks.disconnect).toHaveBeenCalledOnce();
    expect(window.location.hash).toBe('/conversation/local-chat');
  });

  it('keeps the current environment and route when switching fails', async () => {
    window.__backendEnvironment = remote;
    mocks.disconnect.mockResolvedValue({ ok: false, code: 'failed', message: 'Disconnect failed' });
    render(<EnvironmentProjects collapsed={false} />);
    fireEvent.click(await screen.findByRole('button', { name: 'local-chat' }));
    await waitFor(() => expect(mocks.error).toHaveBeenCalledWith('Disconnect failed'));
    expect(mocks.reload).not.toHaveBeenCalled();
    expect(window.location.hash).toBe('#/guid');
  });

  it('retains cached local projects when the local backend refresh fails', async () => {
    window.__backendEnvironment = remote;
    recordEnvironmentProjects([conversation('cached-local', 'E:/CachedProject')], { type: 'local' });
    mocks.local.mockRejectedValue(new Error('Local backend unavailable'));
    render(<EnvironmentProjects collapsed={false} />);
    expect(await screen.findByRole('button', { name: 'cached-local' })).toBeInTheDocument();
  });
});
