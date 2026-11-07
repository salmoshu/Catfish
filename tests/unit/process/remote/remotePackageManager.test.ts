import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getRemoteVersionCandidates,
  isGlibcCompatibilityError,
  parseGlibcVersion,
  RemotePackageManager,
} from '@process/remote/remotePackageManager';
import type { RemoteCommandOptions, RemoteExecutor } from '@process/remote/remoteExecutor';

const directories: string[] = [];
const originalPlatform = process.platform;
const originalArch = process.arch;

const createExecutor = (run: RemoteExecutor['run']): RemoteExecutor => ({
  connect: vi.fn(async () => {}),
  run,
  spawn: vi.fn(async () => {
    throw new Error('not needed');
  }),
  close: vi.fn(async () => {}),
});

afterEach(async () => {
  Object.defineProperty(process, 'platform', { value: originalPlatform });
  Object.defineProperty(process, 'arch', { value: originalArch });
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('RemotePackageManager', () => {
  it('selects the glibc-compatible release for Ubuntu 20.04 targets', () => {
    expect(parseGlibcVersion('glibc 2.31')).toEqual({ major: 2, minor: 31 });
    expect(getRemoteVersionCandidates('v0.2.4', { major: 2, minor: 31 })).toEqual(['v0.2.3']);
    expect(getRemoteVersionCandidates('v0.2.4', { major: 2, minor: 33 })).toEqual(['v0.2.3']);
    expect(getRemoteVersionCandidates('v0.2.4', { major: 2, minor: 34 })).toEqual(['v0.2.4', 'v0.2.3']);
  });

  it('recognizes dynamic-loader glibc failures for version fallback', () => {
    expect(
      isGlibcCompatibilityError(
        new Error("/home/test/catfishcore: /lib/x86_64-linux-gnu/libc.so.6: version `GLIBC_2.32' not found")
      )
    ).toBe(true);
    expect(isGlibcCompatibilityError(new Error('permission denied'))).toBe(false);
  });

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

  it('reuses a compatible v0.2.3 installation on glibc 2.31', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'catfish-remote-package-'));
    directories.push(directory);
    const run = vi.fn(async (command: string, args: string[] = []) => {
      if (command === 'sh' && args[1]?.includes('uname')) {
        return { stdout: 'Linux\nx86_64\n/home/test', stderr: '', exitCode: 0 };
      }
      if (command === 'sh' && args[1]?.includes('getconf GNU_LIBC_VERSION')) {
        return { stdout: 'glibc 2.31\n', stderr: '', exitCode: 0 };
      }
      if (command === 'cat' && args[0]?.includes('/server/v0.2.3/linux-x64/')) {
        return {
          stdout: JSON.stringify({ node: { root: 'node/node-v24.11.0-linux-x64', executable: 'bin/node' } }),
          stderr: '',
          exitCode: 0,
        };
      }
      if (command === 'sh' && args[1]?.includes('test -x')) {
        return { stdout: '', stderr: '', exitCode: 0 };
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
    const manager = new RemotePackageManager({ cacheDir: directory, version: 'v0.2.4' });

    const installation = await manager.ensureInstalled(executor);

    expect(installation.rootDir).toBe('/home/test/.catfish/server/v0.2.3/linux-x64');
    expect(run).not.toHaveBeenCalledWith(
      installation.binaryPath,
      expect.arrayContaining(['prepare-managed-resources']),
      expect.anything()
    );
  });

  it('falls back after the current binary fails with a glibc loader error', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'catfish-remote-package-'));
    directories.push(directory);
    await Promise.all(
      ['v0.2.4', 'v0.2.3'].map(async (version) => {
        const cacheRoot = join(directory, version, 'linux-x64');
        await mkdir(cacheRoot, { recursive: true });
        await writeFile(join(cacheRoot, 'catfishcore'), 'binary');
      })
    );

    const preparedVersions = new Set<string>();
    const prepareVersions: string[] = [];
    const run = vi.fn(async (command: string, args: string[] = []) => {
      if (command === 'sh' && args[1]?.includes('uname')) {
        return { stdout: 'Linux\nx86_64\n/home/test', stderr: '', exitCode: 0 };
      }
      if (command === 'sh' && args[1]?.includes('getconf GNU_LIBC_VERSION')) {
        return { stdout: '', stderr: '', exitCode: 0 };
      }
      if (command === 'cat' && args[0]?.endsWith('/managed-resources/manifest.json')) {
        const version = args[0].includes('/v0.2.4/') ? 'v0.2.4' : 'v0.2.3';
        if (!preparedVersions.has(version)) return { stdout: '', stderr: '', exitCode: 1 };
        return {
          stdout: JSON.stringify({ node: { root: 'node/node-v24.11.0-linux-x64', executable: 'bin/node' } }),
          stderr: '',
          exitCode: 0,
        };
      }
      if (command === 'sh' && args[1]?.includes('mkdir -p')) {
        return { stdout: '', stderr: '', exitCode: 0 };
      }
      if (command === 'sh' && args[1]?.startsWith('cat >')) {
        return { stdout: '', stderr: '', exitCode: 0 };
      }
      if (args.includes('prepare-managed-resources')) {
        const version = command.includes('/v0.2.4/') ? 'v0.2.4' : 'v0.2.3';
        prepareVersions.push(version);
        if (version === 'v0.2.4') {
          return {
            stdout: '',
            stderr: "/lib/x86_64-linux-gnu/libc.so.6: version `GLIBC_2.34' not found",
            exitCode: 1,
          };
        }
        preparedVersions.add(version);
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
    const manager = new RemotePackageManager({ cacheDir: directory, version: 'v0.2.4' });

    const installation = await manager.ensureInstalled(executor);

    expect(prepareVersions).toEqual(['v0.2.4', 'v0.2.3']);
    expect(installation.rootDir).toBe('/home/test/.catfish/server/v0.2.3/linux-x64');
  });

  it('uploads the fallback release instead of the bundled current version on matching hosts', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'catfish-remote-package-'));
    directories.push(directory);
    const cacheRoot = join(directory, 'v0.2.3', 'linux-x64');
    await mkdir(cacheRoot, { recursive: true });
    await writeFile(join(cacheRoot, 'catfishcore'), 'compatible-release');
    const bundledBinary = join(directory, 'bundled-catfishcore');
    await writeFile(bundledBinary, 'current-release');
    Object.defineProperty(process, 'platform', { value: 'linux' });
    Object.defineProperty(process, 'arch', { value: 'x64' });

    let prepared = false;
    let uploadedBinary: Buffer | undefined;
    const run = vi.fn(async (command: string, args: string[] = [], options?: RemoteCommandOptions) => {
      if (command === 'sh' && args[1]?.includes('uname')) {
        return { stdout: 'Linux\nx86_64\n/home/test', stderr: '', exitCode: 0 };
      }
      if (command === 'sh' && args[1]?.includes('getconf GNU_LIBC_VERSION')) {
        return { stdout: 'glibc 2.31\n', stderr: '', exitCode: 0 };
      }
      if (command === 'cat') {
        return prepared
          ? {
              stdout: JSON.stringify({ node: { root: 'node/node-v24.11.0-linux-x64', executable: 'bin/node' } }),
              stderr: '',
              exitCode: 0,
            }
          : { stdout: '', stderr: '', exitCode: 1 };
      }
      if (command === 'sh' && args[1]?.includes('mkdir -p')) uploadedBinary = options?.input;
      if (args.includes('prepare-managed-resources')) prepared = true;
      return { stdout: '', stderr: '', exitCode: 0 };
    });
    const resolveLocalBinary = vi.fn(() => bundledBinary);
    const manager = new RemotePackageManager({ cacheDir: directory, version: 'v0.2.4', resolveLocalBinary });

    const installation = await manager.ensureInstalled(createExecutor(run));

    expect(installation.rootDir).toBe('/home/test/.catfish/server/v0.2.3/linux-x64');
    expect(resolveLocalBinary).not.toHaveBeenCalled();
    expect(uploadedBinary).toEqual(Buffer.from('compatible-release'));
  });

  it('checks an existing runtime before reusing it when glibc detection is unavailable', async () => {
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
      if (command.includes('/v0.2.4/') && args.includes('--version')) {
        return { stdout: '', stderr: "version `GLIBC_2.34' not found", exitCode: 1 };
      }
      return { stdout: '', stderr: '', exitCode: 0 };
    });
    const manager = new RemotePackageManager({ cacheDir: directory, version: 'v0.2.4' });

    const installation = await manager.ensureInstalled(createExecutor(run));

    expect(installation.rootDir).toBe('/home/test/.catfish/server/v0.2.3/linux-x64');
    expect(run).toHaveBeenCalledWith(
      '/home/test/.catfish/server/v0.2.4/linux-x64/catfishcore',
      ['--version'],
      expect.anything()
    );
  });

  it('reports unrelated startup errors without silently downgrading', async () => {
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
      if (args.includes('--version')) return { stdout: '', stderr: 'Permission denied', exitCode: 126 };
      return { stdout: '', stderr: '', exitCode: 0 };
    });
    const manager = new RemotePackageManager({ cacheDir: directory, version: 'v0.2.4' });

    await expect(manager.ensureInstalled(createExecutor(run))).rejects.toThrow('Permission denied');
    expect(run.mock.calls.some(([, args]) => args?.some((arg) => arg.includes('/v0.2.3/')))).toBe(false);
  });

  it.each([
    ['Linux', 'aarch64', 'linux-arm64'],
    ['Darwin', 'arm64', 'darwin-arm64'],
  ])('keeps the requested release on %s %s targets', async (uname, machine, runtime) => {
    const directory = await mkdtemp(join(tmpdir(), 'catfish-remote-package-'));
    directories.push(directory);
    const run = vi.fn(async (command: string, args: string[] = []) => {
      if (command === 'sh' && args[1]?.includes('uname')) {
        return { stdout: `${uname}\n${machine}\n/home/test`, stderr: '', exitCode: 0 };
      }
      if (command === 'sh' && args[1]?.includes('getconf')) {
        return { stdout: 'glibc 2.31', stderr: '', exitCode: 0 };
      }
      if (command === 'cat') {
        return { stdout: JSON.stringify({ node: { root: 'node', executable: 'bin/node' } }), stderr: '', exitCode: 0 };
      }
      return { stdout: '', stderr: '', exitCode: 0 };
    });
    const manager = new RemotePackageManager({ cacheDir: directory, version: '0.2.4' });
    expect((await manager.ensureInstalled(createExecutor(run))).rootDir).toBe(
      `/home/test/.catfish/server/v0.2.4/${runtime}`
    );
  });
});
