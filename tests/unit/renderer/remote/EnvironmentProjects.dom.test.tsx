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
  activate: vi.fn(),
  switchRoute: vi.fn(),
  reload: vi.fn(),
  error: vi.fn(),
  progressOn: vi.fn(() => () => {}),
  disconnectedOn: vi.fn(() => () => {}),
}));
vi.mock('@/common', () => ({
  ipcBridge: {
    remoteEnvironment: {
      localConversations: { invoke: mocks.local },
      list: { invoke: mocks.list },
      connect: { invoke: mocks.connect },
      activate: { invoke: mocks.activate },
      progress: { on: mocks.progressOn },
      disconnected: { on: mocks.disconnectedOn },
    },
  },
}));
vi.mock('@/renderer/utils/workspace/backendSwitch', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/renderer/utils/workspace/backendSwitch')>()),
  switchBackendRoute: mocks.switchRoute,
}));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@arco-design/web-react', async (original) => ({
  ...(await original<typeof import('@arco-design/web-react')>()),
  Message: { error: mocks.error },
}));
vi.mock('@icon-park/react', async (original) => ({
  ...(await original<typeof import('@icon-park/react')>()),
  FolderClose: () => <svg data-testid='folder-close' />,
  FolderOpen: () => <svg data-testid='folder-open' />,
  Refresh: ({ className }: { className?: string }) => <svg data-testid='reconnect-icon' className={className} />,
}));
vi.mock('@/renderer/components/remote/RemoteConnectionModal', () => ({
  default: ({ onConnected }: { onConnected: () => void }) => <button onClick={onConnected}>complete-connection</button>,
}));
vi.mock('@/renderer/pages/conversation/GroupedHistory/ConversationRow', () => ({
  ConversationIdentityIcon: ({ conversation }: { conversation: TChatConversation }) => (
    <svg data-testid='cached-agent-icon' data-backend={(conversation.extra as { backend?: string }).backend} />
  ),
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
  mocks.list.mockResolvedValue([{ ...remote, status: 'connected', createdAt: 1, updatedAt: 1 }]);
  mocks.connect.mockResolvedValue({ ok: true, data: remote });
  mocks.activate.mockImplementation((params: { id?: string } = {}) =>
    Promise.resolve(
      params.id ? { ok: false, code: 'not_connected', message: 'not connected' } : { ok: true, data: { type: 'local' } }
    )
  );
  mocks.switchRoute.mockResolvedValue(undefined);
  vi.stubGlobal('location', { ...window.location, hash: '#/guid', reload: mocks.reload });
});
afterEach(() => {
  cleanup();
  delete window.__backendEnvironment;
  vi.unstubAllGlobals();
});

describe('projects across environments', () => {
  it('hides remote projects and their sessions until the environment is connected', async () => {
    mocks.list.mockResolvedValue([{ ...remote, status: 'disconnected', createdAt: 1, updatedAt: 1 }]);
    recordEnvironmentProjects([conversation('remote-chat', '/home/user/RemoteProject')], remote);
    render(<EnvironmentProjects collapsed={false} />);

    await waitFor(() => expect(mocks.list).toHaveBeenCalled());
    expect(screen.queryByText('RemoteProject')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'remote-chat' })).not.toBeInTheDocument();
  });

  it('removes a remote project when its environment disconnects', async () => {
    let onDisconnect: (event: { environmentId: string }) => void = () => {};
    mocks.disconnectedOn.mockImplementation((listener: typeof onDisconnect) => {
      onDisconnect = listener;
      return () => {};
    });
    recordEnvironmentProjects([conversation('remote-chat', '/home/user/RemoteProject')], remote);
    render(<EnvironmentProjects collapsed={false} />);

    expect(await screen.findByText('RemoteProject')).toBeInTheDocument();
    onDisconnect({ environmentId: remote.id });
    await waitFor(() => expect(screen.queryByText('RemoteProject')).not.toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'remote-chat' })).not.toBeInTheDocument();
  });

  it('aligns cached local headers and retains the new-conversation action', async () => {
    window.__backendEnvironment = remote;
    render(<EnvironmentProjects collapsed={false} />);

    const localHeader = await screen.findByText('LocalProject');
    expect(localHeader).toHaveClass('text-14px', 'font-[500]', 'truncate', 'flex-1', 'text-t-primary', 'min-w-0');
    expect(screen.getByTestId('folder-close')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'conversation.history.newConversationInProject' })).toHaveClass(
      'hidden',
      'group-hover:flex'
    );
    fireEvent.click(localHeader);
    expect(screen.getByRole('button', { name: 'local-chat' })).toBeInTheDocument();
    expect(screen.getByTestId('cached-agent-icon')).toHaveAttribute('data-backend', 'kimi');
  });

  it('uses only a globe and workspace basename for connected remote projects', async () => {
    recordEnvironmentProjects([conversation('remote-chat', '/home/user/RemoteProject')], remote);
    render(<EnvironmentProjects collapsed={false} />);

    const icon = await screen.findByRole('img', { name: 'RemoteProject' });
    expect(icon.querySelector('[data-kimi-icon="globe"]')).toBeInTheDocument();
    expect(icon.parentElement?.querySelectorAll('svg')).toHaveLength(1);
    expect(screen.queryByRole('img', { name: /Ubuntu/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/Ubuntu/)).not.toBeInTheDocument();
  });

  it('keeps connected sessions expanded across environment remounts without switching', async () => {
    recordEnvironmentProjects([conversation('remote-chat', '/home/user/RemoteProject')], remote);
    const first = render(<EnvironmentProjects collapsed={false} />);

    fireEvent.click(await screen.findByText('RemoteProject'));
    expect(screen.getByRole('button', { name: 'remote-chat' })).toBeInTheDocument();
    expect(mocks.connect).not.toHaveBeenCalled();
    expect(mocks.reload).not.toHaveBeenCalled();

    first.unmount();
    render(<EnvironmentProjects collapsed={false} />);
    expect(await screen.findByRole('button', { name: 'remote-chat' })).toBeInTheDocument();
    expect(mocks.connect).not.toHaveBeenCalled();
  });

  it('shows project activity only while collapsed and conversation activity on the right while expanded', async () => {
    recordEnvironmentProjects([conversation('remote-chat', '/home/user/RemoteProject')], remote);
    render(
      <EnvironmentProjects
        collapsed={false}
        isConversationGenerating={(conversationId) => conversationId === 'remote-chat'}
      />
    );

    expect(await screen.findByTestId('cached-project-running')).toBeInTheDocument();
    expect(screen.queryByTestId('cached-conversation-running')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('RemoteProject'));
    expect(screen.getByTestId('cached-conversation-running')).toBeInTheDocument();
    expect(screen.queryByTestId('cached-project-running')).not.toBeInTheDocument();
    expect(screen.getByTestId('cached-agent-icon')).toBeInTheDocument();
  });

  it('activates the remote backend only after a cached conversation is selected', async () => {
    recordEnvironmentProjects([conversation('remote-chat', '/home/user/Remote Project')], remote);
    render(<EnvironmentProjects collapsed={false} />);
    fireEvent.click(await screen.findByText('Remote Project'));
    fireEvent.click(screen.getByRole('button', { name: 'remote-chat' }));

    await waitFor(() => expect(mocks.switchRoute).toHaveBeenCalledOnce());
    expect(mocks.reload).not.toHaveBeenCalled();
    expect(mocks.activate).toHaveBeenCalledWith({ id: 'wsl-1' });
    expect(mocks.connect).toHaveBeenCalledWith({ id: 'wsl-1' });
    expect(mocks.switchRoute).toHaveBeenCalledWith('/conversation/remote-chat');
  });

  it('uses the modal as a failed-connection fallback', async () => {
    mocks.connect.mockResolvedValue({ ok: false, code: 'connection_failed', message: 'Unavailable' });
    recordEnvironmentProjects([conversation('remote-chat', '/home/user/RemoteProject')], remote);
    render(<EnvironmentProjects collapsed={false} />);
    fireEvent.click(await screen.findByText('RemoteProject'));
    fireEvent.click(screen.getByRole('button', { name: 'mcp.connect' }));

    expect(await screen.findByRole('button', { name: 'complete-connection' })).toBeInTheDocument();
    expect(mocks.connect).toHaveBeenCalledWith({ id: 'wsl-1' });
    expect(mocks.reload).not.toHaveBeenCalled();
    expect(window.location.hash).toBe('#/guid');
  });

  it('filters out projects from the active remote environment', async () => {
    const inactiveRemote: BackendEnvironment = { ...remote, id: 'wsl-2', name: 'Ubuntu-22.04' };
    window.__backendEnvironment = remote;
    mocks.local.mockResolvedValue([]);
    mocks.list.mockResolvedValue([
      { ...remote, status: 'connected', createdAt: 1, updatedAt: 1 },
      { ...inactiveRemote, status: 'connected', createdAt: 1, updatedAt: 1 },
    ]);
    recordEnvironmentProjects([conversation('active-chat', '/home/user/ActiveProject')], remote);
    recordEnvironmentProjects([conversation('inactive-chat', '/home/user/InactiveProject')], inactiveRemote);
    render(<EnvironmentProjects collapsed={false} />);

    expect(await screen.findByText('InactiveProject')).toBeInTheDocument();
    expect(screen.queryByText('ActiveProject')).not.toBeInTheDocument();
    expect(screen.queryByText('active-chat')).not.toBeInTheDocument();
  });

  it('returns to the local backend before opening a local conversation', async () => {
    window.__backendEnvironment = remote;
    render(<EnvironmentProjects collapsed={false} />);
    fireEvent.click(await screen.findByText('LocalProject'));
    fireEvent.click(screen.getByRole('button', { name: 'local-chat' }));
    await waitFor(() => expect(mocks.switchRoute).toHaveBeenCalledOnce());
    expect(mocks.reload).not.toHaveBeenCalled();
    expect(mocks.activate).toHaveBeenCalledWith({});
    expect(mocks.switchRoute).toHaveBeenCalledWith('/conversation/local-chat');
  });
});
