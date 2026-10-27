/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ipcBridge } from '@/common';
import { useAutoTitle } from '@/renderer/hooks/chat/useAutoTitle';
import { getConversationOrNull } from '@/renderer/pages/conversation/utils/conversationCache';
import {
  loadAllConversationMessagesPaged,
  loadLatestConversationMessages,
} from '@/renderer/utils/chat/messagePagination';
import { emitter } from '@/renderer/utils/emitter';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    conversation: {
      update: {
        invoke: vi.fn(),
      },
    },
  },
}));

vi.mock('@/renderer/pages/conversation/utils/conversationCache', () => ({
  getConversationOrNull: vi.fn(),
}));

vi.mock('@/renderer/utils/chat/messagePagination', () => ({
  DEFAULT_MESSAGE_PAGE_LIMIT: 50,
  loadAllConversationMessagesPaged: vi.fn(),
  loadLatestConversationMessages: vi.fn(),
}));

vi.mock('@/renderer/utils/emitter', () => ({
  emitter: {
    emit: vi.fn(),
  },
}));

const updateConversation = vi.mocked(ipcBridge.conversation.update.invoke);
const getConversation = vi.mocked(getConversationOrNull);
const loadAllMessages = vi.mocked(loadAllConversationMessagesPaged);
const loadLatestMessages = vi.mocked(loadLatestConversationMessages);
const emit = vi.mocked(emitter.emit);

describe('useAutoTitle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getConversation.mockResolvedValue({
      id: 'conversation-1',
      name: 'conversation.welcome.newConversation',
    } as Awaited<ReturnType<typeof getConversationOrNull>>);
    loadAllMessages.mockResolvedValue([]);
    loadLatestMessages.mockResolvedValue({
      items: [],
      oldest_cursor: null,
      newest_cursor: null,
      has_more_before: false,
      has_more_after: false,
    });
    updateConversation.mockResolvedValue(true);
  });

  it('uses the default latest compact message window when syncing a default title', async () => {
    const { result } = renderHook(() => useAutoTitle());

    await act(async () => {
      await result.current.syncTitleFromHistory('conversation-1', 'Fallback title');
    });

    expect(loadLatestMessages).toHaveBeenCalledWith('conversation-1', {
      limit: 50,
      contentMode: 'compact',
    });
    expect(loadAllMessages).not.toHaveBeenCalled();
    expect(updateConversation).toHaveBeenCalledWith({
      id: 'conversation-1',
      // Derived default titles are tagged 'auto' so the backend keeps them
      // overwritable by agent-generated session titles (never 'user'-locked).
      updates: { name: 'Fallback title', name_source: 'auto' },
    });
    expect(emit).toHaveBeenCalledWith('chat.history.refresh');
  });

  it('repairs a late agent title derived from Assistant Rules', async () => {
    getConversation.mockResolvedValue({
      id: 'conversation-1',
      name: '[Assistant Rules] ## Available Skills - **aionui-config**',
      name_source: 'agent',
    } as Awaited<ReturnType<typeof getConversationOrNull>>);
    loadLatestMessages.mockResolvedValue({
      items: [
        {
          id: 'message-1',
          type: 'text',
          position: 'right',
          content: '[Assistant Rules]\n## Available Skills\n[/Assistant Rules]\n\n使用agent新建会话',
        },
      ],
      oldest_cursor: null,
      newest_cursor: null,
      has_more_before: false,
      has_more_after: false,
    } as never);
    const { result } = renderHook(() => useAutoTitle());

    await act(async () => {
      await result.current.syncTitleFromHistory('conversation-1');
    });

    expect(loadAllMessages).not.toHaveBeenCalled();
    expect(updateConversation).toHaveBeenCalledWith({
      id: 'conversation-1',
      updates: { name: '使用agent新建会话', name_source: 'auto' },
    });
  });

  it('looks beyond the latest page when repairing a contaminated title', async () => {
    getConversation.mockResolvedValue({
      id: 'conversation-1',
      name: '[Assistant Rules] ## Available Skills',
      name_source: 'agent',
    } as Awaited<ReturnType<typeof getConversationOrNull>>);
    loadAllMessages.mockResolvedValue([
      {
        id: 'message-1',
        type: 'text',
        position: 'right',
        content: '[Assistant Rules]\n## Available Skills\n[/Assistant Rules]\n\nFix the sidebar title',
      },
    ] as never);
    const { result } = renderHook(() => useAutoTitle());

    await act(async () => {
      await result.current.syncTitleFromHistory('conversation-1');
    });

    expect(loadAllMessages).toHaveBeenCalledWith('conversation-1', { contentMode: 'compact' });
    expect(updateConversation).toHaveBeenCalledWith({
      id: 'conversation-1',
      updates: { name: 'Fix the sidebar title', name_source: 'auto' },
    });
  });

  it('uses the localized default when a contaminated title has no usable prompt', async () => {
    getConversation.mockResolvedValue({
      id: 'conversation-1',
      name: '[Assistant Rules] ## Available Skills',
      name_source: 'agent',
    } as Awaited<ReturnType<typeof getConversationOrNull>>);
    const { result } = renderHook(() => useAutoTitle());

    await act(async () => {
      await result.current.syncTitleFromHistory('conversation-1');
    });

    expect(updateConversation).toHaveBeenCalledWith({
      id: 'conversation-1',
      updates: { name: 'conversation.welcome.newConversation', name_source: 'auto' },
    });
  });

  it('preserves a user rename even when it starts with Assistant Rules', async () => {
    getConversation.mockResolvedValue({
      id: 'conversation-1',
      name: '[Assistant Rules] custom title',
      name_source: 'user',
    } as Awaited<ReturnType<typeof getConversationOrNull>>);
    const { result } = renderHook(() => useAutoTitle());

    await act(async () => {
      await result.current.syncTitleFromHistory('conversation-1');
    });

    expect(loadLatestMessages).not.toHaveBeenCalled();
    expect(updateConversation).not.toHaveBeenCalled();
  });

  it('leaves a normal agent-generated title unchanged', async () => {
    getConversation.mockResolvedValue({
      id: 'conversation-1',
      name: 'Refactor agent sessions',
      name_source: 'agent',
    } as Awaited<ReturnType<typeof getConversationOrNull>>);
    const { result } = renderHook(() => useAutoTitle());

    await act(async () => {
      await result.current.syncTitleFromHistory('conversation-1');
    });

    expect(loadLatestMessages).not.toHaveBeenCalled();
    expect(updateConversation).not.toHaveBeenCalled();
  });
});
