/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UpdateModules } from '@/process/startup/updateStartup';

const appMock = vi.hoisted(() => ({
  quit: vi.fn(),
  exit: vi.fn(),
}));

vi.mock('electron', () => ({ app: appMock }));

type UpdateService = UpdateModules[0]['autoUpdaterService'];

const createModuleMocks = () => {
  const autoUpdaterService = {
    initialize: vi.fn(),
    setBeforeQuitAndInstall: vi.fn(),
    checkForUpdatesAndNotify: vi.fn().mockResolvedValue(undefined),
  } as unknown as UpdateService;
  const updateBridge = {
    initUpdateBridge: vi.fn(),
    createAutoUpdateStatusBroadcast: vi.fn(() => vi.fn()),
  } as unknown as UpdateModules[1];
  const loadModules = vi.fn((): Promise<UpdateModules> => Promise.resolve([{ autoUpdaterService }, updateBridge]));
  return { autoUpdaterService, updateBridge, loadModules };
};

const createWindow = () => {
  let rendererReady: () => void = vi.fn();
  const once = vi.fn((_event: 'did-finish-load', listener: () => void) => {
    rendererReady = listener;
  });
  const window = {
    webContents: { once },
    isDestroyed: vi.fn(() => false),
  };
  return { window, finishRendererLoad: () => rendererReady() };
};

describe('startup update check', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('initializes lazily and checks only after the renderer finishes loading', async () => {
    const { autoUpdaterService, updateBridge, loadModules } = createModuleMocks();
    const { window, finishRendererLoad } = createWindow();
    const { scheduleStartupUpdateCheck } = await import('@/process/startup/updateStartup');

    scheduleStartupUpdateCheck(window, {
      beforeQuitAndInstall: vi.fn(),
      loadModules,
      logError: vi.fn(),
    });

    expect(loadModules).toHaveBeenCalledTimes(1);
    expect(autoUpdaterService.checkForUpdatesAndNotify).not.toHaveBeenCalled();

    finishRendererLoad();

    await vi.waitFor(() => expect(autoUpdaterService.checkForUpdatesAndNotify).toHaveBeenCalledTimes(1));
    expect(updateBridge.initUpdateBridge).toHaveBeenCalledTimes(1);
    expect(autoUpdaterService.initialize).toHaveBeenCalledTimes(1);
    expect(appMock.quit).not.toHaveBeenCalled();
    expect(appMock.exit).not.toHaveBeenCalled();
  });

  it('contains a dynamic-import failure without quitting', async () => {
    const importError = new Error('update bridge import failed');
    const logError = vi.fn();
    const { window, finishRendererLoad } = createWindow();
    const { scheduleStartupUpdateCheck } = await import('@/process/startup/updateStartup');

    scheduleStartupUpdateCheck(window, {
      beforeQuitAndInstall: vi.fn(),
      loadModules: vi.fn().mockRejectedValue(importError),
      logError,
    });
    finishRendererLoad();

    await vi.waitFor(() =>
      expect(logError).toHaveBeenCalledWith('[AionUi] Failed to initialize auto-updater:', importError)
    );
    expect(appMock.quit).not.toHaveBeenCalled();
    expect(appMock.exit).not.toHaveBeenCalled();
  });

  it('contains a feed failure without quitting', async () => {
    const feedError = new Error('feed unavailable');
    const logError = vi.fn();
    const { autoUpdaterService, loadModules } = createModuleMocks();
    vi.mocked(autoUpdaterService.checkForUpdatesAndNotify).mockRejectedValue(feedError);
    const { window, finishRendererLoad } = createWindow();
    const { scheduleStartupUpdateCheck } = await import('@/process/startup/updateStartup');

    scheduleStartupUpdateCheck(window, {
      beforeQuitAndInstall: vi.fn(),
      loadModules,
      logError,
    });
    finishRendererLoad();

    await vi.waitFor(() => expect(logError).toHaveBeenCalledWith('[AionUi] Startup update check failed:', feedError));
    expect(appMock.quit).not.toHaveBeenCalled();
    expect(appMock.exit).not.toHaveBeenCalled();
  });
});
