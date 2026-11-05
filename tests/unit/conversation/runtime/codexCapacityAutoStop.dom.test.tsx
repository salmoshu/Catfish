/**
 * @vitest-environment jsdom
 */

/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * A Codex capacity stall is the one retry reason Catfish must not wait out:
 * retrying the same saturated model cannot succeed, and Codex's own retry loop
 * keeps the turn "running" while it tries. These tests pin the global backstop
 * that cancels the turn as soon as the retry tip names capacity.
 */

import { act, render, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IResponseMessage } from '@/common/adapter/ipcBridge';

let registered: ((message: IResponseMessage) => void) | null = null;
const stopInvoke = vi.fn();
const sendContinue = vi.fn();
const getConversation = vi.fn();
const pauseQueue = vi.fn();
const localStarted = vi.fn();
let activeTurnId: string | null = null;
let autoContinue = false;

vi.mock('@/common', () => ({
  ipcBridge: {
    conversation: {
      responseStream: {
        on: (callback: (message: IResponseMessage) => void) => {
          registered = callback;
          return () => {
            registered = null;
          };
        },
      },
      stop: { invoke: (params: unknown) => stopInvoke(params) },
      turnCompleted: { on: vi.fn(() => () => {}) },
    },
    acpConversation: {
      sendMessage: { invoke: (params: unknown) => sendContinue(params) },
    },
  },
}));

vi.mock('@/common/config/configService', () => ({
  configService: { get: () => autoContinue },
}));

vi.mock('@/renderer/pages/conversation/utils/conversationCache', () => ({
  getConversationOrNull: () => getConversation(),
}));

vi.mock('@/renderer/pages/conversation/runtime/conversationRuntimeViewStore', () => ({
  getConversationRuntimeViewSnapshot: () => ({ activeTurnId }),
  localSendStarted: (conversationId: string) => localStarted(conversationId),
  localSendAccepted: vi.fn(),
  localSendFailed: vi.fn(),
}));

vi.mock('@/renderer/pages/conversation/platforms/useConversationCommandQueue', () => ({
  pauseConversationCommandQueue: (conversationId: string) => pauseQueue(conversationId),
}));

const { useCodexCapacityAutoStop } = await import('@/renderer/pages/conversation/runtime/useCodexCapacityAutoStop');

const Host: React.FC = () => {
  useCodexCapacityAutoStop();
  return null;
};

let messageSeq = 0;
const capacityTip = (overrides: Partial<IResponseMessage> = {}): IResponseMessage => ({
  type: 'tips',
  conversation_id: 'conv-1',
  msg_id: `tip-${++messageSeq}`,
  turn_id: 'turn-1',
  data: {
    type: 'warning',
    code: 'CODEX_RETRYING',
    content: 'Reconnecting... 1/5 — Selected model is at capacity. Please try a different model.',
  },
  ...overrides,
});

const emit = async (message: IResponseMessage): Promise<void> => {
  await act(async () => {
    registered?.(message);
  });
};

const flushAsyncWork = async (): Promise<void> => {
  await act(async () => {
    await Promise.resolve();
  });
};

beforeEach(async () => {
  vi.clearAllMocks();
  registered = null;
  activeTurnId = null;
  messageSeq = 0;
  autoContinue = false;
  getConversation.mockResolvedValue(null);
  stopInvoke.mockResolvedValue({ runtime: {} });
  sendContinue.mockResolvedValue({ msg_id: 'msg-continue', turn_id: 'turn-continue', runtime: {} });
  render(<Host />);
  await waitFor(() => expect(registered).not.toBeNull());
});

describe('useCodexCapacityAutoStop', () => {
  it('cancels the turn when the retry reason is model capacity', async () => {
    await emit(capacityTip());

    await waitFor(() => expect(stopInvoke).toHaveBeenCalledWith({ conversation_id: 'conv-1', turn_id: 'turn-1' }));
  });

  it('cancels once per turn even when Codex reports several attempts', async () => {
    await emit(capacityTip());
    await emit(capacityTip());
    await flushAsyncWork();

    expect(stopInvoke).toHaveBeenCalledTimes(1);
  });

  it('leaves other retry reasons to Codex', async () => {
    await emit(
      capacityTip({
        data: {
          type: 'warning',
          code: 'CODEX_RETRYING',
          content: "Reconnecting... 1/5 — We're currently experiencing high demand",
        },
      })
    );
    await flushAsyncWork();

    expect(stopInvoke).not.toHaveBeenCalled();
  });

  it('falls back to the runtime view when the frame carries no turn id', async () => {
    activeTurnId = 'turn-from-runtime';
    await emit(capacityTip({ turn_id: undefined }));

    await waitFor(() =>
      expect(stopInvoke).toHaveBeenCalledWith({ conversation_id: 'conv-1', turn_id: 'turn-from-runtime' })
    );
  });

  it('falls back to the backend runtime when no view is hydrated', async () => {
    getConversation.mockResolvedValue({ runtime: { turn_id: 'turn-from-backend' } });
    await emit(capacityTip({ turn_id: undefined }));

    await waitFor(() =>
      expect(stopInvoke).toHaveBeenCalledWith({ conversation_id: 'conv-1', turn_id: 'turn-from-backend' })
    );
  });

  it('pauses pending commands before stopping the capacity-stalled turn', async () => {
    await emit(capacityTip());

    await waitFor(() => expect(stopInvoke).toHaveBeenCalled());
    expect(pauseQueue).toHaveBeenCalledWith('conv-1');
  });

  it('sends one continuation through ACP after stopping when the setting is enabled', async () => {
    autoContinue = true;
    await emit(capacityTip());

    await waitFor(() =>
      expect(sendContinue).toHaveBeenCalledWith({ conversation_id: 'conv-1', input: '继续', files: [] })
    );
    expect(localStarted).toHaveBeenCalledWith('conv-1');
    expect(pauseQueue).not.toHaveBeenCalled();
  });

  it('pauses instead of looping when the continuation also hits capacity', async () => {
    autoContinue = true;
    await emit(capacityTip());
    await waitFor(() => expect(sendContinue).toHaveBeenCalledTimes(1));

    await emit(capacityTip({ turn_id: 'turn-after-continue' }));

    await waitFor(() => expect(pauseQueue).toHaveBeenCalledWith('conv-1'));
    expect(sendContinue).toHaveBeenCalledTimes(1);
  });

  it('does nothing when no turn id can be resolved', async () => {
    await emit(capacityTip({ turn_id: undefined }));
    await flushAsyncWork();

    expect(stopInvoke).not.toHaveBeenCalled();
  });
});
