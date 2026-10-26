/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join } from 'node:path';
import type { RemoteEnvironment, RemoteEnvironmentInput, RemoteHostKeyApproval } from '@/common/types/remote';

type StoredEnvironment = {
  environment: RemoteEnvironment;
  passwordCiphertext?: string;
  passphraseCiphertext?: string;
};

export type RemoteConnection = {
  environment: RemoteEnvironment;
  password?: string;
  passphrase?: string;
  trustedHostKey?: string;
};

export type SecretCipher = {
  isAvailable: () => boolean;
  encrypt: (value: string) => Buffer;
  decrypt: (value: Buffer) => string;
};

export class RemoteEnvironmentError extends Error {
  constructor(
    readonly code: string,
    message: string
  ) {
    super(message);
    this.name = 'RemoteEnvironmentError';
  }
}

function validateText(value: string, label: string, maxLength = 255): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength || normalized.includes('\u0000') || /[\r\n]/.test(normalized)) {
    throw new RemoteEnvironmentError('invalid_input', `${label} is invalid`);
  }
  return normalized;
}

function validateUser(value?: string): string | undefined {
  if (!value?.trim()) return undefined;
  const user = value.trim();
  if (!/^[a-z_][a-z0-9_-]*\$?$/i.test(user)) throw new RemoteEnvironmentError('invalid_input', 'Linux user is invalid');
  return user;
}

function toPublic(record: StoredEnvironment): RemoteEnvironment {
  return { ...record.environment };
}

export class RemoteEnvironmentStore {
  private records = new Map<string, StoredEnvironment>();
  private writeChain: Promise<void> = Promise.resolve();

  constructor(
    private readonly filePath: string,
    private readonly cipher: SecretCipher
  ) {
    try {
      const parsed = JSON.parse(readFileSync(filePath, 'utf8')) as { environments?: StoredEnvironment[] };
      for (const record of parsed.environments ?? []) {
        if (record.environment?.id && ['ssh', 'wsl', 'docker'].includes(record.environment.kind)) {
          this.records.set(record.environment.id, record);
        }
      }
    } catch {}
  }

  list(): RemoteEnvironment[] {
    return [...this.records.values()].map(toPublic);
  }

  private encrypt(value?: string): string | undefined {
    if (!value) return undefined;
    if (!this.cipher.isAvailable()) {
      throw new RemoteEnvironmentError('encryption_unavailable', 'OS secure storage is unavailable');
    }
    return this.cipher.encrypt(value).toString('base64');
  }

  private decrypt(ciphertext?: string): string | undefined {
    if (!ciphertext) return undefined;
    return this.cipher.decrypt(Buffer.from(ciphertext, 'base64'));
  }

  async save(input: RemoteEnvironmentInput): Promise<RemoteEnvironment> {
    const now = Date.now();
    const id = randomUUID();
    let environment: RemoteEnvironment;
    let passwordCiphertext: string | undefined;
    let passphraseCiphertext: string | undefined;
    if (input.kind === 'ssh') {
      const host = validateText(input.host, 'SSH host');
      const username = validateText(input.username, 'SSH username');
      const port = input.port ?? 22;
      if (!Number.isInteger(port) || port < 1 || port > 65535 || /\s/.test(host)) {
        throw new RemoteEnvironmentError('invalid_input', 'SSH host or port is invalid');
      }
      if (input.authType === 'password' && !input.password) {
        throw new RemoteEnvironmentError('invalid_input', 'SSH password is required');
      }
      if (input.authType === 'privateKey' && (!input.privateKeyPath || !isAbsolute(input.privateKeyPath))) {
        throw new RemoteEnvironmentError('invalid_input', 'An absolute private key path is required');
      }
      passwordCiphertext = input.authType === 'password' ? this.encrypt(input.password) : undefined;
      passphraseCiphertext = input.authType === 'privateKey' ? this.encrypt(input.passphrase) : undefined;
      environment = {
        id,
        kind: 'ssh',
        name: input.name?.trim() || `${username}@${host}:${port}`,
        host,
        port,
        username,
        authType: input.authType,
        ...(input.authType === 'privateKey' ? { privateKeyPath: input.privateKeyPath } : {}),
        createdAt: now,
        updatedAt: now,
      };
    } else if (input.kind === 'wsl') {
      const distribution = input.distribution ? validateText(input.distribution, 'WSL distribution') : undefined;
      environment = {
        id,
        kind: 'wsl',
        name: input.name?.trim() || distribution || 'WSL',
        distribution,
        user: validateUser(input.user),
        createdAt: now,
        updatedAt: now,
      };
    } else {
      const container = validateText(input.container, 'Docker container');
      if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(container)) {
        throw new RemoteEnvironmentError('invalid_input', 'Docker container name or ID is invalid');
      }
      environment = {
        id,
        kind: 'docker',
        name: input.name?.trim() || container,
        container,
        user: validateUser(input.user),
        createdAt: now,
        updatedAt: now,
      };
    }
    this.records.set(id, { environment, passwordCiphertext, passphraseCiphertext });
    await this.persist();
    return { ...environment };
  }

  getConnection(id: string, hostKeyApproval?: RemoteHostKeyApproval): RemoteConnection {
    const record = this.records.get(id);
    if (!record) throw new RemoteEnvironmentError('not_found', 'Remote environment not found');
    return {
      environment: toPublic(record),
      password: this.decrypt(record.passwordCiphertext),
      passphrase: this.decrypt(record.passphraseCiphertext),
      trustedHostKey:
        hostKeyApproval?.fingerprint ??
        (record.environment.kind === 'ssh' ? record.environment.hostKeyFingerprint : undefined),
    };
  }

  async approveHostKey(id: string, fingerprint: string): Promise<void> {
    const record = this.records.get(id);
    if (!record || record.environment.kind !== 'ssh')
      throw new RemoteEnvironmentError('not_found', 'SSH environment not found');
    record.environment.hostKeyFingerprint = fingerprint;
    record.environment.updatedAt = Date.now();
    await this.persist();
  }

  async remove(id: string): Promise<void> {
    this.records.delete(id);
    await this.persist();
  }

  private async persist(): Promise<void> {
    const payload = JSON.stringify({ version: 1, environments: [...this.records.values()] }, null, 2);
    this.writeChain = this.writeChain
      .catch(() => {})
      .then(async () => {
        await mkdir(dirname(this.filePath), { recursive: true });
        const temporary = join(dirname(this.filePath), `.remote-environments.${process.pid}.tmp`);
        await writeFile(temporary, payload, { mode: 0o600 });
        await rename(temporary, this.filePath);
      });
    return this.writeChain;
  }
}
