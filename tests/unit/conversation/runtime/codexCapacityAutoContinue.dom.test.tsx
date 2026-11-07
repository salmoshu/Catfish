/**
 * @vitest-environment jsdom
 */

/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { act, render, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IConversationTurnCompletedEvent, IResponseMessage } from '@/common/adapter/ipcBridge';

let registered: ((message: IResponseMessage) => void) | null = null;
let completed: ((event: IConversationTurnCompletedEvent) => void) | null = null;
const stopInvoke = vi.fn();
const sendContinue = vi.fn();
const getConversation = vi.fn();
const pauseQueue = vi.fn();
const resumeQueue = vi.fn();
const localStarted = vi.fn();
const localAccepted = vi.fn();
const localFailed = vi.fn();
const statusEmit = vi.fn();
let autoContinue = true;

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
      turnCompleted: {
        on: (callback: (event: IConversationTurnCompletedEvent) => void) => {
          completed = callback;
          return () => {
            completed = null;
          };
        },
      },
      stop: { invoke: (params: unknown) => stopInvoke(params) },
    },
    acpConversation: {
      sendMessage: { invoke: (params: unknown) => sendContinue(params) },
    },
  },
}));

vi.mock('@/common/config/configService', () => ({
  configService: { get: () => autoContinue },
}));

vi.mock('@/renderer/utils/emitter', () => ({
  emitter: { emit: (event: string, message: IResponseMessage) => statusEmit(event, message) },
}));

vi.mock('@/renderer/pages/conversation/utils/conversationCache', () => ({
  getConversationOrNull: () => getConversation(),
}));

vi.mock('@/renderer/pages/conversation/runtime/conversationRuntimeViewStore', () => ({
  localSendStarted: (conversationId: string) => localStarted(conversationId),
  localSendAccepted: (conversationId: string, turnId: string, runtime: unknown, msgId: string) =>
    localAccepted(conversationId, turnId, runtime, msgId),
  localSendFailed: (conversationId: string, failure: unknown) => localFailed(conversationId, failure),
}));

vi.mock('@/renderer/pages/conversation/platforms/useConversationCommandQueue', () => ({
  pauseConversationCommandQueue: (conversationId: string) => pauseQueue(conversationId),
  resumeConversationCommandQueue: (conversationId: string) => resumeQueue(conversationId),
}));

const { useCodexCapacityAutoContinue } =
  await import('@/renderer/pages/conversation/runtime/useCodexCapacityAutoContinue');

