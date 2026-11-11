/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { statSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import type { IPty } from 'node-pty';
import type {
  EmbeddedTerminalOutput,
  EmbeddedTerminalStartParams,
  EmbeddedTerminalStartResult,
} from '@/common/types/platform/electron';

type TerminalSession = { ownerId: number; terminal: IPty };
type TerminalDependencies = {
  loadPty: () => Promise<Pick<typeof import('node-pty'), 'spawn'>>;
  emit: (ownerId: number, output: EmbeddedTerminalOutput) => void;
};

const dimension = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? Math.max(1, Math.min(1000, Math.floor(value))) : fallback;

const quotePosix = (value: string): string => `'${value.replaceAll("'", "'\\''")}'`;

export type TerminalLaunch = { file: string; args: string[]; cwd?: string };

export const resolveTerminalLaunch = (
  params: EmbeddedTerminalStartParams,
  platform: NodeJS.Platform = process.platform
): TerminalLaunch => {
  const windows = platform === 'win32';
  const remote = params.remote;
  if (!remote) {
    return {
      file: windows ? process.env.COMSPEC || 'cmd.exe' : process.env.SHELL || '/bin/sh',
      args: windows ? [] : ['-l'],
      cwd: params.cwd,
    };
  }
  if (!params.cwd.startsWith('/')) throw new Error('Remote terminal working directory must be an absolute POSIX path');
  if (remote.kind === 'wsl') {
    return {
      file: windows ? 'wsl.exe' : 'wsl',
      args: [
        ...(remote.distribution ? ['-d', remote.distribution] : []),
        ...(remote.user ? ['-u', remote.user] : []),
        '--cd',
        params.cwd,
      ],
    };
  }
  if (remote.kind === 'docker') {
    return {
      file: 'docker',
      args: [
        'exec',
        '-it',
        '-w',
        params.cwd,
        ...(remote.user ? ['-u', remote.user] : []),
        remote.container,
        'sh',
        '-l',
      ],
    };
  }
  return {
    file: 'ssh',
    args: [
      '-tt',
      ...(remote.port ? ['-p', String(remote.port)] : []),
      ...(remote.authType === 'privateKey' && remote.privateKeyPath ? ['-i', remote.privateKeyPath] : []),
      `${remote.username}@${remote.host}`,
      `cd ${quotePosix(params.cwd)} && exec sh -l`,
    ],
  };
};

/** Owns PTYs for individual renderer windows and releases them when their owner closes. */
export class TerminalService {
  private readonly sessions = new Map<string, TerminalSession>();
  private readonly owners = new Map<number, symbol>();

  constructor(private readonly dependencies: TerminalDependencies) {}

  /** Allow a window to start terminals until it closes or reloads. */
  registerOwner(ownerId: number): void {
    this.owners.set(ownerId, Symbol());
  }

  /** Start a shell, reporting native-module and working-directory failures to its pane. */
  async start(ownerId: number, params: EmbeddedTerminalStartParams): Promise<EmbeddedTerminalStartResult> {
    try {
      const owner = this.owners.get(ownerId);
      if (!owner) throw new Error('Terminal window is unavailable');
      if (!params || typeof params.terminal_id !== 'string' || !/^[\w-]{1,100}$/.test(params.terminal_id)) {
        throw new Error('Invalid terminal id');
      }
      if (this.sessions.has(params.terminal_id)) throw new Error('Terminal already exists');
      if (
        typeof params.cwd !== 'string' ||
        (!params.remote && (!isAbsolute(params.cwd) || !statSync(params.cwd).isDirectory()))
      ) {
        throw new Error('Terminal working directory must be an existing absolute directory');
      }
      const launch = resolveTerminalLaunch(params);
      const { spawn } = await this.dependencies.loadPty();
      if (this.owners.get(ownerId) !== owner) throw new Error('Terminal window is unavailable');
      if (this.sessions.has(params.terminal_id)) throw new Error('Terminal already exists');
      const windows = process.platform === 'win32';
      const env = Object.fromEntries(
        Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === 'string')
      );
      const terminal = spawn(launch.file, launch.args, {
        name: 'xterm-256color',
        cols: dimension(params.cols, 100),
        rows: dimension(params.rows, 30),
        cwd: launch.cwd,
        env,
        useConpty: windows,
      });
      this.sessions.set(params.terminal_id, { ownerId, terminal });
      terminal.onData((data) => {
        if (this.sessions.get(params.terminal_id)?.terminal === terminal) {
          this.dependencies.emit(ownerId, { terminal_id: params.terminal_id, type: 'data', data });
        }
      });
      terminal.onExit(({ exitCode, signal }) => {
        if (this.sessions.get(params.terminal_id)?.terminal !== terminal) return;
        this.sessions.delete(params.terminal_id);
        this.dependencies.emit(ownerId, { terminal_id: params.terminal_id, type: 'exit', exit_code: exitCode, signal });
      });
      return { terminal_id: params.terminal_id };
    } catch (error) {
      return { terminal_id: '', error: error instanceof Error ? error.message : String(error) };
    }
  }

  /** Forward input only to a terminal owned by this window. */
  write(ownerId: number, terminalId: string, data: string): void {
    if (typeof data !== 'string') return;
    this.getSession(ownerId, terminalId)?.terminal.write(data);
  }

  /** Resize an owned terminal, retaining valid dimensions for malformed requests. */
  resize(ownerId: number, terminalId: string, cols: number, rows: number): void {
    const session = this.getSession(ownerId, terminalId);
    if (!session) return;
    session.terminal.resize(dimension(cols, session.terminal.cols), dimension(rows, session.terminal.rows));
  }

  /** Close one terminal without affecting neighboring panes. */
  kill(ownerId: number, terminalId: string): void {
    const session = this.getSession(ownerId, terminalId);
    if (!session) return;
    this.sessions.delete(terminalId);
    try {
      session.terminal.kill();
    } catch {
      // A process can exit before the renderer's close request reaches the main process.
    }
  }

  /** Close a window's processes and cancel starts still waiting for the native module. */
  closeOwner(ownerId: number): void {
    this.owners.delete(ownerId);
    for (const [terminalId, session] of this.sessions) {
      if (session.ownerId === ownerId) this.kill(ownerId, terminalId);
    }
  }

  /** Release every terminal during application shutdown. */
  dispose(): void {
    for (const ownerId of this.owners.keys()) this.closeOwner(ownerId);
  }

  private getSession(ownerId: number, terminalId: string): TerminalSession | undefined {
    const session = this.sessions.get(terminalId);
    return session?.ownerId === ownerId ? session : undefined;
  }
}
