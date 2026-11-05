import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BACKEND_ENVIRONMENT_CHANGED,
  connectOrResumeEnvironment,
  switchBackendRoute,
} from '@/renderer/utils/workspace/backendSwitch';

const mocks = vi.hoisted(() => ({
  state: vi.fn(),
  resetSocket: vi.fn(),
  resetConfig: vi.fn(),
  emit: vi.fn(),
  reload: vi.fn(),
  setRuntime: vi.fn(),
  activate: vi.fn(),
  connect: vi.fn(),
}));
vi.mock('@/common', () => ({
  ipcBridge: {
    remoteEnvironment: {
      state: { invoke: mocks.state },
      activate: { invoke: mocks.activate },
      connect: { invoke: mocks.connect },
    },
  },
}));
vi.mock('@/common/adapter/httpBridge', () => ({
  resetBackendSocket: mocks.resetSocket,
  setBackendRuntime: mocks.setRuntime,
}));
vi.mock('@/common/config/configService', () => ({ configService: { reload: mocks.resetConfig } }));
vi.mock('@/renderer/utils/emitter', () => ({ emitter: { emit: mocks.emit } }));

describe('backend environment switching', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.state.mockResolvedValue({ active: { type: 'local' }, port: 41000 });
    mocks.activate.mockResolvedValue({ ok: false, code: 'not_connected', message: 'not connected' });
    mocks.connect.mockResolvedValue({ ok: true, data: { type: 'remote', id: 'wsl', name: 'WSL', kind: 'wsl' } });
    window.__backendEnvironment = { type: 'remote', id: 'wsl', name: 'WSL', kind: 'wsl' };
    window.__backendPort = 42000;
    vi.stubGlobal('location', { ...window.location, hash: '#/guid', reload: mocks.reload });
  });

  it('updates the active backend and route without reloading the document', async () => {
    const changed = vi.fn();
    window.addEventListener(BACKEND_ENVIRONMENT_CHANGED, changed, { once: true });

    await switchBackendRoute('/conversation/local-chat');

    expect(window.location.hash).toBe('/conversation/local-chat');
    expect(mocks.setRuntime).toHaveBeenCalledWith({ type: 'local' }, 41000);
    expect(window.__backendEnvironment).toEqual({ type: 'remote', id: 'wsl', name: 'WSL', kind: 'wsl' });
    expect(window.__backendPort).toBe(42000);
    expect(mocks.resetSocket).toHaveBeenCalledOnce();
    expect(mocks.resetConfig).toHaveBeenCalledOnce();
    expect(mocks.emit).toHaveBeenCalledWith('chat.history.refresh');
    expect(changed).toHaveBeenCalledOnce();
    expect(mocks.reload).not.toHaveBeenCalled();
  });

  it('finishes the backend switch before navigating to the target conversation', async () => {
    let hashDuringConfigReload: string | undefined;
    mocks.resetConfig.mockImplementation(() => {
      hashDuringConfigReload = window.location.hash;
    });

    await switchBackendRoute('/conversation/remote-chat');

    expect(hashDuringConfigReload).toBe('#/guid');
    expect(window.location.hash).toBe('/conversation/remote-chat');
  });

  it('does not remount against a missing backend port', async () => {
    mocks.state.mockResolvedValue({ active: { type: 'local' }, port: null });
    await expect(switchBackendRoute('/guid')).rejects.toThrow('no available port');
    expect(mocks.resetSocket).not.toHaveBeenCalled();
    expect(mocks.resetConfig).not.toHaveBeenCalled();
    expect(mocks.reload).not.toHaveBeenCalled();
  });

  it('resumes an existing remote runtime without starting another connection', async () => {
    const environment = { type: 'remote' as const, id: 'wsl', name: 'WSL', kind: 'wsl' as const };
    mocks.activate.mockResolvedValue({ ok: true, data: environment });
    await expect(connectOrResumeEnvironment('wsl')).resolves.toEqual({ ok: true, data: environment });
    expect(mocks.activate).toHaveBeenCalledWith({ id: 'wsl' });
    expect(mocks.connect).not.toHaveBeenCalled();
  });

  it('connects only when no runtime can be resumed', async () => {
    await connectOrResumeEnvironment('wsl');
    expect(mocks.activate).toHaveBeenCalledWith({ id: 'wsl' });
    expect(mocks.connect).toHaveBeenCalledWith({ id: 'wsl' });
  });

  it('ignores an older slow switch after the latest route has been applied', async () => {
    type State = { active: import('@/common/types/remote').BackendEnvironment; port: number };
    const deferred = () => {
      let resolve!: (value: State) => void;
      const promise = new Promise<State>((r) => {
        resolve = r;
      });
      return { promise, resolve };
    };
    const first = deferred();
    const second = deferred();
    mocks.state.mockReset().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    mocks.resetConfig.mockResolvedValue(undefined);

    const firstRoute = switchBackendRoute('/conversation/first');
    const secondRoute = switchBackendRoute('/conversation/second');
    second.resolve({ active: { type: 'local' }, port: 41001 });
    await secondRoute;
    expect(window.location.hash).toBe('/conversation/second');

    first.resolve({
      active: { type: 'remote', id: 'wsl', name: 'WSL', kind: 'wsl' },
      port: 42000,
    });
    await firstRoute;

    expect(window.location.hash).toBe('/conversation/second');
    expect(mocks.setRuntime).toHaveBeenCalledTimes(1);
    expect(mocks.setRuntime).toHaveBeenCalledWith({ type: 'local' }, 41001);
    expect(mocks.emit).toHaveBeenCalledTimes(1);
  });
});
