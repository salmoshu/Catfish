/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { join } from 'node:path';
import { BrowserWindow, app, dialog, safeStorage } from 'electron';
import { ipcBridge } from '@/common';
import { getConfigPath } from '@process/utils/utils';
import { resolveBinaryPath } from '@process/backend/binaryResolver';
import packageManifest from '../../../../../package.json';
import { RemoteEnvironmentStore } from './remoteEnvironmentStore';
import { RemotePackageManager } from './remotePackageManager';
import { RemoteEnvironmentManager } from './remoteEnvironmentManager';
import { httpRequest } from '@/common/adapter/httpBridge';
import { fromApiConversation } from '@/common/adapter/apiModelMapper';
import type { TChatConversation } from '@/common/config/storage';
import type { ManagedAgent } from '@/renderer/utils/model/agentTypes';

let manager: RemoteEnvironmentManager | undefined;

export function getRemoteEnvironmentManager(): RemoteEnvironmentManager {
  if (!manager) {
    const store = new RemoteEnvironmentStore(join(getConfigPath(), 'remote-environments.json'), {
      isAvailable: () => safeStorage.isEncryptionAvailable(),
      encrypt: (value) => safeStorage.encryptString(value),
      decrypt: (value) => safeStorage.decryptString(value),
    });
    const packages = new RemotePackageManager({
      cacheDir: join(app.getPath('userData'), 'remote-runtime-cache'),
      version: packageManifest.aioncoreVersion,
      resolveLocalBinary: resolveBinaryPath,
    });
    manager = new RemoteEnvironmentManager(store, packages, app.getVersion());
  }
  return manager;
}

export function peekRemoteEnvironmentManager(): RemoteEnvironmentManager | undefined {
  return manager;
}

async function requestRemoteRuntime<T>(id: string, path: string, method: 'GET' | 'POST' = 'GET'): Promise<T> {
  const port = getRemoteEnvironmentManager().portFor(id);
  if (!port) throw new Error('Remote environment is not connected');
  const response = await fetch(`http://127.0.0.1:${port}${path}`, { method });
  if (!response.ok) throw new Error(`Remote runtime request failed (${response.status})`);
  return (await response.json()) as T;
}

export function initRemoteEnvironmentBridge(): void {
  const remote = ipcBridge.remoteEnvironment;
  remote.localConversations.provider(async () => {
    const result = await httpRequest<{ items: TChatConversation[] }>('GET', '/api/conversations?limit=10000');
    return result.items.map(fromApiConversation);
  });
  remote.conversations.provider(async ({ id }) => {
    const port = getRemoteEnvironmentManager().portFor(id);
    if (!port) return [];
    const response = await fetch(`http://127.0.0.1:${port}/api/conversations?limit=10000`);
    if (!response.ok) throw new Error(`Remote conversation query failed (${response.status})`);
    const result = (await response.json()) as { items: TChatConversation[] };
    return result.items.map(fromApiConversation);
  });
  remote.agents.provider(({ id }) => requestRemoteRuntime<ManagedAgent[]>(id, '/api/agents/management'));
  remote.checkAgent.provider(({ environmentId, agentId }) =>
    requestRemoteRuntime<ManagedAgent>(environmentId, `/api/agents/${encodeURIComponent(agentId)}/health-check`, 'POST')
  );
  let subscribed = false;
  const getManager = () => {
    const instance = getRemoteEnvironmentManager();
    if (!subscribed) {
      subscribed = true;
      instance.subscribe((event) => {
        if (event.type === 'progress') remote.progress.emit(event.progress);
        else remote.disconnected.emit({ environmentId: event.environmentId, reason: event.reason });
      });
    }
    return instance;
  };
  remote.list.provider(() => getManager().list());
  remote.state.provider(() => {
    const instance = getManager();
    const localPort = (globalThis as typeof globalThis & { __backendPort?: number }).__backendPort ?? null;
    return { ...instance.getState(), port: instance.port ?? localPort };
  });
  remote.discover.provider(() => getManager().discover());
  remote.save.provider((input) => getManager().save(input));
  remote.connect.provider((params) => getManager().connect(params));
  remote.activate.provider(({ id }) => getManager().activate(id));
  remote.disconnect.provider(() => getManager().disconnect());
  remote.cancel.provider(() => getManager().cancel());
  remote.selectPrivateKey.provider(async () => {
    const parent = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
    const options = { properties: ['openFile'] as Array<'openFile'> };
    const result = parent ? await dialog.showOpenDialog(parent, options) : await dialog.showOpenDialog(options);
    return result.canceled ? undefined : result.filePaths[0];
  });
  remote.remove.provider(({ id }) => getManager().remove(id));
}
