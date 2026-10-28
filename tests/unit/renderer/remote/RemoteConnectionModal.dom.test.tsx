import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Modal } from '@arco-design/web-react';
import '@arco-design/web-react/lib/_util/react-19-adapter';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  RemoteEnvironmentDiscovery,
  RemoteEnvironmentProgress,
  RemoteEnvironmentSummary,
} from '@/common/types/remote';

const remoteMocks = vi.hoisted(() => ({
  discover: vi.fn(),
  save: vi.fn(),
  connect: vi.fn(),
  cancel: vi.fn(),
  selectPrivateKey: vi.fn(),
  list: vi.fn(),
  state: vi.fn(),
  disconnect: vi.fn(),
  remove: vi.fn(),
  progressOn: vi.fn(),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    remoteEnvironment: {
      discover: { invoke: remoteMocks.discover },
      save: { invoke: remoteMocks.save },
      connect: { invoke: remoteMocks.connect },
      cancel: { invoke: remoteMocks.cancel },
      selectPrivateKey: { invoke: remoteMocks.selectPrivateKey },
      list: { invoke: remoteMocks.list },
      state: { invoke: remoteMocks.state },
      disconnect: { invoke: remoteMocks.disconnect },
      remove: { invoke: remoteMocks.remove },
      progress: { on: remoteMocks.progressOn },
    },
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en-US' } }),
}));

vi.mock('@renderer/components/base/AionModal', () => {
  type Header = { title?: React.ReactNode; subtitle?: React.ReactNode } | React.ReactNode;
  type Footer = { render?: () => React.ReactNode } | React.ReactNode;
  const headerContent = (header: Header) => {
    if (!header || typeof header !== 'object' || React.isValidElement(header)) return header;
    const config = header as { title?: React.ReactNode; subtitle?: React.ReactNode };
    return (
      <div>
        <h3>{config.title}</h3>
        <p>{config.subtitle}</p>
      </div>
    );
  };
  const footerContent = (footer: Footer) => {
    if (!footer || typeof footer !== 'object' || React.isValidElement(footer)) return footer;
    return (footer as { render?: () => React.ReactNode }).render?.();
  };
  return {
    default: ({
      visible,
      header,
      footer,
      children,
    }: {
      visible: boolean;
      header: Header;
      footer: Footer;
      children: React.ReactNode;
    }) =>
      visible ? (
        <div data-testid='remote-modal'>
          {headerContent(header)}
          <div>{children}</div>
          <div>{footerContent(footer)}</div>
        </div>
      ) : null,
  };
});

import RemoteConnectionModal from '@renderer/components/remote/RemoteConnectionModal';
import RemoteEnvironmentMenu from '@renderer/components/remote/RemoteEnvironmentMenu';

const discovery: RemoteEnvironmentDiscovery = {
  wsl: { supported: true, distributions: ['Ubuntu'] },
  docker: { supported: true, containers: [{ id: 'container-1', name: 'dev', image: 'node:24' }] },
};

const wslEnvironment: RemoteEnvironmentSummary = {
  id: 'wsl-1',
  kind: 'wsl',
  name: 'Ubuntu',
  distribution: 'Ubuntu',
  createdAt: 1,
  updatedAt: 1,
  status: 'disconnected',
};

const sshEnvironment: RemoteEnvironmentSummary = {
  id: 'ssh-1',
  kind: 'ssh',
  name: 'root@example.test',
  host: 'example.test',
  port: 22,
  username: 'root',
  authType: 'password',
  createdAt: 1,
  updatedAt: 1,
  status: 'disconnected',
};

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

beforeEach(() => {
  vi.clearAllMocks();
  remoteMocks.discover.mockResolvedValue(discovery);
  remoteMocks.save.mockResolvedValue({ ok: true, data: sshEnvironment });
  remoteMocks.connect.mockResolvedValue({
    ok: true,
    data: { type: 'remote', id: sshEnvironment.id, name: sshEnvironment.name, kind: 'ssh' },
  });
  remoteMocks.cancel.mockResolvedValue(undefined);
  remoteMocks.list.mockResolvedValue([wslEnvironment]);
  remoteMocks.state.mockResolvedValue({ active: { type: 'local' } });
  remoteMocks.progressOn.mockReturnValue(() => {});
});

