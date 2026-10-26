/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { execFile } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { chmod, copyFile, mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { posix } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { createWriteStream } from 'node:fs';
import { promisify } from 'node:util';
import type { RemoteExecutor } from './remoteExecutor';
import { assertRemoteCommand, throwIfRemoteAborted } from './remoteExecutor';
import { REMOTE_TUNNEL_SOURCE } from './remoteTunnel';

const execFileAsync = promisify(execFile);

export type RemoteTargetInfo = {
  platform: 'linux' | 'darwin';
  arch: 'x64' | 'arm64';
  home: string;
};

export type RemoteInstallation = {
  target: RemoteTargetInfo;
  rootDir: string;
  binaryPath: string;
  helperPath: string;
  nodePath: string;
  dataDir: string;
  cacheDir: string;
  workDir: string;
  logDir: string;
};

type ManagedResourcesManifest = {
  node?: { root?: unknown; executable?: unknown };
};

function normalizeTarget(uname: string, machine: string, home: string): RemoteTargetInfo {
  const platform = uname === 'Linux' ? 'linux' : uname === 'Darwin' ? 'darwin' : null;
  const arch =
    machine === 'x86_64' || machine === 'amd64' ? 'x64' : machine === 'aarch64' || machine === 'arm64' ? 'arm64' : null;
  if (!platform || !arch || !home.startsWith('/')) {
    throw new Error(`Unsupported remote target: ${uname} ${machine}`);
  }
  return { platform, arch, home };
}

export async function detectRemoteTarget(executor: RemoteExecutor, signal?: AbortSignal): Promise<RemoteTargetInfo> {
  const result = await executor.run('sh', ['-c', 'printf "%s\\n%s\\n%s" "$(uname -s)" "$(uname -m)" "$HOME"'], {
    timeoutMs: 15_000,
    signal,
  });
  assertRemoteCommand(result, 'detect remote platform');
  const [uname = '', machine = '', ...homeParts] = result.stdout.trim().split('\n');
  return normalizeTarget(uname.trim(), machine.trim(), homeParts.join('\n').trim());
}

function assetName(version: string, target: RemoteTargetInfo): string {
  const architecture = target.arch === 'x64' ? 'x86_64' : 'aarch64';
  const platform = target.platform === 'linux' ? 'unknown-linux-gnu' : 'apple-darwin';
  return `catfishcore-${version}-${architecture}-${platform}.tar.gz`;
}

async function findBinary(dir: string): Promise<string | null> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isFile() && entry.name === 'catfishcore') return fullPath;
    if (entry.isDirectory()) {
      const nested = await findBinary(fullPath);
      if (nested) return nested;
    }
  }
  return null;
}

