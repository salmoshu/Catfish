/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { RemoteExecutor, RemoteProcess } from './remoteExecutor';
import type { RemoteInstallation } from './remotePackageManager';
import { RemoteTunnel } from './remoteTunnel';

const LISTENING_PREFIX = 'AIONCORE_LISTENING ';
const PID_PATTERN = /^CATFISH_REMOTE_PID=(\d+)$/;

/** Parse legacy numeric and current JSON AionCore listening markers. */
export function parseCatfishcoreListeningPort(line: string): number | undefined {
  if (!line.startsWith(LISTENING_PREFIX)) return undefined;
  const payload = line.slice(LISTENING_PREFIX.length).trim();
  const numericPort = Number(payload);
  if (Number.isInteger(numericPort) && numericPort > 0 && numericPort <= 65535) return numericPort;
  try {
    const parsed = JSON.parse(payload) as { port?: unknown };
    if (typeof parsed.port === 'number' && Number.isInteger(parsed.port) && parsed.port > 0 && parsed.port <= 65535) {
      return parsed.port;
    }
  } catch {}
  return undefined;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class RemoteBackend {
  private stopping = false;
  private exited = false;
  private stopPromise?: Promise<void>;

  get isExited(): boolean {
    return this.exited;
  }

  private constructor(
    private readonly executor: RemoteExecutor,
    private readonly process: RemoteProcess,
    private readonly remotePid: number,
    private readonly tunnel: RemoteTunnel,
    private readonly exit: Promise<number | null>,
    readonly port: number,
    onUnexpectedExit: (error: Error) => void
  ) {
    void exit.then(
      (code) => {
        this.exited = true;
        if (!this.stopping) onUnexpectedExit(new Error(`Remote AionCore exited with ${code ?? 'unknown'}`));
      },
      (error: unknown) => {
        this.exited = true;
        if (!this.stopping) onUnexpectedExit(error instanceof Error ? error : new Error(String(error)));
      }
    );
  }

  static async start(options: {
    executor: RemoteExecutor;
    installation: RemoteInstallation;
    appVersion: string;
    signal?: AbortSignal;
    onUnexpectedExit: (error: Error) => void;
  }): Promise<RemoteBackend> {
    const { executor, installation, signal } = options;
    const args = [
      '--port',
      '0',
      '--data-dir',
      installation.dataDir,
      '--log-level',
      'info',
      '--app-version',
      options.appVersion,
      '--managed-resources-mode',
      'bundled',
      '--log-dir',
      installation.logDir,
      '--work-dir',
      installation.workDir,
      '--local',
    ];
    const remoteProcess = await executor.spawn(
      'sh',
      ['-c', 'printf "CATFISH_REMOTE_PID=%s\\n" "$$"; exec "$@"', 'sh', installation.binaryPath, ...args],
      {
        env: {
          AIONUI_CACHE_DIR: installation.cacheDir,
          AIONUI_WORK_DIR: installation.workDir,
          AIONUI_LOG_DIR: installation.logDir,
        },
      }
    );
    remoteProcess.stdin.end();
    const exit = remoteProcess.wait();
    void exit.catch(() => {});
    let stdoutTail = '';
    let stderrTail = '';
    let lineBuffer = '';
    let remotePid: number | undefined;
    let remotePort: number | undefined;
    let resolveReported: () => void = () => {};
    let rejectReported: (error: Error) => void = () => {};
    const reported = new Promise<void>((resolve, reject) => {
      resolveReported = resolve;
      rejectReported = reject;
    });
    remoteProcess.stdout.on('data', (chunk: Buffer) => {
      stdoutTail = (stdoutTail + chunk.toString('utf8')).slice(-32_768);
      lineBuffer += chunk.toString('utf8');
      const lines = lineBuffer.split(/\r?\n/);
      lineBuffer = lines.pop() ?? '';
      for (const line of lines) {
        const pidMatch = PID_PATTERN.exec(line.trim());
        const listeningPort = parseCatfishcoreListeningPort(line.trim());
        if (pidMatch) remotePid = Number(pidMatch[1]);
        if (listeningPort) remotePort = listeningPort;
        if (remotePid && remotePort) resolveReported();
      }
    });
    remoteProcess.stderr.on('data', (chunk: Buffer) => {
      stderrTail = (stderrTail + chunk.toString('utf8')).slice(-32_768);
    });
    void exit.then(
      (code) => rejectReported(new Error(`Remote AionCore exited before readiness (${code ?? 'unknown'})`)),
      (error: unknown) => rejectReported(error instanceof Error ? error : new Error(String(error)))
    );

    const timer = setTimeout(
      () => rejectReported(new Error(`Remote AionCore did not report its port\n${stderrTail || stdoutTail}`)),
      60_000
    );
    signal?.addEventListener(
      'abort',
      () => rejectReported(new DOMException('Remote operation cancelled', 'AbortError')),
      {
        once: true,
      }
    );
    let tunnel: RemoteTunnel | undefined;
    try {
      await reported;
      if (!remotePid || !remotePort) throw new Error('Remote AionCore startup metadata is incomplete');
      tunnel = await RemoteTunnel.listen(executor, installation.nodePath, installation.helperPath, remotePort);
      const healthDeadline = Date.now() + 30_000;
      let healthy = false;
      while (Date.now() < healthDeadline) {
        if (signal?.aborted) throw new DOMException('Remote operation cancelled', 'AbortError');
        try {
          const response = await fetch(`http://127.0.0.1:${tunnel.port}/health`, {
            signal: AbortSignal.timeout(2_000),
          });
          if (response.ok) {
            healthy = true;
            break;
          }
        } catch {}
        await delay(250);
      }
      if (!healthy) throw new Error(`Remote AionCore health check timed out\n${stderrTail || stdoutTail}`);
      return new RemoteBackend(executor, remoteProcess, remotePid, tunnel, exit, tunnel.port, options.onUnexpectedExit);
    } catch (error) {
      await tunnel?.stop();
      if (remotePid) await executor.run('kill', ['-KILL', String(remotePid)], { timeoutMs: 5_000 }).catch(() => {});
      await remoteProcess.kill();
      await executor.close();
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  async stop(): Promise<void> {
    if (this.stopPromise) return this.stopPromise;
    this.stopping = true;
    this.stopPromise = (async () => {
      await this.tunnel.stop();
      if (!this.exited) {
        await this.executor.run('kill', ['-TERM', String(this.remotePid)], { timeoutMs: 5_000 }).catch(() => {});
        await Promise.race([this.exit.catch((): null => null), delay(5_000)]);
      }
      if (!this.exited) {
        await this.executor.run('kill', ['-KILL', String(this.remotePid)], { timeoutMs: 5_000 }).catch(() => {});
      }
      await this.process.kill();
      await this.executor.close();
    })();
    return this.stopPromise;
  }
}
