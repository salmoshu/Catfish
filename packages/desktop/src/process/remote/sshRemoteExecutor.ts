/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { Client } from 'ssh2';
import type { ClientChannel, ConnectConfig } from 'ssh2';
import type { RemoteCommandOptions, RemoteCommandResult, RemoteExecutor, RemoteProcess } from './remoteExecutor';
import { remoteEnvironmentVariables, throwIfRemoteAborted } from './remoteExecutor';

const OUTPUT_LIMIT = 1024 * 1024;

export type SshExecutorOptions = {
  host: string;
  port: number;
  username: string;
  password?: string;
  privateKeyPath?: string;
  passphrase?: string;
  trustedHostKey?: string;
};

export class RemoteHostKeyError extends Error {
  readonly code = 'host_key_error';
  constructor(
    readonly host: string,
    readonly port: number,
    readonly fingerprint: string,
    readonly expectedFingerprint?: string
  ) {
    super(expectedFingerprint ? 'SSH host key changed' : 'SSH host key is not trusted');
    this.name = 'RemoteHostKeyError';
  }
}

export function sshHostFingerprint(key: Buffer): string {
  return `SHA256:${createHash('sha256').update(key).digest('base64').replace(/=+$/g, '')}`;
}

export function quotePosix(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

export function buildSshCommand(command: string, args: string[], env?: Record<string, string>): string {
  const variables = remoteEnvironmentVariables(env);
  const words = variables.length > 0 ? ['env', ...variables, command, ...args] : [command, ...args];
  return words.map(quotePosix).join(' ');
}

function appendLimited(current: string, chunk: Buffer): string {
  return (current + chunk.toString('utf8')).slice(-OUTPUT_LIMIT);
}

export class SshRemoteExecutor implements RemoteExecutor {
  private readonly client = new Client();
  private connected = false;

  constructor(private readonly options: SshExecutorOptions) {}

  async connect(signal?: AbortSignal): Promise<void> {
    throwIfRemoteAborted(signal);
    let observedFingerprint = '';
    const config: ConnectConfig = {
      host: this.options.host,
      port: this.options.port,
      username: this.options.username,
      readyTimeout: 20_000,
      keepaliveInterval: 15_000,
      keepaliveCountMax: 3,
      hostVerifier: (key: Buffer) => {
        observedFingerprint = sshHostFingerprint(key);
        return Boolean(this.options.trustedHostKey && observedFingerprint === this.options.trustedHostKey);
      },
    };
    if (this.options.password) config.password = this.options.password;
    if (this.options.privateKeyPath) {
      config.privateKey = await readFile(this.options.privateKeyPath, 'utf8');
      if (this.options.passphrase) config.passphrase = this.options.passphrase;
    }

    await new Promise<void>((resolve, reject) => {
      const abort = () => {
        this.client.end();
        reject(new DOMException('Remote operation cancelled', 'AbortError'));
      };
      signal?.addEventListener('abort', abort, { once: true });
      this.client.once('ready', () => {
        signal?.removeEventListener('abort', abort);
        this.connected = true;
        resolve();
      });
      this.client.once('error', (error) => {
        signal?.removeEventListener('abort', abort);
        if (observedFingerprint && observedFingerprint !== this.options.trustedHostKey) {
          reject(
            new RemoteHostKeyError(
              this.options.host,
              this.options.port,
              observedFingerprint,
              this.options.trustedHostKey
            )
          );
          return;
        }
        reject(error);
      });
      this.client.connect(config);
    });
  }

  private execute(command: string, args: string[], options: RemoteCommandOptions): Promise<ClientChannel> {
    if (!this.connected) return Promise.reject(new Error('SSH is not connected'));
    const fullCommand = buildSshCommand(command, args, options.env);
    return new Promise((resolve, reject) => {
      this.client.exec(fullCommand, (error, channel) => {
        if (error) reject(error);
        else resolve(channel);
      });
    });
  }

  async run(command: string, args: string[] = [], options: RemoteCommandOptions = {}): Promise<RemoteCommandResult> {
    throwIfRemoteAborted(options.signal);
    const channel = await this.execute(command, args, options);
    let stdout = '';
    let stderr = '';
    channel.on('data', (chunk: Buffer) => {
      stdout = appendLimited(stdout, chunk);
    });
    channel.stderr.on('data', (chunk: Buffer) => {
      stderr = appendLimited(stderr, chunk);
    });
    if (options.input) channel.end(options.input);
    else channel.end();

    let timeout: ReturnType<typeof setTimeout> | undefined;
    let timedOut = false;
    const abort = () => channel.close();
    options.signal?.addEventListener('abort', abort, { once: true });
    if (options.timeoutMs) {
      timeout = setTimeout(() => {
        timedOut = true;
        channel.close();
      }, options.timeoutMs);
    }
    try {
      let reportedExitCode: number | null = null;
      channel.on('exit', (code: number | null) => {
        reportedExitCode = code;
      });
      const exitCode = await new Promise<number | null>((resolve) => {
        channel.once('close', () => resolve(reportedExitCode));
      });
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
    const channel = await this.execute(command, args, options);
    let exited = false;
    let reportedExitCode: number | null = null;
    channel.on('exit', (code: number | null) => {
      reportedExitCode = code;
    });
    const wait = new Promise<number | null>((resolve) => {
      channel.once('close', () => {
        exited = true;
        resolve(reportedExitCode);
      });
    });
    return {
      stdin: channel,
      stdout: channel,
      stderr: channel.stderr,
      wait: () => wait,
      kill: async () => {
        if (!exited) channel.close();
      },
    };
  }

  async close(): Promise<void> {
    this.connected = false;
    this.client.end();
  }
}
