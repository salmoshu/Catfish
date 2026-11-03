import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RemoteBackend } from '@process/remote/remoteBackend';
import type { RemotePackageManager, RemoteInstallation } from '@process/remote/remotePackageManager';
import type { RemoteExecutor } from '@process/remote/remoteExecutor';

const mocks = vi.hoisted(() => ({
  backendStart: vi.fn(),
  executorConnect: vi.fn(),
  executorClose: vi.fn(),
  ensureInstalled: vi.fn(),
}));

vi.mock('@process/remote/remoteBackend', () => ({ RemoteBackend: { start: mocks.backendStart } }));
vi.mock('@process/remote/processRemoteExecutor', () => ({
  ProcessRemoteExecutor: vi.fn(function () {
    return {
      connect: mocks.executorConnect,
      close: mocks.executorClose,
    };
  }),
  listDockerContainers: vi.fn(async () => []),
  listWslDistributions: vi.fn(async () => []),
}));

import { RemoteEnvironmentManager } from '@process/remote/remoteEnvironmentManager';
import { RemoteEnvironmentStore } from '@process/remote/remoteEnvironmentStore';

const installation: RemoteInstallation = {
  target: { platform: 'linux', arch: 'x64', home: '/home/test' },
  rootDir: '/home/test/.catfish/server/v0.2.2/linux-x64',
  binaryPath: '/home/test/.catfish/server/v0.2.2/linux-x64/aioncore',
  helperPath: '/home/test/.catfish/server/v0.2.2/linux-x64/tunnel.cjs',
  nodePath: '/home/test/.catfish/server/v0.2.2/linux-x64/managed-resources/node/node',
  dataDir: '/home/test/.catfish/data',
  cacheDir: '/home/test/.catfish/cache',
  workDir: '/home/test/.catfish/work',
  logDir: '/home/test/.catfish/logs',
};

const directories: string[] = [];

function backend(port: number): RemoteBackend {
  return { port, isExited: false, stop: vi.fn(async () => {}) } as unknown as RemoteBackend;
}

async function manager(): Promise<RemoteEnvironmentManager> {
  const directory = await mkdtemp(join(tmpdir(), 'catfish-remote-manager-'));
  directories.push(directory);
  const store = new RemoteEnvironmentStore(join(directory, 'connections.json'), {
    isAvailable: () => true,
    encrypt: (value) => Buffer.from(value),
    decrypt: (value) => value.toString(),
  });
  const packages = { ensureInstalled: mocks.ensureInstalled } as unknown as RemotePackageManager;
  return new RemoteEnvironmentManager(store, packages, '2.2.2');
}

async function saveEnvironment(instance: RemoteEnvironmentManager, distribution: string): Promise<string> {
  const result = await instance.save({ kind: 'wsl', distribution });
  if (result.ok === false) throw new Error(result.message);
  return result.data.id;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.executorConnect.mockResolvedValue(undefined);
  mocks.executorClose.mockResolvedValue(undefined);
  mocks.ensureInstalled.mockResolvedValue(installation);
});

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('RemoteEnvironmentManager', () => {
  it('switches the active backend only after a successful start', async () => {
    const instance = await manager();
    const first = await saveEnvironment(instance, 'Ubuntu');
    const second = await saveEnvironment(instance, 'Debian');
    const firstBackend = backend(41001);
    mocks.backendStart.mockResolvedValueOnce(firstBackend).mockRejectedValueOnce(new Error('startup failed'));

    expect((await instance.connect({ id: first })).ok).toBe(true);
    expect(instance.port).toBe(41001);
    const failed = await instance.connect({ id: second });

    expect(failed.ok).toBe(false);
    expect(instance.active).toEqual({ type: 'remote', id: first, name: 'Ubuntu', kind: 'wsl' });
    expect(instance.port).toBe(41001);
    expect(firstBackend.stop).not.toHaveBeenCalled();
  });

  it('keeps both remote backends connected when switching between them', async () => {
    const instance = await manager();
    const first = await saveEnvironment(instance, 'Ubuntu');
    const second = await saveEnvironment(instance, 'Debian');
    const firstBackend = backend(41001);
    const secondBackend = backend(41002);
    mocks.backendStart.mockResolvedValueOnce(firstBackend).mockResolvedValueOnce(secondBackend);

    await instance.connect({ id: first });
    const switched = await instance.connect({ id: second });

    expect(switched.ok).toBe(true);
    expect(instance.active).toEqual({ type: 'remote', id: second, name: 'Debian', kind: 'wsl' });
    expect(instance.port).toBe(41002);
    expect(firstBackend.stop).not.toHaveBeenCalled();
    expect(secondBackend.stop).not.toHaveBeenCalled();
    expect(instance.list().map((item) => item.status)).toEqual(['connected', 'connected']);

    await instance.connect({ id: first });
    expect(instance.port).toBe(41001);
    expect(mocks.backendStart).toHaveBeenCalledTimes(2);
  });

  it('keeps the remote runtime alive while local is active and resumes it without restarting', async () => {
    const instance = await manager();
    const id = await saveEnvironment(instance, 'Ubuntu');
    const remote = backend(41001);
    mocks.backendStart.mockResolvedValue(remote);
    await instance.connect({ id });

    expect(await instance.activate()).toEqual({ ok: true, data: { type: 'local' } });
    expect(instance.active).toEqual({ type: 'local' });
    expect(instance.port).toBeNull();
    expect(remote.stop).not.toHaveBeenCalled();
    expect(instance.list()[0].status).toBe('connected');

    expect(await instance.activate(id)).toEqual({
      ok: true,
      data: { type: 'remote', id, name: 'Ubuntu', kind: 'wsl' },
    });
    expect(instance.port).toBe(41001);
    expect(mocks.backendStart).toHaveBeenCalledTimes(1);
    expect(remote.stop).not.toHaveBeenCalled();
  });

  it('returns to the local backend and stops the remote runtime on disconnect', async () => {
    const instance = await manager();
    const id = await saveEnvironment(instance, 'Ubuntu');
    const remote = backend(41001);
    mocks.backendStart.mockResolvedValue(remote);
    await instance.connect({ id });

    const disconnected = await instance.disconnect();

    expect(disconnected).toEqual({ ok: true, data: { type: 'local' } });
    expect(remote.stop).toHaveBeenCalled();
    expect(instance.active).toEqual({ type: 'local' });
    expect(instance.port).toBeNull();
  });
});
