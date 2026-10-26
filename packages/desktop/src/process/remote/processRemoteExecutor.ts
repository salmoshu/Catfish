/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import type { RemoteCommandOptions, RemoteCommandResult, RemoteExecutor, RemoteProcess } from './remoteExecutor';
import { remoteEnvironmentVariables, throwIfRemoteAborted } from './remoteExecutor';

const OUTPUT_LIMIT = 1024 * 1024;

type ProcessRemoteOptions = {
  kind: 'wsl' | 'docker';
  distribution?: string;
  container?: string;
  user?: string;
};

type HostCommand = { command: string; args: string[] };

function toProcess(child: ChildProcess): RemoteProcess {
  if (!child.stdin || !child.stdout || !child.stderr) {
    child.kill();
    throw new Error('Remote process stdio is unavailable');
  }
  let exited = false;
  const wait = new Promise<number | null>((resolve, reject) => {
    child.once('error', (error) => {
      exited = true;
      reject(error);
    });
    child.once('close', (code) => {
      exited = true;
      resolve(code);
    });
  });
  return {
    stdin: child.stdin,
    stdout: child.stdout,
    stderr: child.stderr,
    wait: () => wait,
    kill: async () => {
      if (!exited) child.kill('SIGTERM');
    },
  };
}

function appendLimited(current: string, chunk: Buffer): string {
  return (current + chunk.toString('utf8')).slice(-OUTPUT_LIMIT);
}

export function parseWslListOutput(buffer: Buffer): string[] {
  const utf16 = buffer.toString('utf16le');
  const text = buffer.includes(0) && /[A-Za-z0-9]/.test(utf16) ? utf16 : buffer.toString('utf8');
  return text
    .split(/\r?\n/)
    .map((line) => line.replaceAll('\u0000', '').replace(/^[\s*]+|[\s]+$/g, ''))
    .filter((line) => line && !/^default\s*:/i.test(line));
}

export class ProcessRemoteExecutor implements RemoteExecutor {
  constructor(private readonly options: ProcessRemoteOptions) {}

  private invocation(command: string, args: string[], env?: Record<string, string>): HostCommand {
    const variables = remoteEnvironmentVariables(env);
    const targetCommand = variables.length > 0 ? 'env' : command;
    const targetArgs = variables.length > 0 ? [...variables, command, ...args] : args;
    if (this.options.kind === 'wsl') {
      if (process.platform !== 'win32') throw new Error('WSL connections require Windows');
      return {
        command: 'wsl.exe',
        args: [
          ...(this.options.distribution ? ['--distribution', this.options.distribution] : []),
          ...(this.options.user ? ['--user', this.options.user] : []),
          '--exec',
          targetCommand,
          ...targetArgs,
        ],
      };
    }
    if (!this.options.container) throw new Error('Docker container is required');
    return {
      command: 'docker',
      args: [
        'exec',
        '-i',
        ...(this.options.user ? ['--user', this.options.user] : []),
        this.options.container,
        targetCommand,
        ...targetArgs,
      ],
    };
  }

  async connect(signal?: AbortSignal): Promise<void> {
    throwIfRemoteAborted(signal);
    const result = await this.run('sh', ['-c', 'printf ok'], { timeoutMs: 15_000, signal });
    if (result.exitCode !== 0 || result.stdout !== 'ok') {
      throw new Error(result.stderr.trim() || 'Remote shell is unavailable');
    }
  }

  async run(command: string, args: string[] = [], options: RemoteCommandOptions = {}): Promise<RemoteCommandResult> {
    throwIfRemoteAborted(options.signal);
    const invocation = this.invocation(command, args, options.env);
    const child = spawn(invocation.command, invocation.args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
    const remoteProcess = toProcess(child);
    let stdout = '';
    let stderr = '';
    remoteProcess.stdout.on('data', (chunk: Buffer) => {
      stdout = appendLimited(stdout, chunk);
    });
    remoteProcess.stderr.on('data', (chunk: Buffer) => {
      stderr = appendLimited(stderr, chunk);
    });
    if (options.input) remoteProcess.stdin.end(options.input);
    else remoteProcess.stdin.end();

    let timeout: ReturnType<typeof setTimeout> | undefined;
    let timedOut = false;
    const abort = (): void => {
      void remoteProcess.kill();
    };
    options.signal?.addEventListener('abort', abort, { once: true });
    if (options.timeoutMs) {
      timeout = setTimeout(() => {
        timedOut = true;
        void remoteProcess.kill();
      }, options.timeoutMs);
    }
    try {
      const exitCode = await remoteProcess.wait();
      throwIfRemoteAborted(options.signal);
      if (timedOut) throw new Error(`Remote command timed out: ${command}`);
      return { stdout, stderr, exitCode };
    } finally {
      if (timeout) clearTimeout(timeout);
      options.signal?.removeEventListener('abort', abort);
    }
  }

  async spawn(command: string, args: string[] = [], options: RemoteCommandOptions = {}): Promise<RemoteProcess> {
    throwIfRemoteAborted(options.signal);
    const invocation = this.invocation(command, args, options.env);
    const child = spawn(invocation.command, invocation.args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
    return toProcess(child);
  }

  async close(): Promise<void> {}
}

async function runDiscovery(command: string, args: string[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error(`${command} discovery timed out`));
    }, 10_000);
    child.stdout.on('data', (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk));
    child.once('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once('exit', (code) => {
      clearTimeout(timeout);
      if (code === 0) resolve(Buffer.concat(stdout));
      else reject(new Error(Buffer.concat(stderr).toString('utf8').trim() || `${command} exited with ${code}`));
    });
  });
}

export async function listWslDistributions(): Promise<string[]> {
  if (process.platform !== 'win32') return [];
  const output = await runDiscovery('wsl.exe', ['--list', '--quiet']);
  return parseWslListOutput(output);
}

export async function listDockerContainers(): Promise<Array<{ id: string; name: string; image: string }>> {
  const output = await runDiscovery('docker', ['ps', '--format', '{{.ID}}\t{{.Names}}\t{{.Image}}']);
  return output
    .toString('utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const [id = '', name = '', image = ''] = line.split('\t');
      return { id, name, image };
    })
    .filter((container) => container.id && container.name);
}
