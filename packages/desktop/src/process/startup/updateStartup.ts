/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { BeforeQuitAndInstallCallback } from '../services/autoUpdaterService';

type AutoUpdaterService = typeof import('../services/autoUpdaterService').autoUpdaterService;
export type UpdateModules = [typeof import('../services/autoUpdaterService'), typeof import('../bridge/updateBridge')];

type StartupUpdateWindow = {
  webContents: {
    once: (event: 'did-finish-load', listener: () => void) => void;
  };
  isDestroyed: () => boolean;
};

type StartupUpdateOptions = {
  beforeQuitAndInstall: BeforeQuitAndInstallCallback;
  loadModules?: () => Promise<UpdateModules>;
  logError?: (message: string, error: unknown) => void;
};

const loadUpdateModules = (): Promise<UpdateModules> =>
  Promise.all([import('../services/autoUpdaterService'), import('../bridge/updateBridge')]);

let updateInitialization: Promise<AutoUpdaterService | null> | null = null;

export const scheduleStartupUpdateCheck = (window: StartupUpdateWindow, options: StartupUpdateOptions): void => {
  const logError = options.logError ?? ((message, error) => console.error(message, error));
  if (!updateInitialization) {
    const loadModules = options.loadModules ?? loadUpdateModules;
    updateInitialization = loadModules()
      .then(([{ autoUpdaterService }, { createAutoUpdateStatusBroadcast, initUpdateBridge }]) => {
        initUpdateBridge();
        autoUpdaterService.initialize(createAutoUpdateStatusBroadcast());
        autoUpdaterService.setBeforeQuitAndInstall(options.beforeQuitAndInstall);
        return autoUpdaterService;
      })
      .catch((error: unknown): null => {
        logError('[AionUi] Failed to initialize auto-updater:', error);
        return null;
      });
  }

  window.webContents.once('did-finish-load', () => {
    void updateInitialization
      ?.then((autoUpdaterService) => {
        if (!autoUpdaterService || window.isDestroyed()) return;
        return autoUpdaterService.checkForUpdatesAndNotify();
      })
      .catch((error: unknown) => {
        logError('[AionUi] Startup update check failed:', error);
      });
  });
};
