/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { Outlet } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IConversationTurnCompletedEvent, IResponseMessage } from '@/common/adapter/ipcBridge';
import type { TMessage } from '@/common/chat/chatLib';
import PanelRoute from '@/renderer/components/layout/Router';

const bridge = vi.hoisted(() => ({
  responses: new Set<(message: IResponseMessage) => void>(),
  completions: new Set<(event: IConversationTurnCompletedEvent) => void>(),
  sendMessage: vi.fn(),
  getMessages: vi.fn(),
  getConversation: vi.fn(),
  restartRuntime: vi.fn(),
  emitResponse: vi.fn(),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    conversation: {
      responseStream: {
        on: (listener: (message: IResponseMessage) => void) => {
          bridge.responses.add(listener);
          return () => bridge.responses.delete(listener);
        },
        emit: bridge.emitResponse,
      },
      restartRuntime: { invoke: bridge.restartRuntime },
      turnCompleted: {
        on: (listener: (event: IConversationTurnCompletedEvent) => void) => {
          bridge.completions.add(listener);
          return () => bridge.completions.delete(listener);
        },
      },
    },
    acpConversation: { sendMessage: { invoke: bridge.sendMessage } },
    database: { getConversationMessages: { invoke: bridge.getMessages } },
  },
}));

vi.mock('@/common/config/configService', () => ({ configService: { get: () => true } }));
vi.mock('@/renderer/hooks/context/AuthContext', () => ({
  useAuth: () => ({ status: 'authenticated', user: { id: 'user-1' } }),
}));
vi.mock('@/renderer/hooks/system/useCrossSessionRateLimitNotice', () => ({
  useCrossSessionRateLimitNotice: () => undefined,
}));
vi.mock('@/renderer/pages/conversation/utils/conversationCache', () => ({
  getConversationOrNull: bridge.getConversation,
}));
vi.mock('@/renderer/pages/conversation/platforms/useConversationCommandQueue', () => ({
  pauseConversationCommandQueue: vi.fn(),
  resumeConversationCommandQueue: vi.fn(),
}));
vi.mock('@/renderer/utils/emitter', () => ({ emitter: { emit: vi.fn() } }));
vi.mock('@/renderer/components/layout/DocumentTitle', () => ({ default: () => null }));
vi.mock('@/renderer/components/layout/AppLoader', () => ({ default: () => null }));
vi.mock('@/renderer/pages/conversation', () => ({ default: () => <div>Conversation page</div> }));
vi.mock('@/renderer/pages/guid', () => ({ default: () => <div>New conversation page</div> }));

const idleRuntime: IConversationTurnCompletedEvent['runtime'] = {
  state: 'idle',
  can_send_message: true,
  has_task: true,
  task_status: 'finished',
  is_processing: false,
  pending_confirmations: 0,
  turn_id: null,
  supports_midturn_delivery: false,
};

const completed = (
  turnId: string,
  state: IConversationTurnCompletedEvent['state'] = 'ai_waiting_input'
): IConversationTurnCompletedEvent => ({
  session_id: 'conv-1',
  turn_id: turnId,
  status: 'finished',
  state,
  detail: '',
  can_send_message: true,
  runtime: idleRuntime,
  workspace: '',
  model: { platform: 'kimi', name: 'Kimi', use_model: '' },
  last_message: { type: 'tips', content: '', created_at: 1 },
});

const emptyTip = (turnId: string, code = 'ACP_EMPTY_TURN_NEEDS_AUTH'): IResponseMessage => ({
  type: 'tips',
  conversation_id: 'conv-1',
  turn_id: turnId,
  msg_id: `tip-${turnId}`,
  data: { type: 'info', code, content: '', params: { hint: 'Open the device-code login flow in a terminal.' } },
});

const emitEmptyTurn = async (
  turnId: string,
  code = 'ACP_EMPTY_TURN_NEEDS_AUTH',
  state: IConversationTurnCompletedEvent['state'] = 'ai_waiting_input'
): Promise<void> => {
  await act(async () => {
    bridge.responses.forEach((listener) => listener(emptyTip(turnId, code)));
    bridge.completions.forEach((listener) => listener(completed(turnId, state)));
  });
};

