/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';

vi.mock('@/common/platform/bridge', () => ({
  bridge: {
    buildProvider: vi.fn(() => {
      const handlerMap = new Map<string, Function>();
      return {
        provider: vi.fn((handler: Function) => {
          handlerMap.set('handler', handler);
          return vi.fn();
        }),
        invoke: vi.fn(),
        _getHandler: () => handlerMap.get('handler'),
      };
    }),
    buildEmitter: vi.fn(() => ({
      emit: vi.fn(),
      on: vi.fn(),
    })),
  },
}));

vi.mock('electron', () => ({
  app: {
    getVersion: vi.fn(() => '1.0.0'),
    getPath: vi.fn(() => '/test/path'),
    exit: vi.fn(),
    isPackaged: true,
  },
  autoUpdater: {
    on: vi.fn(),
    removeListener: vi.fn(),
  },
}));

vi.mock('electron-updater', () => ({
  autoUpdater: {
    logger: null,
    autoDownload: false,
    autoInstallOnAppQuit: true,
    allowPrerelease: false,
    allowDowngrade: false,
    setFeedURL: vi.fn(),
    on: vi.fn(),
    removeListener: vi.fn(),
    checkForUpdates: vi.fn(),
    downloadUpdate: vi.fn(),
    quitAndInstall: vi.fn(),
    checkForUpdatesAndNotify: vi.fn(),
  },
}));

vi.mock('electron-log', () => ({
  default: {
    transports: { file: { level: 'info' } },
    debug: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

import { afterAll, beforeAll } from 'vitest';
import { findLatestGitHubRelease, mapGitHubReleaseToRelease } from '@process/bridge/updateBridge';

const realPlatform = process.platform;
const realArch = process.arch;
beforeAll(() => {
  Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });
  Object.defineProperty(process, 'arch', { value: 'arm64', configurable: true });
});
afterAll(() => {
  Object.defineProperty(process, 'platform', { value: realPlatform, configurable: true });
  Object.defineProperty(process, 'arch', { value: realArch, configurable: true });
});

const makeRelease = (tagName: string, prerelease = false) => {
  const version = tagName.replace(/^v/, '');
  return {
    tag_name: tagName,
    name: tagName,
    body: `notes for ${tagName}`,
    html_url: `https://github.com/salmoshu/Catfish/releases/tag/${tagName}`,
    published_at: '2026-07-31T14:45:19.381Z',
    prerelease,
    draft: false,
    assets: [
      {
        name: `Catfish-${version}-mac-arm64.zip`,
        browser_download_url: `https://github.com/salmoshu/Catfish/releases/download/${tagName}/Catfish-${version}-mac-arm64.zip`,
        size: 474779381,
      },
      {
        name: `Catfish-${version}-mac-arm64.dmg`,
        browser_download_url: `https://github.com/salmoshu/Catfish/releases/download/${tagName}/Catfish-${version}-mac-arm64.dmg`,
        size: 469685641,
      },
      {
        name: `Catfish-${version}-mac-arm64.yml`,
        browser_download_url: `https://github.com/salmoshu/Catfish/releases/download/${tagName}/Catfish-${version}-mac-arm64.yml`,
        size: 100,
      },
    ],
  };
};

describe('mapGitHubReleaseToRelease', () => {
  it('maps release metadata and direct GitHub installer assets', () => {
    const release = mapGitHubReleaseToRelease(makeRelease('v2.1.45'));

    expect(release).toMatchObject({
      tagName: 'v2.1.45',
      version: '2.1.45',
      name: 'v2.1.45',
      body: 'notes for v2.1.45',
      htmlUrl: 'https://github.com/salmoshu/Catfish/releases/tag/v2.1.45',
      publishedAt: '2026-07-31T14:45:19.381Z',
      prerelease: false,
      draft: false,
    });
    expect(release?.assets).toHaveLength(2);
    expect(release?.recommendedAsset?.name).toBe('Catfish-2.1.45-mac-arm64.dmg');
    expect(release?.recommendedAsset?.url).toBe(
      'https://github.com/salmoshu/Catfish/releases/download/v2.1.45/Catfish-2.1.45-mac-arm64.dmg'
    );
    expect(release?.recommendedAsset?.fallbackUrl).toBeUndefined();
  });

  it('returns null for a non-semver tag', () => {
    expect(mapGitHubReleaseToRelease(makeRelease('not-a-version'))).toBeNull();
  });
});

describe('findLatestGitHubRelease', () => {
  it('selects the highest stable semver and excludes drafts and prereleases by default', () => {
    const releases = [
      makeRelease('v2.1.44'),
      { ...makeRelease('v2.2.0-beta.1', true) },
      { ...makeRelease('v9.9.9'), draft: true },
      makeRelease('v2.1.45'),
    ];

    expect(findLatestGitHubRelease(releases, false)?.version).toBe('2.1.45');
  });

  it('includes prereleases when requested', () => {
    const releases = [makeRelease('v2.1.45'), makeRelease('v2.2.0-beta.1', true)];

    expect(findLatestGitHubRelease(releases, true)?.version).toBe('2.2.0-beta.1');
  });

  it('returns null when no usable release remains', () => {
    expect(findLatestGitHubRelease([makeRelease('invalid')], false)).toBeNull();
  });
});