const Host: React.FC = () => {
  useCodexCapacityAutoContinue();
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

const capacityError = (turnId = 'turn-1'): IResponseMessage => ({
  type: 'error',
  conversation_id: 'conv-1',
  msg_id: `error-${++messageSeq}`,
  turn_id: turnId,
  data: {
    message: 'Reconnecting... 5/5',
    detail: 'Selected model is at capacity. Please try a different model.',
  },
});

const runtime = (turnId: string | null, isProcessing = false) => ({
  state: turnId ? 'running' : 'idle',
  can_send_message: !turnId && !isProcessing,
  has_task: Boolean(turnId),
  is_processing: isProcessing,
  pending_confirmations: 0,
  turn_id: turnId,
});

const emit = async (message: IResponseMessage): Promise<void> => {
  await act(async () => {
    registered?.(message);
  });
};

const emitCompleted = async (turnId = 'turn-1'): Promise<void> => {
  await act(async () => {
    completed?.({ session_id: 'conv-1', turn_id: turnId } as IConversationTurnCompletedEvent);
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
  completed = null;
  messageSeq = 0;
  autoContinue = true;
  getConversation.mockResolvedValue({ runtime: runtime(null) });
  sendContinue.mockResolvedValue({
    msg_id: 'msg-continue',
    turn_id: 'turn-continue',
    runtime: runtime('turn-continue', true),
  });
  render(<Host />);
  await waitFor(() => {
    expect(registered).not.toBeNull();
    expect(completed).not.toBeNull();
  });
});

describe('useCodexCapacityAutoContinue', () => {
  it('leaves an in-turn capacity retry running without cancelling or pausing queued commands', async () => {
    autoContinue = false;
    await emit({
      type: 'acp_tool_call',
      conversation_id: 'conv-1',
      msg_id: 'tool-1',
      turn_id: 'turn-1',
      data: { update: { tool_call_id: 'tool-1', status: 'in_progress' } },
    });
    await emit(capacityTip());
    await emit(capacityTip());
    await flushAsyncWork();

    expect(stopInvoke).not.toHaveBeenCalled();
    expect(sendContinue).not.toHaveBeenCalled();
    expect(pauseQueue).not.toHaveBeenCalled();
  });

  it('continues only after the terminal turn has actually been released', async () => {
    getConversation.mockResolvedValueOnce({ runtime: runtime('turn-1', true) });
    await emit(capacityError());
    await emitCompleted();
    await flushAsyncWork();

    expect(sendContinue).not.toHaveBeenCalled();
    expect(stopInvoke).not.toHaveBeenCalled();
    expect(pauseQueue).toHaveBeenCalledWith('conv-1');

    await emitCompleted();
    await waitFor(() =>
      expect(sendContinue).toHaveBeenCalledWith({ conversation_id: 'conv-1', input: '继续', files: [] })
    );
    expect(localStarted).toHaveBeenCalledWith('conv-1');
    expect(localAccepted).toHaveBeenCalled();
    expect(resumeQueue).toHaveBeenCalledWith('conv-1');
    expect(statusEmit).toHaveBeenCalledWith(
      'codex.capacity.recovery',
      expect.objectContaining({
        conversation_id: 'conv-1',
        turn_id: 'turn-1',
        data: expect.objectContaining({ code: 'CODEX_CAPACITY_CONTINUED', type: 'success' }),
      })
    );
  });

  it('waits for a completion event instead of sending from the error frame', async () => {
    await emit(capacityError());
    await flushAsyncWork();

    expect(getConversation).not.toHaveBeenCalled();
    expect(sendContinue).not.toHaveBeenCalled();
  });

  it('pauses without continuing when the setting is disabled', async () => {
    autoContinue = false;
    await emit(capacityError());
    await emitCompleted();
    await flushAsyncWork();

    expect(pauseQueue).toHaveBeenCalledWith('conv-1');
    expect(getConversation).not.toHaveBeenCalled();
    expect(sendContinue).not.toHaveBeenCalled();
    expect(resumeQueue).not.toHaveBeenCalled();
  });

  it('continues each new terminal capacity failure until the task completes', async () => {
    await emit(capacityError('turn-1'));
    await emitCompleted('turn-1');
    await waitFor(() => expect(sendContinue).toHaveBeenCalledTimes(1));

    await emit(capacityError('turn-2'));
    await emitCompleted('turn-2');
    await waitFor(() => expect(sendContinue).toHaveBeenCalledTimes(2));
  });

  it('continues retry exhaustion when an older Core omits terminal capacity details', async () => {
    await emit(capacityTip());
    await emit({ ...capacityError(), data: { message: 'Reconnecting... 5/5' } });
    await emitCompleted();

    await waitFor(() => expect(sendContinue).toHaveBeenCalledTimes(1));
  });

  it('does not continue a generic terminal after a newer non-capacity retry', async () => {
    await emit(capacityTip());
    await emit({
      ...capacityTip(),
      data: { type: 'warning', code: 'CODEX_RETRYING', content: 'Reconnecting... 2/5 — Network disconnected' },
    });
    await emit({ ...capacityError(), data: { message: 'Reconnecting... 5/5' } });
    await emitCompleted();
    await flushAsyncWork();

    expect(sendContinue).not.toHaveBeenCalled();
    expect(pauseQueue).not.toHaveBeenCalled();
  });

  it('deduplicates repeated terminal and completion frames for the same turn', async () => {
    await emit(capacityError());
    await emit(capacityError());
    await emitCompleted();
    await emitCompleted();
    await waitFor(() => expect(sendContinue).toHaveBeenCalledTimes(1));
  });

  it('drops a stale continuation when another turn is already running', async () => {
    getConversation.mockResolvedValue({ runtime: runtime('turn-manual', true) });
    await emit(capacityError('turn-old'));
    await emitCompleted('turn-old');
    await waitFor(() => expect(getConversation).toHaveBeenCalled());

    expect(sendContinue).not.toHaveBeenCalled();
    expect(resumeQueue).toHaveBeenCalledWith('conv-1');
  });

  it('ignores unrelated errors and unrelated completion events', async () => {
    await emit({
      ...capacityError(),
      data: { message: 'The provider disconnected', detail: 'network unreachable' },
    });
    await emitCompleted();
    await flushAsyncWork();

    expect(pauseQueue).not.toHaveBeenCalled();
    expect(getConversation).not.toHaveBeenCalled();
    expect(sendContinue).not.toHaveBeenCalled();
  });

  it('keeps the queue paused when the continuation cannot be sent', async () => {
    sendContinue.mockRejectedValueOnce(new Error('send failed'));
    await emit(capacityError());
    await emitCompleted();

    await waitFor(() => expect(localFailed).toHaveBeenCalled());
    expect(sendContinue).toHaveBeenCalledTimes(1);
    expect(resumeQueue).not.toHaveBeenCalled();
    expect(pauseQueue).toHaveBeenCalledWith('conv-1');
    expect(statusEmit).toHaveBeenCalledWith(
      'codex.capacity.recovery',
      expect.objectContaining({
        data: expect.objectContaining({ code: 'CODEX_CAPACITY_CONTINUE_FAILED', type: 'warning' }),
      })
    );
  });
});
