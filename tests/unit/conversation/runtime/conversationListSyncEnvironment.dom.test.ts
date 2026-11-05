import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TChatConversation } from '@/common/config/storage';
import { setBackendRuntime } from '@/common/adapter/httpBridge';

const mocks = vi.hoisted(() => ({
  getConversations: vi.fn(),
  historyRefresh: { current: null as null | (() => void) },
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    database: { getUserConversations: { invoke: mocks.getConversations } },
    application: { writeRendererLog: { invoke: vi.fn().mockResolvedValue(undefined) } },
    conversation: {
      listChanged: { on: vi.fn() },
      nameUpdated: { on: vi.fn() },
      responseStream: { on: vi.fn() },
      turnCompleted: { on: vi.fn() },
      confirmation: { remove: { on: vi.fn() } },
    },
  },
}));
vi.mock('@/renderer/hooks/chat/useAutoTitle', () => ({
  useAutoTitle: () => ({ syncTitleFromHistory: vi.fn() }),
}));
vi.mock('@/renderer/utils/emitter', () => ({
  addEventListener: (event: string, callback: () => void) => {
    if (event === 'chat.history.refresh') mocks.historyRefresh.current = callback;
    return vi.fn();
  },
}));

import {
  getSnapshotConversationName,
  useConversationListSync,
} from '@/renderer/pages/conversation/GroupedHistory/hooks/useConversationListSync';
import { readEnvironmentProjects } from '@/renderer/utils/workspace/environmentProjects';

const local = { type: 'local' } as const;
const remote = { type: 'remote', id: 'wsl-1', name: 'WSL', kind: 'wsl' } as const;

const conversation = (id: string, workspace: string): TChatConversation =>
  ({
    id,
    name: id,
    type: 'acp',
    project_id: `${id}-project`,
    modified_at: 1,
    extra: { workspace, custom_workspace: true },
  }) as unknown as TChatConversation;

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
};

afterEach(() => {
  setBackendRuntime(local, 41000);
  localStorage.clear();
  vi.clearAllMocks();
  mocks.historyRefresh.current = null;
});

describe('conversation list environment switching', () => {
  it('ignores a slower local response after the remote list has landed', async () => {
    setBackendRuntime(local, 41000);
    const localRequest = deferred<{ items: TChatConversation[] }>();
    const remoteRequest = deferred<{ items: TChatConversation[] }>();
    mocks.getConversations.mockReturnValueOnce(localRequest.promise).mockReturnValueOnce(remoteRequest.promise);
    renderHook(() => useConversationListSync());
    await waitFor(() => expect(mocks.getConversations).toHaveBeenCalledTimes(1));

    setBackendRuntime(remote, 42000);
    act(() => mocks.historyRefresh.current?.());
    await waitFor(() => expect(mocks.getConversations).toHaveBeenCalledTimes(2));
    await act(async () => {
      remoteRequest.resolve({ items: [conversation('remote-chat', '/home/user/RemoteProject')] });
      await remoteRequest.promise;
    });
    await waitFor(() => expect(getSnapshotConversationName('remote-chat')).toBe('remote-chat'));

    await act(async () => {
      localRequest.resolve({ items: [conversation('local-chat', 'E:/LocalProject')] });
      await localRequest.promise;
    });

    expect(getSnapshotConversationName('remote-chat')).toBe('remote-chat');
    expect(getSnapshotConversationName('local-chat')).toBeUndefined();
    const remoteIndex = readEnvironmentProjects().find((entry) => entry.environment.type === 'remote');
    expect(remoteIndex?.projects.map((project) => project.workspace)).toEqual(['/home/user/RemoteProject']);
  });
});
