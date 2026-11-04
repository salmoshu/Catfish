import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useNotificationClick } from '@/renderer/hooks/system/notification/useNotificationClick';

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  activate: vi.fn(),
  connectOrResume: vi.fn(),
  syncBackend: vi.fn(),
  clickHandler: { current: null as null | ((payload: unknown) => void) },
  environment: { current: { type: 'local' } as import('@/common/types/remote').BackendEnvironment },
}));

vi.mock('react-router-dom', () => ({ useNavigate: () => mocks.navigate }));
vi.mock('@/common', () => ({
  ipcBridge: {
    remoteEnvironment: { activate: { invoke: mocks.activate } },
    notification: {
      clicked: {
        on: (handler: (payload: unknown) => void) => {
          mocks.clickHandler.current = handler;
          return vi.fn();
        },
      },
    },
  },
}));
vi.mock('@/common/adapter/httpBridge', () => ({ getBackendEnvironment: () => mocks.environment.current }));
vi.mock('@/renderer/utils/workspace/backendSwitch', () => ({
  connectOrResumeEnvironment: mocks.connectOrResume,
  syncBackendEnvironment: mocks.syncBackend,
}));

describe('useNotificationClick', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.clickHandler.current = null;
    mocks.environment.current = { type: 'local' };
    mocks.activate.mockResolvedValue({ ok: true, data: { type: 'local' } });
    mocks.connectOrResume.mockResolvedValue({ ok: true });
    mocks.syncBackend.mockResolvedValue(undefined);
    renderHook(() => useNotificationClick());
    expect(mocks.clickHandler.current).not.toBeNull();
  });

  it('resumes the remote backend before navigating to its conversation', async () => {
    const environment = { type: 'remote', id: 'wsl-1', name: 'Ubuntu', kind: 'wsl' } as const;
    await act(async () => {
      mocks.clickHandler.current?.({ conversation_id: 'remote-chat', environment });
    });

    await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith('/conversation/remote-chat'));
    expect(mocks.connectOrResume).toHaveBeenCalledWith('wsl-1');
    expect(mocks.syncBackend).toHaveBeenCalledOnce();
  });

  it('activates the local backend before opening a local conversation from a remote view', async () => {
    mocks.environment.current = { type: 'remote', id: 'wsl-1', name: 'Ubuntu', kind: 'wsl' };
    await act(async () => {
      mocks.clickHandler.current?.({ conversation_id: 'local-chat', environment: { type: 'local' } });
    });

    await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith('/conversation/local-chat'));
    expect(mocks.activate).toHaveBeenCalledWith({});
    expect(mocks.syncBackend).toHaveBeenCalledOnce();
  });

  it('does not navigate to a conversation on the wrong backend after activation fails', async () => {
    mocks.connectOrResume.mockResolvedValue({ ok: false, message: 'offline' });
    await act(async () => {
      mocks.clickHandler.current?.({
        conversation_id: 'remote-chat',
        environment: { type: 'remote', id: 'wsl-1', name: 'Ubuntu', kind: 'wsl' },
      });
    });

    await waitFor(() => expect(mocks.connectOrResume).toHaveBeenCalled());
    expect(mocks.syncBackend).not.toHaveBeenCalled();
    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it('navigates directly when the notification belongs to the current backend', async () => {
    await act(async () => {
      mocks.clickHandler.current?.({ conversation_id: 'local-chat', environment: { type: 'local' } });
    });

    await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith('/conversation/local-chat'));
    expect(mocks.activate).not.toHaveBeenCalled();
    expect(mocks.syncBackend).not.toHaveBeenCalled();
  });
});
