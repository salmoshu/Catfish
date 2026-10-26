import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RemotePackageManager } from '@process/remote/remotePackageManager';
import type { RemoteExecutor } from '@process/remote/remoteExecutor';

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('RemotePackageManager', () => {
  it('reuses a complete target-local installation without downloading', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'catfish-remote-package-'));
    directories.push(directory);
    const run = vi.fn(async (command: string, args: string[] = []) => {
      if (command === 'sh' && args[1]?.includes('uname')) {
        return { stdout: 'Linux\nx86_64\n/home/test', stderr: '', exitCode: 0 };
      }
      if (command === 'cat') {
        return {
          stdout: JSON.stringify({ node: { root: 'node/node-v24.11.0-linux-x64', executable: 'bin/node' } }),
          stderr: '',
          exitCode: 0,
        };
      }
      return { stdout: '', stderr: '', exitCode: 0 };
    });
    const executor: RemoteExecutor = {
      connect: vi.fn(async () => {}),
      run,
      spawn: vi.fn(async () => {
        throw new Error('not needed');
      }),
      close: vi.fn(async () => {}),
    };
    const resolveLocalBinary = vi.fn(() => '/should/not/be/read');
    const manager = new RemotePackageManager({ cacheDir: directory, version: 'v0.2.2', resolveLocalBinary });
    const onStage = vi.fn();

    const installation = await manager.ensureInstalled(executor, undefined, onStage);

    expect(installation.target).toEqual({ platform: 'linux', arch: 'x64', home: '/home/test' });
    expect(installation.nodePath).toBe(
      '/home/test/.catfish/server/v0.2.2/linux-x64/managed-resources/node/node-v24.11.0-linux-x64/bin/node'
    );
    expect(resolveLocalBinary).not.toHaveBeenCalled();
    expect(onStage).toHaveBeenCalledWith('installing');
    expect(run).not.toHaveBeenCalledWith(
      expect.stringContaining('prepare-managed'),
      expect.anything(),
      expect.anything()
    );
  });
});
