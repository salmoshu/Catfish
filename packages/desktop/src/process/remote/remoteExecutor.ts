/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Readable, Writable } from 'node:stream';

export type RemoteCommandOptions = {
  env?: Record<string, string>;
  input?: Buffer;
  timeoutMs?: number;
  signal?: AbortSignal;
};

export type RemoteCommandResult = {
  stdout: string;
  stderr: string;
  exitCode: number | null;
};

export type RemoteProcess = {
  stdin: Writable;
  stdout: Readable;
  stderr: Readable;
  wait: () => Promise<number | null>;
  kill: () => Promise<void>;
};

export type RemoteExecutor = {
  connect: (signal?: AbortSignal) => Promise<void>;
  run: (command: string, args?: string[], options?: RemoteCommandOptions) => Promise<RemoteCommandResult>;
  spawn: (command: string, args?: string[], options?: RemoteCommandOptions) => Promise<RemoteProcess>;
  close: () => Promise<void>;
};

export class RemoteCommandError extends Error {
  readonly result: RemoteCommandResult;

  constructor(command: string, result: RemoteCommandResult) {
    super(`Remote command failed (${result.exitCode ?? 'unknown'}): ${command}\n${result.stderr.trim()}`);
    this.name = 'RemoteCommandError';
    this.result = result;
  }
}

export function assertRemoteCommand(result: RemoteCommandResult, command: string): RemoteCommandResult {
  if (result.exitCode !== 0) throw new RemoteCommandError(command, result);
  return result;
}

export function remoteEnvironmentVariables(env?: Record<string, string>): string[] {
  return Object.entries(env ?? {}).map(([key, value]) => `${key}=${value}`);
}

export function throwIfRemoteAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException('Remote operation cancelled', 'AbortError');
}
