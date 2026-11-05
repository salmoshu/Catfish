import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const baseUrl = vi.hoisted(() => ({ current: 'http://127.0.0.1:41000' }));

vi.mock('@/common/adapter/httpBridge', () => ({ getBaseUrl: () => baseUrl.current }));

import { configService } from '@/common/config/configService';

const response = (data: Record<string, unknown>) =>
  new Response(JSON.stringify({ data }), { status: 200, headers: { 'Content-Type': 'application/json' } });

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
};

describe('configService backend switching', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    configService.reset();
    baseUrl.current = 'http://127.0.0.1:41000';
  });

  afterEach(() => {
    configService.reset();
    vi.unstubAllGlobals();
  });

  it('uses the active backend URL for initialization and reload', async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(response({ language: 'zh-CN' })));
    vi.stubGlobal('fetch', fetchMock);
    await configService.initialize();

    baseUrl.current = 'http://127.0.0.1:42000';
    await configService.reload();

    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
      'http://127.0.0.1:41000/api/settings/client',
      'http://127.0.0.1:42000/api/settings/client',
    ]);
  });

  it('does not let a slower initialization overwrite a newer reload', async () => {
    const initial = deferred<Response>();
    const reload = deferred<Response>();
    const fetchMock = vi.fn().mockReturnValueOnce(initial.promise).mockReturnValueOnce(reload.promise);
    vi.stubGlobal('fetch', fetchMock);

    const initializing = configService.initialize();
    baseUrl.current = 'http://127.0.0.1:42000';
    const reloading = configService.reload();
    reload.resolve(response({ language: 'remote' }));
    await reloading;
    initial.resolve(response({ language: 'local' }));
    await initializing;

    expect(configService.get('language')).toBe('remote');
    expect(configService.isInitialized()).toBe(true);
  });
});
