/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Reconcile wiring: `reconcileGeneratingFromRuntime` lets an authoritative
 * runtime summary (hydrate / send-accepted) relight the sidebar spinner when a
 * WS stream frame was missed (window reload/reconnect race). Fresh idle summaries
 * also clear a stale spinner; a revision guard prevents stale async responses from
 * overriding newer stream activity.
 */

import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ipcBridge } from '@/common';

const syncTitleFromHistory = vi.hoisted(() => vi.fn());

vi.mock('@/common', () => ({
  ipcBridge: {
    database: {
      getUserConversations: { invoke: vi.fn(() => new Promise(() => {})) },
    },
    conversation: {
      listChanged: { on: () => () => {} },
      nameUpdated: { on: vi.fn(() => () => {}) },
      responseStream: { on: () => () => {} },
      turnCompleted: { on: () => () => {} },
      confirmation: { remove: { on: () => () => {} } },
    },
    application: {
      writeRendererLog: { invoke: vi.fn().mockResolvedValue(undefined) },
    },
  },
}));

vi.mock('@/renderer/hooks/chat/useAutoTitle', () => ({
  useAutoTitle: () => ({ syncTitleFromHistory }),
}));

vi.mock('@/renderer/utils/emitter', () => ({ addEventListener: () => () => {} }));

import {
  getConversationStreamRevision,
  reconcileGeneratingFromRuntime,
  useConversationListSync,
} from '@/renderer/pages/conversation/GroupedHistory/hooks/useConversationListSync';

describe('reconcileGeneratingFromRuntime', () => {
  // Each test uses a distinct conversation id (conv-a/b/c/d) since the store
  // backing this hook is module-level and persists across tests in this file.

  it('marks a conversation generating when isProcessing is true', () => {
    const { result } = renderHook(() => useConversationListSync());

    act(() => {
      reconcileGeneratingFromRuntime('conv-a', true);
    });

    expect(result.current.isConversationGenerating('conv-a')).toBe(true);
  });

  it('does not touch other conversations when reconciling one id', () => {
    const { result } = renderHook(() => useConversationListSync());

    act(() => {
      reconcileGeneratingFromRuntime('conv-b', true);
    });

    expect(result.current.isConversationGenerating('conv-b')).toBe(true);
    expect(result.current.isConversationGenerating('conv-c')).toBe(false);
  });

  it('leaves the generating state unchanged when isProcessing is false', () => {
    const { result } = renderHook(() => useConversationListSync());

    act(() => {
      reconcileGeneratingFromRuntime('conv-d', false);
    });

    expect(result.current.isConversationGenerating('conv-d')).toBe(false);
  });

  it('clears a stale spinner using a fresh authoritative idle snapshot', () => {
    const { result } = renderHook(() => useConversationListSync());

    act(() => {
      reconcileGeneratingFromRuntime('conv-fresh', true);
      reconcileGeneratingFromRuntime('conv-fresh', false, getConversationStreamRevision('conv-fresh'));
    });

    expect(result.current.isConversationGenerating('conv-fresh')).toBe(false);
  });

  it('does not let an outdated idle snapshot clear newer stream activity', () => {
    const { result } = renderHook(() => useConversationListSync());

    act(() => {
      reconcileGeneratingFromRuntime('conv-stale', true);
      reconcileGeneratingFromRuntime('conv-stale', false, getConversationStreamRevision('conv-stale') - 1);
    });

    expect(result.current.isConversationGenerating('conv-stale')).toBe(true);
  });
});

describe('agent title updates', () => {
  it('repairs only titles with an Assistant Rules prefix', () => {
    syncTitleFromHistory.mockClear();
    renderHook(() => useConversationListSync());
    const nameUpdated = vi.mocked(ipcBridge.conversation.nameUpdated.on);
    const listener = nameUpdated.mock.calls.at(-1)?.[0];
    if (!listener) throw new Error('Agent title listener was not registered');

    act(() => {
      listener({ conversation_id: 'conv-title', name: 'Refactor agent sessions' });
      listener({
        conversation_id: 'conv-title',
        name: '[Assistant Rules] ## Available Skills - **aionui-config**: Configure AionUi itself',
      });
    });

    expect(syncTitleFromHistory).toHaveBeenCalledTimes(1);
    expect(syncTitleFromHistory).toHaveBeenCalledWith('conv-title');
  });
});