beforeEach(() => {
  vi.clearAllMocks();
  bridge.responses.clear();
  bridge.completions.clear();
  window.location.hash = '#/conversation/conv-1';
  bridge.getConversation.mockResolvedValue({ runtime: idleRuntime, extra: { backend: 'kimi' } });
  let messageId = 0;
  bridge.getMessages.mockImplementation(async () => ({
    items: [
      {
        id: `user-${++messageId}`,
        type: 'text',
        position: 'right',
        conversation_id: 'conv-1',
        content: { content: 'Investigate why the camera measurement cannot connect.' },
      } satisfies TMessage,
    ],
  }));
  bridge.sendMessage.mockResolvedValue({ turn_id: 'retry-turn', msg_id: 'retry-user', runtime: idleRuntime });
  bridge.restartRuntime.mockResolvedValue({ recovered: true, config_options: [], runtime: idleRuntime });
});

afterEach(cleanup);

describe('ACP empty turns in the application router', () => {
  it.each(['ACP_EMPTY_TURN', 'ACP_EMPTY_TURN_TOKEN_LIMIT'])(
    'leaves %s as a diagnostic without restarting or resubmitting',
    async (code) => {
      render(<PanelRoute layout={<Outlet />} />);
      await screen.findByText('Conversation page');

      await emitEmptyTurn('turn-1', code);

      expect(bridge.restartRuntime).not.toHaveBeenCalled();
      expect(bridge.sendMessage).not.toHaveBeenCalled();
    }
  );

  it('restarts an idle runtime once and reports recovery without resubmitting the instruction', async () => {
    render(<PanelRoute layout={<Outlet />} />);
    await screen.findByText('Conversation page');

    await emitEmptyTurn('turn-1');

    await waitFor(() => expect(bridge.restartRuntime).toHaveBeenCalledWith({ conversation_id: 'conv-1' }));
    expect(bridge.emitResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        conversation_id: 'conv-1',
        data: expect.objectContaining({ code: 'ACP_RUNTIME_RECOVERED', type: 'success' }),
      })
    );
    expect(bridge.sendMessage).not.toHaveBeenCalled();
    expect(bridge.getMessages).not.toHaveBeenCalled();
  });

  it('does not restart or resubmit twice when completion events repeat', async () => {
    render(<PanelRoute layout={<Outlet />} />);
    await screen.findByText('Conversation page');

    await emitEmptyTurn('turn-1');
    await waitFor(() => expect(bridge.restartRuntime).toHaveBeenCalledTimes(1));
    await act(async () => {
      bridge.completions.forEach((listener) => listener(completed('turn-1')));
      bridge.completions.forEach((listener) => listener(completed('turn-1')));
    });

    expect(bridge.restartRuntime).toHaveBeenCalledTimes(1);
    expect(bridge.sendMessage).not.toHaveBeenCalled();
  });

  it('waits for background work to finish before restarting the runtime', async () => {
    bridge.getConversation.mockResolvedValueOnce({
      runtime: { ...idleRuntime, state: 'running', turn_id: 'turn-busy', is_processing: true, can_send_message: false },
    });
    render(<PanelRoute layout={<Outlet />} />);
    await screen.findByText('Conversation page');

    await emitEmptyTurn('turn-busy');
    expect(bridge.restartRuntime).not.toHaveBeenCalled();

    await act(async () => {
      bridge.completions.forEach((listener) => listener(completed('turn-busy')));
    });
    await waitFor(() => expect(bridge.restartRuntime).toHaveBeenCalledTimes(1));
  });

  it('does not reopen a stopped turn after an empty-reply diagnostic', async () => {
    render(<PanelRoute layout={<Outlet />} />);
    await screen.findByText('Conversation page');

    await emitEmptyTurn('turn-stopped', 'ACP_EMPTY_TURN_NEEDS_AUTH', 'stopped');

    expect(bridge.restartRuntime).not.toHaveBeenCalled();
    expect(bridge.sendMessage).not.toHaveBeenCalled();
  });

  it('reports a failed restart without resending the original instruction', async () => {
    bridge.restartRuntime.mockRejectedValueOnce(new Error('restart failed'));
    render(<PanelRoute layout={<Outlet />} />);
    await screen.findByText('Conversation page');

    await emitEmptyTurn('turn-failed');

    await waitFor(() =>
      expect(bridge.emitResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ code: 'ACP_RUNTIME_RECOVERY_FAILED', type: 'warning' }),
        })
      )
    );
    expect(bridge.sendMessage).not.toHaveBeenCalled();
  });

  it('recovers a background conversation without resending while the user is on another page', async () => {
    window.location.hash = '#/guid';
    render(<PanelRoute layout={<Outlet />} />);
    await screen.findByText('New conversation page');

    await emitEmptyTurn('turn-background');

    await waitFor(() => expect(bridge.restartRuntime).toHaveBeenCalledTimes(1));
    expect(bridge.sendMessage).not.toHaveBeenCalled();
  });
});
