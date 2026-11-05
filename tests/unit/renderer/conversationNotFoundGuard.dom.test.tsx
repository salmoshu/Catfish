/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * SWR keeps the hook mounted across `/conversation/:id` changes, so a new key's
 * first render is NOT an initial mount: `isLoading` can be false while `data`
 * is still undefined. The not-found redirect must wait for an explicit `null`
 * (the 404 result), not for "no data yet", or switching conversations randomly
 * ejects the user to home before the fetch has even settled.
 */

import { act, render, waitFor } from '@testing-library/react';
import React from 'react';
import { SWRConfig, useSWRConfig } from 'swr';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TChatConversation } from '@/common/config/storage';
import type { BackendEnvironment } from '@/common/types/remote';
import { shouldRevalidateBackendCacheKey } from '@/renderer/utils/workspace/backendCache';

let currentId = 'c1';
const navigate = vi.fn();
const warning = vi.fn();
const getConversationOrNull =
  vi.fn<(id: string, environment?: BackendEnvironment) => Promise<TChatConversation | null>>();

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('react-router-dom', () => ({
  useParams: () => ({ id: currentId }),
  useNavigate: () => navigate,
}));
vi.mock('@arco-design/web-react', () => ({
  Message: { warning: (content: unknown) => warning(content) },
  Spin: ({ children }: React.PropsWithChildren) => <div data-testid='spin'>{children}</div>,
}));
vi.mock('@/common', () => ({
  ipcBridge: { conversation: { listChanged: { on: () => () => {} } } },
}));
vi.mock('@/renderer/pages/conversation/components/ChatConversation', () => ({
  default: ({ conversation }: { conversation?: TChatConversation }) => (
    <div data-testid='chat'>{conversation ? `${conversation.id}:${conversation.name}` : 'missing'}</div>
  ),
}));
vi.mock('@/renderer/pages/conversation/Preview', () => ({
  usePreviewContext: () => ({ closePreviewIfScopeChanged: vi.fn() }),
}));
vi.mock('@/renderer/hooks/chat/useAutoTitle', () => ({ useAutoTitle: () => ({ syncTitleFromHistory: vi.fn() }) }));
vi.mock('@/renderer/pages/conversation/explorer/currentProjectStore', () => ({ setCurrentProject: vi.fn() }));
vi.mock('@/renderer/pages/conversation/explorer/currentConversationStore', () => ({ setCurrentConversation: vi.fn() }));
vi.mock('@/renderer/pages/conversation/GroupedHistory/hooks/useConversationListSync', () => ({
  getSnapshotConversationProjectId: () => null,
}));
vi.mock('@/renderer/pages/conversation/utils/conversationCache', () => ({
  getConversationOrNull: (id: string, environment?: BackendEnvironment) => getConversationOrNull(id, environment),
}));

import ChatConversationIndex from '@/renderer/pages/conversation/index';

const conv = (id: string): TChatConversation =>
  ({ id, name: 'x', type: 'acp', extra: { workspace: '/w' }, project_id: null }) as unknown as TChatConversation;

const remote: BackendEnvironment = { type: 'remote', id: 'wsl-1', name: 'WSL', kind: 'wsl' };

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
};

let revalidateBackendData = () => {};
const BackendRefreshCapture: React.FC = () => {
  const { mutate } = useSWRConfig();
  revalidateBackendData = () => {
    void mutate(shouldRevalidateBackendCacheKey, undefined, { revalidate: true });
  };
  return null;
};

type TestSwrConfig = { provider: () => Map<unknown, unknown>; dedupingInterval: number };

const conversationTree = (swrConfig: TestSwrConfig) => (
  <SWRConfig value={swrConfig}>
    <BackendRefreshCapture />
    <ChatConversationIndex />
  </SWRConfig>
);

const renderIndex = (swrConfig: TestSwrConfig) => render(conversationTree(swrConfig));

beforeEach(() => {
  currentId = 'c1';
  window.__backendEnvironment = { type: 'local' };
  navigate.mockClear();
  warning.mockClear();
  getConversationOrNull.mockReset();
  revalidateBackendData = () => {};
});

afterEach(() => {
  delete window.__backendEnvironment;
});

