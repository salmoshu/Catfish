/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { fsMocks, platformState } = vi.hoisted(() => ({
  fsMocks: {
    existsSync: vi.fn(() => false),
    lstatSync: vi.fn(),
    mkdirSync: vi.fn(),
    readlinkSync: vi.fn(),
    symlinkSync: vi.fn(),
    unlinkSync: vi.fn(),
  },
  platformState: {
    isPackaged: false,
    needsCliSafeSymlinks: false,
  },
}));

vi.mock('@/common/platform', () => ({
  getPlatformServices: () => ({
    paths: {
      getDataDir: () => '/mock/userData',
      getTempDir: () => '/mock/temp',
      getHomeDir: () => '/mock/home',
      isPackaged: () => platformState.isPackaged,
      needsCliSafeSymlinks: () => platformState.needsCliSafeSymlinks,
    },
  }),
}));

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return {
    ...actual,
    existsSync: fsMocks.existsSync,
    lstatSync: fsMocks.lstatSync,
    mkdirSync: fsMocks.mkdirSync,
    readlinkSync: fsMocks.readlinkSync,
    symlinkSync: fsMocks.symlinkSync,
    unlinkSync: fsMocks.unlinkSync,
  };
});

import { getDataPath } from '@process/utils/utils';
import { getEnvAwareName } from '@/common/config/appEnv';

describe('getDataPath', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    platformState.isPackaged = false;
    platformState.needsCliSafeSymlinks = false;
  });

  it('uses the real data directory in packaged builds instead of a symlink', () => {
    platformState.isPackaged = true;
    platformState.needsCliSafeSymlinks = true;

    expect(getDataPath()).toBe(path.join('/mock/userData', 'aionui'));
    expect(fsMocks.lstatSync).not.toHaveBeenCalled();
    expect(fsMocks.symlinkSync).not.toHaveBeenCalled();
  });

  it('keeps the CLI-safe symlink for development builds that need it', () => {
    platformState.needsCliSafeSymlinks = true;
    fsMocks.lstatSync.mockImplementation(() => {
      throw new Error('missing symlink');
    });

    const expected = path.join('/mock/home', getEnvAwareName('.aionui'));
    expect(getDataPath()).toBe(expected);
    expect(fsMocks.symlinkSync).toHaveBeenCalledWith(path.join('/mock/userData', 'aionui'), expected);
  });
});
