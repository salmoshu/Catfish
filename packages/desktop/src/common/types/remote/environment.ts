/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

export type RemoteEnvironmentKind = 'ssh' | 'wsl' | 'docker';
export type RemoteEnvironmentStatus = 'disconnected' | 'connecting' | 'connected' | 'error';
export type RemoteConnectionStage = 'connecting' | 'detecting' | 'installing' | 'starting' | 'connected';

type RemoteEnvironmentBase = {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
};

export type SshRemoteEnvironment = RemoteEnvironmentBase & {
  kind: 'ssh';
  host: string;
  port: number;
  username: string;
  authType: 'password' | 'privateKey';
  privateKeyPath?: string;
  hostKeyFingerprint?: string;
};

export type WslRemoteEnvironment = RemoteEnvironmentBase & {
  kind: 'wsl';
  distribution?: string;
  user?: string;
};

export type DockerRemoteEnvironment = RemoteEnvironmentBase & {
  kind: 'docker';
  container: string;
  user?: string;
};

export type RemoteEnvironment = SshRemoteEnvironment | WslRemoteEnvironment | DockerRemoteEnvironment;
export type RemoteEnvironmentSummary = RemoteEnvironment & { status: RemoteEnvironmentStatus };

export type RemoteEnvironmentInput =
  | {
      kind: 'ssh';
      name?: string;
      host: string;
      port?: number;
      username: string;
      authType: 'password' | 'privateKey';
      password?: string;
      privateKeyPath?: string;
      passphrase?: string;
    }
  | { kind: 'wsl'; name?: string; distribution?: string; user?: string }
  | { kind: 'docker'; name?: string; container: string; user?: string };

export type BackendEnvironment =
  | { type: 'local' }
  | { type: 'remote'; id: string; name: string; kind: RemoteEnvironmentKind };

export type RemoteEnvironmentState = {
  active: BackendEnvironment;
  /** Loopback port for the active backend; local falls back to the main local backend. */
  port?: number | null;
  connectingId?: string;
  lastError?: string;
};

export type RemoteHostKeyDetails = {
  host: string;
  port: number;
  fingerprint: string;
  expectedFingerprint?: string;
};

export type RemoteOperationResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; code: string; message: string; hostKey?: RemoteHostKeyDetails };

export type RemoteEnvironmentProgress = {
  environmentId: string;
  stage: RemoteConnectionStage;
  detail?: string;
  timestamp: number;
};

export type RemoteEnvironmentDiscovery = {
  wsl: { supported: boolean; distributions: string[]; error?: string };
  docker: {
    supported: boolean;
    containers: Array<{ id: string; name: string; image: string }>;
    error?: string;
  };
};

export type RemoteHostKeyApproval = {
  fingerprint: string;
  allowChange: boolean;
};
