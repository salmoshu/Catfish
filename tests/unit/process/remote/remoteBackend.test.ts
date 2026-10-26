import { PassThrough } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RemoteExecutor, RemoteProcess } from '@process/remote/remoteExecutor';
import type { RemoteInstallation } from '@process/remote/remotePackageManager';
import type { RemoteTunnel } from '@process/remote/remoteTunnel';

const tunnelMocks = vi.hoisted(() => ({ listen: vi.fn(), stop: vi.fn() }));
vi.mock('@process/remote/remoteTunnel', () => ({ RemoteTunnel: { listen: tunnelMocks.listen } }));

import { parseCatfishcoreListeningPort, RemoteBackend } from '@process/remote/remoteBackend';

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

function harness() {
  let resolveExit: (code: number | null) => void = () => {};
  const exit = new Promise<number | null>((resolve) => {
    resolveExit = resolve;
  });
  const remoteProcess: RemoteProcess = {
    stdin: new PassThrough(),
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    wait: () => exit,
    kill: vi.fn(async () => resolveExit(0)),
  };
  const run = vi.fn(async (command: string) => {
    if (command === 'kill') queueMicrotask(() => resolveExit(0));
    return { stdout: '', stderr: '', exitCode: 0 };
  });
  const executor: RemoteExecutor = {
    connect: vi.fn(async () => {}),
    run,
    spawn: vi.fn(async () => remoteProcess),
    close: vi.fn(async () => {}),
  };
  return { executor, remoteProcess, resolveExit, run };
}

async function start(options: ReturnType<typeof harness>, onUnexpectedExit = vi.fn()) {
  const starting = RemoteBackend.start({
    executor: options.executor,
    installation,
    appVersion: '2.2.2',
    onUnexpectedExit,
  });
  await vi.waitFor(() => expect(options.executor.spawn).toHaveBeenCalled());
  await vi.waitFor(() => expect(options.remoteProcess.stdout.listenerCount('data')).toBeGreaterThan(0));
  options.remoteProcess.stdout.write('CATFISH_REMOTE_PID=321\nAIONCORE_LISTENING 23456\n');
  return { backend: await starting, onUnexpectedExit };
}

beforeEach(() => {
  tunnelMocks.stop.mockResolvedValue(undefined);
  tunnelMocks.listen.mockResolvedValue({ port: 41000, stop: tunnelMocks.stop } as unknown as RemoteTunnel);
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true }))
  );
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe('RemoteBackend', () => {
  it('starts behind a loopback tunnel and stops the target PID', async () => {
    const options = harness();
    const { backend, onUnexpectedExit } = await start(options);

    expect(backend.port).toBe(41000);
    expect(tunnelMocks.listen).toHaveBeenCalledWith(
      options.executor,
      installation.nodePath,
      installation.helperPath,
      23456
    );
    const spawnArgs = vi.mocked(options.executor.spawn).mock.calls[0][1] ?? [];
    expect(spawnArgs).not.toContain('--parent-pid');

    await backend.stop();
    expect(options.run).toHaveBeenCalledWith('kill', ['-TERM', '321'], expect.anything());
    expect(tunnelMocks.stop).toHaveBeenCalled();
    expect(options.executor.close).toHaveBeenCalled();
    expect(onUnexpectedExit).not.toHaveBeenCalled();
  });

  it('reports an unexpected target exit', async () => {
    const options = harness();
    const { backend, onUnexpectedExit } = await start(options);
    options.resolveExit(23);

    await vi.waitFor(() =>
      expect(onUnexpectedExit).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('23') }))
    );
    await backend.stop();
  });

  it('parses numeric and JSON listening markers', () => {
    expect(parseCatfishcoreListeningPort('AIONCORE_LISTENING 23456')).toBe(23456);
    expect(parseCatfishcoreListeningPort('AIONCORE_LISTENING {"host":"127.0.0.1","port":23456}')).toBe(23456);
    expect(parseCatfishcoreListeningPort('AIONCORE_LISTENING {"port":0}')).toBeUndefined();
  });
});