async function fileExists(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

async function hashFile(path: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}

function installationPaths(target: RemoteTargetInfo, version: string): Omit<RemoteInstallation, 'nodePath'> {
  const base = posix.join(target.home, '.catfish');
  const rootDir = posix.join(base, 'server', version, `${target.platform}-${target.arch}`);
  return {
    target,
    rootDir,
    binaryPath: posix.join(rootDir, 'catfishcore'),
    helperPath: posix.join(rootDir, 'tunnel.cjs'),
    dataDir: posix.join(base, 'data'),
    cacheDir: posix.join(base, 'cache'),
    workDir: posix.join(base, 'work'),
    logDir: posix.join(base, 'logs'),
  };
}

export class RemotePackageManager {
  constructor(
    private readonly options: {
      cacheDir: string;
      version: string;
      resolveLocalBinary?: () => string;
    }
  ) {}

  private async downloadBinary(target: RemoteTargetInfo, signal?: AbortSignal): Promise<string> {
    const version = this.options.version.startsWith('v') ? this.options.version : `v${this.options.version}`;
    const runtimeKey = `${target.platform}-${target.arch}`;
    if (process.platform === target.platform && process.arch === target.arch && this.options.resolveLocalBinary) {
      try {
        return this.options.resolveLocalBinary();
      } catch {}
    }

    const name = assetName(version, target);
    const cacheRoot = join(this.options.cacheDir, version, runtimeKey);
    const archivePath = join(cacheRoot, name);
    const cachedBinary = join(cacheRoot, 'catfishcore');
    if (await fileExists(cachedBinary)) return cachedBinary;
    await mkdir(cacheRoot, { recursive: true });

    if (!(await fileExists(archivePath))) {
      const url = `https://github.com/salmoshu/CatfishCore/releases/download/${version}/${name}`;
      // A stalled release download (unreachable host, silent connection drop)
      // must surface as an error instead of hanging the install step forever.
      const downloadTimeout = AbortSignal.timeout(10 * 60_000);
      const response = await fetch(url, {
        signal: signal ? AbortSignal.any([signal, downloadTimeout]) : downloadTimeout,
        redirect: 'follow',
      });
      if (!response.ok || !response.body) throw new Error(`AionCore download failed: HTTP ${response.status}`);
      const temporary = `${archivePath}.${process.pid}.download`;
      try {
        await pipeline(
          Readable.fromWeb(response.body as unknown as import('node:stream/web').ReadableStream<Uint8Array>),
          createWriteStream(temporary, { mode: 0o600 })
        );
        await rename(temporary, archivePath);
        await writeFile(`${archivePath}.sha256`, `${await hashFile(archivePath)}\n`, 'utf8');
      } finally {
        await rm(temporary, { force: true });
      }
    }

    const extractDir = join(cacheRoot, 'extracted');
    await rm(extractDir, { recursive: true, force: true });
    await mkdir(extractDir, { recursive: true });
    const tar =
      process.platform === 'win32' ? join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe') : 'tar';
    await execFileAsync(tar, ['-xzf', archivePath, '-C', extractDir]);
    const binary = await findBinary(extractDir);
    if (!binary) throw new Error(`Downloaded ${name} does not contain catfishcore`);
    await copyFile(binary, cachedBinary);
    await chmod(cachedBinary, 0o755);
    return cachedBinary;
  }

  private async readNodePath(executor: RemoteExecutor, rootDir: string): Promise<string | null> {
    const resourcesDir = posix.join(rootDir, 'managed-resources');
    const result = await executor.run('cat', [posix.join(resourcesDir, 'manifest.json')], { timeoutMs: 10_000 });
    if (result.exitCode !== 0) return null;
    try {
      const manifest = JSON.parse(result.stdout) as ManagedResourcesManifest;
      const root = manifest.node?.root;
      const executable = manifest.node?.executable;
      if (typeof root !== 'string' || typeof executable !== 'string' || !root || !executable) return null;
      const paths = [root, executable];
      if (paths.some((value) => posix.isAbsolute(value) || value.split('/').includes('..'))) return null;
      return posix.join(resourcesDir, root, executable);
    } catch {
      return null;
    }
  }

  async ensureInstalled(
    executor: RemoteExecutor,
    signal?: AbortSignal,
    onStage?: (stage: 'detecting' | 'installing') => void
  ): Promise<RemoteInstallation> {
    const target = await detectRemoteTarget(executor, signal);
    onStage?.('installing');
    const paths = installationPaths(target, this.options.version);
    const existingNode = await this.readNodePath(executor, paths.rootDir);
    if (existingNode) {
      const check = await executor.run('sh', [
        '-c',
        'test -x "$1" && test -x "$2" && test -f "$3"',
        'sh',
        paths.binaryPath,
        existingNode,
        paths.helperPath,
      ]);
      if (check.exitCode === 0) return { ...paths, nodePath: existingNode };
    }

    throwIfRemoteAborted(signal);
    const localBinary = await this.downloadBinary(target, signal);
    const binary = await readFile(localBinary);
    throwIfRemoteAborted(signal);
    assertRemoteCommand(
      await executor.run(
        'sh',
        [
          '-c',
          'mkdir -p "$1" "$2" "$3" "$4" "$5" && cat > "$6" && chmod 755 "$6"',
          'sh',
          paths.rootDir,
          paths.dataDir,
          paths.cacheDir,
          paths.workDir,
          paths.logDir,
          paths.binaryPath,
        ],
        { input: binary, timeoutMs: 120_000, signal }
      ),
      'upload remote runtime'
    );
    assertRemoteCommand(
      await executor.run('sh', ['-c', 'cat > "$1"', 'sh', paths.helperPath], {
        input: Buffer.from(REMOTE_TUNNEL_SOURCE),
        timeoutMs: 15_000,
        signal,
      }),
      'upload remote tunnel'
    );

    throwIfRemoteAborted(signal);
    const prepare = await executor.run(
      paths.binaryPath,
      [
        '--data-dir',
        paths.dataDir,
        'prepare-managed-resources',
        '--bundle-out',
        posix.join(paths.rootDir, 'managed-resources'),
      ],
      {
        timeoutMs: 10 * 60_000,
        signal,
        env: { AIONUI_BUNDLED_MANAGED_RESOURCES: '' },
      }
    );
    assertRemoteCommand(prepare, 'prepare remote managed resources');
    const nodePath = await this.readNodePath(executor, paths.rootDir);
    if (!nodePath) throw new Error('Remote managed Node runtime is missing');
    return { ...paths, nodePath };
  }
}
