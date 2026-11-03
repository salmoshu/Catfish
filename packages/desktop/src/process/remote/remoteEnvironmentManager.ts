/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  BackendEnvironment,
  RemoteEnvironmentDiscovery,
  RemoteEnvironmentInput,
  RemoteEnvironmentProgress,
  RemoteEnvironmentState,
  RemoteEnvironmentSummary,
  RemoteOperationResult,
} from '@/common/types/remote';
import type { RemoteEnvironmentConnectParams } from '@/common/types/remote';
import type { RemoteConnection, RemoteEnvironmentStore } from './remoteEnvironmentStore';
import { RemoteEnvironmentError } from './remoteEnvironmentStore';
import type { RemoteExecutor } from './remoteExecutor';
import { ProcessRemoteExecutor, listDockerContainers, listWslDistributions } from './processRemoteExecutor';
import { RemoteHostKeyError, SshRemoteExecutor } from './sshRemoteExecutor';
import type { RemotePackageManager } from './remotePackageManager';
import { RemoteBackend } from './remoteBackend';

type ManagerEvent =
  | { type: 'progress'; progress: RemoteEnvironmentProgress }
  | { type: 'disconnected'; environmentId: string; reason: string };

type ActiveRuntime = {
  environmentId: string;
  environment: BackendEnvironment & { type: 'remote' };
  backend: RemoteBackend;
};

function success<T>(data: T): RemoteOperationResult<T> {
  return { ok: true, data };
}

function failure(error: unknown): Extract<RemoteOperationResult<never>, { ok: false }> {
  if (error instanceof RemoteHostKeyError) {
    return {
      ok: false,
      code: error.expectedFingerprint ? 'host_key_mismatch' : 'host_key_confirmation_required',
      message: error.message,
      hostKey: {
        host: error.host,
        port: error.port,
        fingerprint: error.fingerprint,
        expectedFingerprint: error.expectedFingerprint,
      },
    };
  }
  const abort = typeof error === 'object' && error !== null && 'name' in error && error.name === 'AbortError';
  return {
    ok: false,
    code: abort ? 'cancelled' : error instanceof RemoteEnvironmentError ? error.code : 'connection_failed',
    message: error instanceof Error ? error.message : String(error),
  };
}

export class RemoteEnvironmentManager {
  private activeRuntime?: ActiveRuntime;
  private readonly runtimes = new Map<string, ActiveRuntime>();
  private connectingId?: string;
  private abortController?: AbortController;
  private connectingBackend?: RemoteBackend;
  private readonly errors = new Map<string, string>();
  private readonly listeners = new Set<(event: ManagerEvent) => void>();

  constructor(
    private readonly store: RemoteEnvironmentStore,
    private readonly packages: RemotePackageManager,
    private readonly appVersion: string
  ) {}

  get active(): BackendEnvironment {
    return this.activeRuntime?.environment ?? { type: 'local' };
  }

  get port(): number | null {
    return this.activeRuntime?.backend.port ?? null;
  }

  getState(): RemoteEnvironmentState {
    return {
      active: this.active,
      connectingId: this.connectingId,
      lastError: this.connectingId ? this.errors.get(this.connectingId) : undefined,
    };
  }

  list(): RemoteEnvironmentSummary[] {
    return this.store.list().map((environment) => ({
      ...environment,
      status: this.runtimes.has(environment.id)
        ? 'connected'
        : this.connectingId === environment.id
          ? 'connecting'
          : this.errors.has(environment.id)
            ? 'error'
            : 'disconnected',
    }));
  }

