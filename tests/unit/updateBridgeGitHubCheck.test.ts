/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
    getVersion: vi.fn(() => '2.1.40'),
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

vi.mock('@process/services/i18n', () => ({
  default: { t: (key: string) => key },
}));

import { afterAll, beforeAll } from 'vitest';

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

const makeRelease = (version: string, prerelease = false) => ({
  tag_name: `v${version}`,
  name: `v${version}`,
  body: 'changelog body',
  html_url: `https://github.com/salmoshu/Catfish/releases/tag/v${version}`,
  published_at: '2026-07-31T14:45:19.381Z',
  prerelease,
  draft: false,
  assets: [
    {
      name: `Catfish-${version}-mac-arm64.zip`,
      browser_download_url: `https://github.com/salmoshu/Catfish/releases/download/v${version}/Catfish-${version}-mac-arm64.zip`,
      size: 100,
    },
    {
      name: `Catfish-${version}-mac-arm64.dmg`,
      browser_download_url: `https://github.com/salmoshu/Catfish/releases/download/v${version}/Catfish-${version}-mac-arm64.dmg`,
      size: 200,
    },
  ],
});

const getCheckHandler = async () => {
  vi.resetModules();
  const { initUpdateBridge } = await import('@process/bridge/updateBridge');
  const { ipcBridge } = await import('@/common');
  initUpdateBridge();
  const provider = vi.mocked(ipcBridge.update.check.provider);
  const lastCall = provider.mock.calls.at(-1);
  if (!lastCall) throw new Error('update.check handler not registered');
  return lastCall[0];
};

const stubGitHubFetch = (respond: () => Promise<Response> | Response) => {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url !== 'https://api.github.com/repos/salmoshu/Catfish/releases') {
      throw new Error(`unexpected fetch: ${url}`);
    }
    return respond();
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};

const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe('update.check GitHub releases', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reports an update from salmoshu/Catfish with notes and direct assets', async () => {
    const fetchMock = stubGitHubFetch(() => jsonResponse([makeRelease('2.1.45')]));
    const handler = await getCheckHandler();
    const res = await handler({});

    expect(res.success).toBe(true);
    expect(res.data?.updateAvailable).toBe(true);
    expect(res.data?.latest?.version).toBe('2.1.45');
    expect(res.data?.latest?.body).toBe('changelog body');
    expect(res.data?.latest?.htmlUrl).toBe('https://github.com/salmoshu/Catfish/releases/tag/v2.1.45');
    expect(res.data?.latest?.recommendedAsset?.url).toBe(
      'https://github.com/salmoshu/Catfish/releases/download/v2.1.45/Catfish-2.1.45-mac-arm64.dmg'
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).not.toContain('iOfficeAI');
  });

  it('excludes prereleases and drafts from stable checks', async () => {
    stubGitHubFetch(() =>
      jsonResponse([makeRelease('2.1.45'), makeRelease('2.2.0-beta.1', true), { ...makeRelease('9.9.9'), draft: true }])
    );
    const handler = await getCheckHandler();
    const res = await handler({ includePrerelease: false });

    expect(res.success).toBe(true);
    expect(res.data?.latest?.version).toBe('2.1.45');
  });

  it('includes prereleases when requested', async () => {
    stubGitHubFetch(() => jsonResponse([makeRelease('2.1.45'), makeRelease('2.2.0-beta.1', true)]));
    const handler = await getCheckHandler();
    const res = await handler({ includePrerelease: true });

    expect(res.success).toBe(true);
    expect(res.data?.latest?.version).toBe('2.2.0-beta.1');
    expect(res.data?.latest?.prerelease).toBe(true);
  });

  it('reports up-to-date when the latest GitHub version equals the current version', async () => {
    stubGitHubFetch(() => jsonResponse([makeRelease('2.1.40')]));
    const handler = await getCheckHandler();
    const res = await handler({});

    expect(res.success).toBe(true);
    expect(res.data?.updateAvailable).toBe(false);
  });

  it('reports no update when GitHub has no usable releases', async () => {
    stubGitHubFetch(() => jsonResponse([]));
    const handler = await getCheckHandler();
    const res = await handler({});

    expect(res.success).toBe(true);
    expect(res.data?.updateAvailable).toBe(false);
    expect(res.data?.latest).toBeUndefined();
  });

  it('fails the check when the GitHub request fails', async () => {
    stubGitHubFetch(() => jsonResponse('nope', 502));
    const handler = await getCheckHandler();
    const res = await handler({});

    expect(res.success).toBe(false);
  });

  it('fails the check when GitHub returns a non-array payload', async () => {
    stubGitHubFetch(() => jsonResponse({ not: 'an array' }));
    const handler = await getCheckHandler();
    const res = await handler({});

    expect(res.success).toBe(false);
  });
});
