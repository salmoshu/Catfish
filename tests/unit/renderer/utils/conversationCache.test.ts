/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BackendHttpError, setBackendRuntime } from '@/common/adapter/httpBridge';
import { ipcBridge } from '@/common';
import type { TChatConversation } from '@/common/config/storage';
import type { BackendEnvironment } from '@/common/types/remote';
import { mutate } from 'swr';
import {
  ConversationEnvironmentChangedError,
  getConversationOrNull,
  refreshConversationCache,
} from '@/renderer/pages/conversation/utils/conversationCache';
import { backendCacheKey, shouldRevalidateBackendCacheKey } from '@/renderer/utils/workspace/backendCache';

vi.mock('@/common', () => ({
  ipcBridge: {
    conversation: {
      get: {
        invoke: vi.fn(),
      },
    },
  },
}));

vi.mock('swr', () => ({
  mutate: vi.fn(),
}));

const mockConversation = {
  id: 'conv-1',
  name: 'Test conversation',
  type: 'acp',
  status: 'finished',
  extra: {},
} as TChatConversation;

const local: BackendEnvironment = { type: 'local' };
const remote: BackendEnvironment = { type: 'remote', id: 'wsl-1', name: 'WSL', kind: 'wsl' };

const notFoundError = (id: string) =>
  new BackendHttpError({
    method: 'GET',
    path: `/api/conversations/${id}`,
    status: 404,
    body: { success: false, error: `Not found: Conversation ${id} not found`, code: 'NOT_FOUND' },
  });

describe('conversationCache', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setBackendRuntime(local, 41000);
  });

  describe('getConversationOrNull', () => {
    it('returns null when the backend reports a missing conversation', async () => {
      vi.mocked(ipcBridge.conversation.get.invoke).mockRejectedValue(notFoundError('missing'));

      await expect(getConversationOrNull('missing')).resolves.toBeNull();
    });

    it('returns the conversation when the backend lookup succeeds', async () => {
      vi.mocked(ipcBridge.conversation.get.invoke).mockResolvedValue(mockConversation);

      await expect(getConversationOrNull('conv-1')).resolves.toBe(mockConversation);
    });

    it('rethrows non-404 backend errors so database failures remain visible', async () => {
      const error = new BackendHttpError({
        method: 'GET',
        path: '/api/conversations/conv-1',
        status: 500,
        body: {
          success: false,
          error: 'Internal error: Database error: no such table: conversations',
          code: 'INTERNAL_ERROR',
        },
      });
      vi.mocked(ipcBridge.conversation.get.invoke).mockRejectedValue(error);

      await expect(getConversationOrNull('conv-1')).rejects.toBe(error);
    });

    it('does not turn a 404 into deletion when the environment changed during lookup', async () => {
      let rejectLookup!: (error: Error) => void;
      vi.mocked(ipcBridge.conversation.get.invoke).mockImplementation(
        () =>
          new Promise<TChatConversation>((_resolve, reject) => {
            rejectLookup = reject;
          })
      );
      const pending = getConversationOrNull('conv-1', local);

      setBackendRuntime(remote, 42000);
      rejectLookup(notFoundError('conv-1'));

      await expect(pending).rejects.toBeInstanceOf(ConversationEnvironmentChangedError);
    });

    it('does not query an environment-scoped id after that environment became inactive', async () => {
      setBackendRuntime(remote, 42000);

      await expect(getConversationOrNull('conv-1', local)).rejects.toBeInstanceOf(ConversationEnvironmentChangedError);
      expect(ipcBridge.conversation.get.invoke).not.toHaveBeenCalled();
    });
  });

  describe('refreshConversationCache', () => {
    it('skips cache mutation when the conversation is missing', async () => {
      vi.mocked(ipcBridge.conversation.get.invoke).mockRejectedValue(notFoundError('missing'));

      await expect(refreshConversationCache('missing')).resolves.toBeUndefined();

      expect(mutate).not.toHaveBeenCalled();
    });

    it('writes a successful refresh to the active environment cache', async () => {
      vi.mocked(ipcBridge.conversation.get.invoke).mockResolvedValue(mockConversation);

      await refreshConversationCache('conv-1');

      expect(mutate).toHaveBeenCalledWith('conversation/local/conv-1', mockConversation, false);
    });

    it('rethrows non-404 backend errors instead of hiding them', async () => {
      const error = new BackendHttpError({
        method: 'GET',
        path: '/api/conversations/conv-1',
        status: 500,
        body: {
          success: false,
          error: 'Internal error: Database error: no such table: conversations',
          code: 'INTERNAL_ERROR',
        },
      });
      vi.mocked(ipcBridge.conversation.get.invoke).mockRejectedValue(error);

      await expect(refreshConversationCache('conv-1')).rejects.toBe(error);

      expect(mutate).not.toHaveBeenCalled();
    });
  });

  describe('backend-scoped cache keys', () => {
    it('keeps conversation and project ids separate across environments', () => {
      expect(backendCacheKey('conversation', 'shared', local)).toBe('conversation/local/shared');
      expect(backendCacheKey('conversation', 'shared', remote)).toBe('conversation/remote:wsl-1/shared');
      expect(backendCacheKey('explorer-project', 'project', remote)).toBe('explorer-project/remote:wsl-1/project');
    });

    it('revalidates only the active environment entity caches plus unrelated queries', () => {
      setBackendRuntime(remote, 42000);

      expect(shouldRevalidateBackendCacheKey('conversation/local/c1')).toBe(false);
      expect(shouldRevalidateBackendCacheKey('explorer-project/local/p1')).toBe(false);
      expect(shouldRevalidateBackendCacheKey('conversation/remote:wsl-1/c1')).toBe(true);
      expect(shouldRevalidateBackendCacheKey('explorer-project/remote:wsl-1/p1')).toBe(true);
      expect(shouldRevalidateBackendCacheKey('providers')).toBe(true);
      expect(shouldRevalidateBackendCacheKey(['team', 't1'])).toBe(true);
    });
  });
});