  subscribe(listener: (event: ManagerEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(event: ManagerEvent): void {
    for (const listener of this.listeners) listener(event);
  }

  private progress(environmentId: string, stage: RemoteEnvironmentProgress['stage'], detail?: string): void {
    this.emit({ type: 'progress', progress: { environmentId, stage, detail, timestamp: Date.now() } });
  }

  async save(
    input: RemoteEnvironmentInput
  ): Promise<RemoteOperationResult<Awaited<ReturnType<RemoteEnvironmentStore['save']>>>> {
    try {
      return success(await this.store.save(input));
    } catch (error) {
      return failure(error);
    }
  }

  async remove(id: string): Promise<RemoteOperationResult> {
    try {
      if (this.connectingId) return { ok: false, code: 'busy', message: 'A connection attempt is in progress' };
      const runtime = this.runtimes.get(id);
      if (runtime) {
        this.runtimes.delete(id);
        if (this.activeRuntime?.environmentId === id) this.activeRuntime = undefined;
        await runtime.backend.stop().catch(() => {});
      }
      await this.store.remove(id);
      this.errors.delete(id);
      return success(undefined);
    } catch (error) {
      return failure(error);
    }
  }

  async discover(): Promise<RemoteEnvironmentDiscovery> {
    const [wsl, docker] = await Promise.allSettled([listWslDistributions(), listDockerContainers()]);
    return {
      wsl: {
        supported: process.platform === 'win32',
        distributions: wsl.status === 'fulfilled' ? wsl.value : [],
        error: wsl.status === 'rejected' ? String(wsl.reason) : undefined,
      },
      docker: {
        supported: docker.status === 'fulfilled',
        containers: docker.status === 'fulfilled' ? docker.value : [],
        error: docker.status === 'rejected' ? String(docker.reason) : undefined,
      },
    };
  }

  private executor(connection: RemoteConnection): RemoteExecutor {
    const environment = connection.environment;
    if (environment.kind === 'ssh') {
      return new SshRemoteExecutor({
        host: environment.host,
        port: environment.port,
        username: environment.username,
        password: connection.password,
        privateKeyPath: environment.privateKeyPath,
        passphrase: connection.passphrase,
        trustedHostKey: connection.trustedHostKey,
      });
    }
    if (environment.kind === 'wsl') {
      return new ProcessRemoteExecutor({ kind: 'wsl', distribution: environment.distribution, user: environment.user });
    }
    return new ProcessRemoteExecutor({ kind: 'docker', container: environment.container, user: environment.user });
  }

  async connect(params: RemoteEnvironmentConnectParams): Promise<RemoteOperationResult<BackendEnvironment>> {
    if (this.connectingId) return { ok: false, code: 'busy', message: 'A connection attempt is in progress' };
    if (this.activeRuntime?.environmentId === params.id) return success(this.activeRuntime.environment);
    const existing = this.runtimes.get(params.id);
    if (existing) {
      this.activeRuntime = existing;
      this.progress(params.id, 'connected');
      return success(existing.environment);
    }
    let connection: RemoteConnection;
    try {
      connection = this.store.getConnection(params.id, params.hostKeyApproval);
    } catch (error) {
      return failure(error);
    }
    this.connectingId = params.id;
    this.errors.delete(params.id);
    this.abortController = new AbortController();
    const executor = this.executor(connection);
    try {
      this.progress(params.id, 'connecting');
      await executor.connect(this.abortController.signal);
      this.progress(params.id, 'detecting');
      const installation = await this.packages.ensureInstalled(executor, this.abortController.signal, (stage) =>
        this.progress(params.id, stage)
      );
      this.progress(params.id, 'starting');
      const backend = await RemoteBackend.start({
        executor,
        installation,
        appVersion: this.appVersion,
        signal: this.abortController.signal,
        onUnexpectedExit: (error) => {
          void this.handleUnexpectedExit(params.id, error);
        },
      });
      this.connectingBackend = backend;
      if (this.abortController.signal.aborted || backend.isExited) {
        await backend.stop();
        throw new DOMException('Remote operation cancelled', 'AbortError');
      }
      if (connection.environment.kind === 'ssh' && params.hostKeyApproval) {
        await this.store.approveHostKey(params.id, params.hostKeyApproval.fingerprint);
      }
      const environment: ActiveRuntime['environment'] = {
        type: 'remote',
        id: connection.environment.id,
        name: connection.environment.name,
        kind: connection.environment.kind,
      };
      this.activeRuntime = { environmentId: params.id, environment, backend };
      this.runtimes.set(params.id, this.activeRuntime);
      this.connectingBackend = undefined;
      this.connectingId = undefined;
      this.abortController = undefined;
      this.progress(params.id, 'connected');
      return success(environment);
    } catch (error) {
      await this.connectingBackend?.stop().catch(() => {});
      this.connectingBackend = undefined;
      await executor.close().catch(() => {});
      const result = failure(error);
      if (
        result.code !== 'host_key_confirmation_required' &&
        result.code !== 'host_key_mismatch' &&
        result.code !== 'cancelled'
      ) {
        this.errors.set(params.id, result.message);
      }
      return result;
    } finally {
      this.connectingId = undefined;
      this.abortController = undefined;
      this.connectingBackend = undefined;
    }
  }

  private async handleUnexpectedExit(environmentId: string, error: Error): Promise<void> {
    const runtime = this.runtimes.get(environmentId);
    if (!runtime) return;
    this.runtimes.delete(environmentId);
    if (this.activeRuntime?.environmentId === environmentId) this.activeRuntime = undefined;
    this.errors.set(environmentId, error.message);
    this.emit({ type: 'disconnected', environmentId, reason: error.message });
    await runtime.backend.stop().catch(() => {});
  }

  async cancel(): Promise<void> {
    this.abortController?.abort();
    await this.connectingBackend?.stop().catch(() => {});
  }

  /** Switch the UI backend without stopping any connected remote runtime. */
  async activate(id?: string): Promise<RemoteOperationResult<BackendEnvironment>> {
    if (!id) {
      this.activeRuntime = undefined;
      return success({ type: 'local' });
    }
    const runtime = this.runtimes.get(id);
    if (!runtime) {
      return { ok: false, code: 'not_connected', message: 'Remote environment is not connected' };
    }
    this.activeRuntime = runtime;
    return success(runtime.environment);
  }

  /** Explicitly stop the active remote runtime and return the UI to local. */
  async disconnect(): Promise<RemoteOperationResult<BackendEnvironment>> {
    await this.cancel();
    const runtime = this.activeRuntime;
    this.activeRuntime = undefined;
    if (runtime) this.runtimes.delete(runtime.environmentId);
    try {
      await runtime?.backend.stop();
      return success({ type: 'local' });
    } catch (error) {
      return failure(error);
    }
  }

  async stop(): Promise<void> {
    await this.cancel();
    this.activeRuntime = undefined;
    const runtimes = [...this.runtimes.values()];
    this.runtimes.clear();
    await Promise.all(runtimes.map((runtime) => runtime.backend.stop().catch(() => {})));
  }
}