describe('conversation route not-found guard', () => {
  it('does not redirect while a switched conversation is still loading', async () => {
    const second = deferred<TChatConversation | null>();
    getConversationOrNull.mockImplementation((id) => (id === 'c1' ? Promise.resolve(conv('c1')) : second.promise));

    const swrConfig = { provider: () => new Map(), dedupingInterval: 0 };
    const view = renderIndex(swrConfig);
    await waitFor(() => expect(view.getByTestId('chat')).toHaveTextContent('c1'));

    currentId = 'c2';
    await act(async () => {
      view.rerender(conversationTree(swrConfig));
    });

    // The new key has no data yet, but that is not a 404: stay on the route.
    expect(navigate).not.toHaveBeenCalled();
    expect(warning).not.toHaveBeenCalled();

    await act(async () => {
      second.resolve(conv('c2'));
    });
    await waitFor(() => expect(view.getByTestId('chat')).toHaveTextContent('c2'));
    expect(navigate).not.toHaveBeenCalled();
    expect(warning).not.toHaveBeenCalled();
  });

  it('does not mistake a transient fetch failure for a deleted conversation', async () => {
    getConversationOrNull.mockImplementation((id) =>
      id === 'c1' ? Promise.resolve(conv('c1')) : Promise.reject(new Error('backend is restarting'))
    );

    const swrConfig = { provider: () => new Map(), dedupingInterval: 0, shouldRetryOnError: false };
    const view = renderIndex(swrConfig);
    await waitFor(() => expect(view.getByTestId('chat')).toHaveTextContent('c1'));

    currentId = 'c2';
    await act(async () => {
      view.rerender(conversationTree(swrConfig));
    });
    await waitFor(() => expect(getConversationOrNull).toHaveBeenCalledWith('c2', { type: 'local' }));
    await act(async () => {
      await Promise.resolve();
    });

    // A non-404 failure leaves `data` undefined, but it is not proof of deletion.
    expect(navigate).not.toHaveBeenCalled();
    expect(warning).not.toHaveBeenCalled();
  });

  it('redirects only after the lookup explicitly resolves to null', async () => {
    const second = deferred<TChatConversation | null>();
    getConversationOrNull.mockImplementation((id) => (id === 'c1' ? Promise.resolve(conv('c1')) : second.promise));

    const swrConfig = { provider: () => new Map(), dedupingInterval: 0 };
    const view = renderIndex(swrConfig);
    await waitFor(() => expect(view.getByTestId('chat')).toHaveTextContent('c1'));

    currentId = 'deleted';
    await act(async () => {
      view.rerender(conversationTree(swrConfig));
    });
    expect(navigate).not.toHaveBeenCalled();

    await act(async () => {
      second.resolve(null);
    });
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/', { replace: true }));
    expect(warning).toHaveBeenCalledWith('conversation.notFound');
  });

  it('does not reuse a local conversation while the same remote id is loading', async () => {
    const remoteLookup = deferred<TChatConversation | null>();
    getConversationOrNull.mockImplementation((id, environment) =>
      environment?.type === 'remote'
        ? remoteLookup.promise
        : Promise.resolve({ ...conv(id), name: 'local' } as TChatConversation)
    );
    currentId = 'shared-id';
    const swrConfig = { provider: () => new Map(), dedupingInterval: 0 };
    const view = renderIndex(swrConfig);
    await waitFor(() => expect(view.getByTestId('chat')).toHaveTextContent('shared-id:local'));

    window.__backendEnvironment = remote;
    await act(async () => {
      view.rerender(conversationTree(swrConfig));
    });

    expect(view.queryByText('shared-id:local')).not.toBeInTheDocument();
    expect(navigate).not.toHaveBeenCalled();

    await act(async () => {
      remoteLookup.resolve({ ...conv('shared-id'), name: 'remote' } as TChatConversation);
    });
    await waitFor(() => expect(view.getByTestId('chat')).toHaveTextContent('shared-id:remote'));
    expect(warning).not.toHaveBeenCalled();
  });

  it('skips outgoing-environment queries during the global refresh and survives a round trip', async () => {
    getConversationOrNull.mockImplementation((id, environment) =>
      Promise.resolve({ ...conv(id), name: environment?.type ?? 'local' } as TChatConversation)
    );
    const swrConfig = { provider: () => new Map(), dedupingInterval: 0 };
    const view = renderIndex(swrConfig);
    await waitFor(() => expect(view.getByTestId('chat')).toHaveTextContent('c1:local'));
    expect(getConversationOrNull).toHaveBeenCalledTimes(1);

    window.__backendEnvironment = remote;
    await act(async () => {
      revalidateBackendData();
      await Promise.resolve();
    });
    expect(getConversationOrNull).toHaveBeenCalledTimes(1);
    expect(navigate).not.toHaveBeenCalled();
    expect(warning).not.toHaveBeenCalled();

    currentId = 'c2';
    await act(async () => {
      view.rerender(conversationTree(swrConfig));
    });
    await waitFor(() => expect(view.getByTestId('chat')).toHaveTextContent('c2:remote'));

    window.__backendEnvironment = { type: 'local' };
    currentId = 'c1';
    await act(async () => {
      view.rerender(conversationTree(swrConfig));
    });
    await waitFor(() => expect(view.getByTestId('chat')).toHaveTextContent('c1:local'));
    expect(navigate).not.toHaveBeenCalled();
    expect(warning).not.toHaveBeenCalled();
  });
});