describe('RemoteConnectionModal', () => {
  it('closes the project picker before showing a deletion confirmation that survives its unmount', async () => {
    const Picker = () => {
      const [visible, setVisible] = React.useState(true);
      return visible ? (
        <div data-testid='workspace-popover' style={{ zIndex: 9999 }}>
          <RemoteEnvironmentMenu
            searchQuery=''
            onClose={() => setVisible(false)}
            onRequestConnection={vi.fn()}
            onRequestWorkspace={vi.fn()}
          />
        </div>
      ) : null;
    };
    render(<Picker />);
    fireEvent.click(await screen.findByRole('button', { name: 'guid.workspace.remote.remove' }));
    expect(screen.queryByTestId('workspace-popover')).not.toBeInTheDocument();
    expect(await screen.findByText('guid.workspace.remote.removeConfirmContent')).toBeInTheDocument();
    act(() => Modal.destroyAll());
  });
  it('saves an SSH connection and connects with the entered credentials', async () => {
    const onConnected = vi.fn();
    render(<RemoteConnectionModal visible onClose={vi.fn()} onConnected={onConnected} />);

    fireEvent.change(screen.getByPlaceholderText('guid.workspace.remote.hostPlaceholder'), {
      target: { value: 'example.test' },
    });
    fireEvent.change(screen.getByPlaceholderText('guid.workspace.remote.usernamePlaceholder'), {
      target: { value: 'root' },
    });
    fireEvent.change(screen.getByPlaceholderText('guid.workspace.remote.passwordPlaceholder'), {
      target: { value: 'secret' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'guid.workspace.remote.addAndConnect' }));

    await waitFor(() => expect(onConnected).toHaveBeenCalled());
    expect(remoteMocks.save).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'ssh', host: 'example.test', username: 'root', password: 'secret', port: 22 })
    );
    expect(remoteMocks.connect).toHaveBeenCalledWith({ id: 'ssh-1', hostKeyApproval: undefined });
  });

  it('requires explicit trust for a new SSH host key', async () => {
    remoteMocks.connect
      .mockResolvedValueOnce({
        ok: false,
        code: 'host_key_confirmation_required',
        message: 'untrusted',
        hostKey: { host: 'example.test', port: 22, fingerprint: 'SHA256:new' },
      })
      .mockResolvedValueOnce({
        ok: true,
        data: { type: 'remote', id: 'ssh-1', name: 'root@example.test', kind: 'ssh' },
      });
    const onConnected = vi.fn();
    render(<RemoteConnectionModal visible environment={sshEnvironment} onClose={vi.fn()} onConnected={onConnected} />);

    expect(await screen.findByText('SHA256:new')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'guid.workspace.remote.trustAndContinue' }));

    await waitFor(() => expect(onConnected).toHaveBeenCalled());
    expect(remoteMocks.connect).toHaveBeenNthCalledWith(2, {
      id: 'ssh-1',
      hostKeyApproval: { fingerprint: 'SHA256:new', allowChange: false },
    });
  });

  it('retries a failed connection without saving a duplicate environment', async () => {
    remoteMocks.connect.mockResolvedValue({ ok: false, code: 'connection_failed', message: 'unavailable' });
    render(<RemoteConnectionModal visible onClose={vi.fn()} onConnected={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText('guid.workspace.remote.hostPlaceholder'), {
      target: { value: 'example.test' },
    });
    fireEvent.change(screen.getByPlaceholderText('guid.workspace.remote.usernamePlaceholder'), {
      target: { value: 'root' },
    });
    fireEvent.change(screen.getByPlaceholderText('guid.workspace.remote.passwordPlaceholder'), {
      target: { value: 'secret' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'guid.workspace.remote.addAndConnect' }));

    fireEvent.click(await screen.findByRole('button', { name: 'guid.workspace.remote.retry' }));
    await waitFor(() => expect(remoteMocks.connect).toHaveBeenCalledTimes(2));
    expect(remoteMocks.save).toHaveBeenCalledTimes(1);
    expect(remoteMocks.connect).toHaveBeenLastCalledWith({ id: 'ssh-1', hostKeyApproval: undefined });
  });

  it('does not request another connection when progress updates rerender the menu', async () => {
    const listeners: Array<(progress: RemoteEnvironmentProgress) => void> = [];
    remoteMocks.progressOn.mockImplementation((listener: (progress: RemoteEnvironmentProgress) => void) => {
      listeners.push(listener);
      return () => {};
    });
    const onRequestConnection = vi.fn();
    render(
      <RemoteEnvironmentMenu
        searchQuery=''
        onClose={vi.fn()}
        onRequestConnection={onRequestConnection}
        onRequestWorkspace={vi.fn()}
      />
    );

    fireEvent.click(await screen.findByRole('button', { name: /Ubuntu/ }));
    await waitFor(() => expect(onRequestConnection).toHaveBeenCalledTimes(1));
    expect(onRequestConnection).toHaveBeenLastCalledWith(wslEnvironment);

    act(() => {
      for (const listener of listeners) {
        listener({ environmentId: 'wsl-1', stage: 'starting', timestamp: Date.now() });
      }
    });

    await waitFor(() => expect(screen.getByRole('button', { name: /Ubuntu/ })).toBeInTheDocument());
    expect(onRequestConnection).toHaveBeenCalledTimes(1);
  });

  it('requests a workspace for the active environment without reconnecting', async () => {
    remoteMocks.state.mockResolvedValue({
      active: { type: 'remote', id: wslEnvironment.id, name: wslEnvironment.name, kind: 'wsl' },
    });
    const onRequestConnection = vi.fn();
    const onRequestWorkspace = vi.fn();
    const onClose = vi.fn();
    render(
      <RemoteEnvironmentMenu
        searchQuery=''
        onClose={onClose}
        onRequestConnection={onRequestConnection}
        onRequestWorkspace={onRequestWorkspace}
      />
    );

    fireEvent.click(await screen.findByRole('button', { name: /Ubuntu/ }));

    await waitFor(() => expect(onRequestWorkspace).toHaveBeenCalledWith(wslEnvironment));
    expect(onRequestConnection).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledOnce();
  });
});
