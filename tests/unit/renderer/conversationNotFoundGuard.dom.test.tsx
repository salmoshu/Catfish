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
import { SWRConfig } from 'swr';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TChatConversation } from '@/common/config/storage';

let currentId = 'c1';
const navigate = vi.fn();
const warning = vi.fn();
const getConversationOrNull = vi.fn<(id: string) => Promise<TChatConversation | null>>();

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
    <div data-testid='chat'>{conversation?.id ?? 'missing'}</div>
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
  getConversationOrNull: (id: string) => getConversationOrNull(id),
}));

import ChatConversationIndex from '@/renderer/pages/conversation/index';

const conv = (id: string): TChatConversation =>
  ({ id, name: 'x', type: 'acp', extra: { workspace: '/w' }, project_id: null }) as unknown as TChatConversation;

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
};

const renderIndex = (swrConfig: { provider: () => Map<unknown, unknown>; dedupingInterval: number }) =>
  render(
    <SWRConfig value={swrConfig}>
      <ChatConversationIndex />
    </SWRConfig>
  );

beforeEach(() => {
  currentId = 'c1';
  navigate.mockClear();
  warning.mockClear();
  getConversationOrNull.mockReset();
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
      view.rerender(
        <SWRConfig value={swrConfig}>
          <ChatConversationIndex />
        </SWRConfig>
      );
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
      view.rerender(
        <SWRConfig value={swrConfig}>
          <ChatConversationIndex />
        </SWRConfig>
      );
    });
    await waitFor(() => expect(getConversationOrNull).toHaveBeenCalledWith('c2'));
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
      view.rerender(
        <SWRConfig value={swrConfig}>
          <ChatConversationIndex />
        </SWRConfig>
      );
    });
    expect(navigate).not.toHaveBeenCalled();

    await act(async () => {
      second.resolve(null);
    });
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/', { replace: true }));
    expect(warning).toHaveBeenCalledWith('conversation.notFound');
  });
});
