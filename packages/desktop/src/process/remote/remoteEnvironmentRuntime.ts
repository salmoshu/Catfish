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

export function initRemoteEnvironmentBridge(): void {
  const remote = ipcBridge.remoteEnvironment;
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
  remote.state.provider(() => getManager().getState());
  remote.discover.provider(() => getManager().discover());
  remote.save.provider((input) => getManager().save(input));
  remote.connect.provider((params) => getManager().connect(params));
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
