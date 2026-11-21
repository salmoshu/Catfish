import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, (params: { id: string }) => Promise<unknown>>(),
  manager: { portFor: vi.fn(), subscribe: vi.fn() },
  fetch: vi.fn(),
}));

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => 'E:\\Proj-Enhanced\\Catfish\\tmp\\remote-runtime-test'),
    getVersion: vi.fn(() => '0.4.31'),
  },
  BrowserWindow: { getFocusedWindow: vi.fn(), getAllWindows: vi.fn(() => []) },
  dialog: { showOpenDialog: vi.fn() },
  safeStorage: {
    isEncryptionAvailable: vi.fn(() => false),
    encryptString: vi.fn(),
    decryptString: vi.fn(),
  },
}));
vi.mock('@process/utils/utils', () => ({ getConfigPath: vi.fn(() => 'E:\\Proj-Enhanced\\Catfish\\tmp') }));
vi.mock('@process/backend/binaryResolver', () => ({ resolveBinaryPath: vi.fn() }));
vi.mock('@process/remote/remoteEnvironmentStore', () => ({ RemoteEnvironmentStore: vi.fn() }));
vi.mock('@process/remote/remotePackageManager', () => ({ RemotePackageManager: vi.fn() }));
vi.mock('@process/remote/remoteEnvironmentManager', () => ({
  RemoteEnvironmentManager: vi.fn(function () {
    return mocks.manager;
  }),
}));
vi.mock('@/common', () => {
  const endpoint = (name: string) => ({
    provider: vi.fn((handler: (params: { id: string }) => Promise<unknown>) => {
      mocks.handlers.set(name, handler);
    }),
    emit: vi.fn(),
  });
  return {
    ipcBridge: {
      remoteEnvironment: Object.fromEntries(
        [
          'localConversations',
          'conversations',
          'agents',
          'checkAgent',
          'progress',
          'disconnected',
          'list',
          'state',
          'discover',
          'save',
          'connect',
          'activate',
          'disconnect',
          'cancel',
          'selectPrivateKey',
          'remove',
        ].map((name) => [name, endpoint(name)])
      ),
    },
  };
});

import { initRemoteEnvironmentBridge } from '@process/remote/remoteEnvironmentRuntime';

describe('remote environment runtime bridge', () => {
  beforeEach(() => {
    mocks.handlers.clear();
    mocks.manager.portFor.mockReturnValue(41001);
    mocks.manager.subscribe.mockReturnValue(() => {});
    vi.stubGlobal('fetch', mocks.fetch);
    initRemoteEnvironmentBridge();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('unwraps the Core API envelope before returning remote agents to the renderer', async () => {
    const agent = {
      id: 'codex',
      name: 'Codex',
      agent_type: 'acp',
      agent_source: 'builtin',
      enabled: true,
      installed: true,
      status: 'online',
    };
    mocks.fetch.mockResolvedValue(
      new Response(JSON.stringify({ success: true, data: [agent] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const result = await mocks.handlers.get('agents')?.({ id: 'wsl' });

    expect(result).toEqual([agent]);
    expect(mocks.fetch).toHaveBeenCalledWith(
      'http://127.0.0.1:41001/api/agents/management',
      expect.objectContaining({ method: 'GET' })
    );
  });

  it('uses the same Core API envelope for remote conversation lists', async () => {
    const conversation = { id: 'conversation-1', name: 'Remote conversation' };
    mocks.fetch.mockResolvedValue(
      new Response(JSON.stringify({ success: true, data: { items: [conversation] } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const result = await mocks.handlers.get('conversations')?.({ id: 'wsl' });

    expect(result).toEqual([expect.objectContaining(conversation)]);
    expect(mocks.fetch).toHaveBeenCalledWith(
      'http://127.0.0.1:41001/api/conversations?limit=10000',
      expect.objectContaining({ method: 'GET' })
    );
  });
});
