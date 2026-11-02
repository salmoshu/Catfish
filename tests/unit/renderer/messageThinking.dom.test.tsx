/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IMessageThinking } from '@/common/chat/chatLib';
import MessageThinking from '@/renderer/pages/conversation/Messages/components/MessageThinking';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? _key,
  }),
}));

function createThinkingMessage(createdAt: number): IMessageThinking {
  return {
    id: 'thinking-1',
    type: 'thinking',
    msg_id: 'msg-1',
    conversation_id: 'conversation-1',
    position: 'left',
    created_at: createdAt,
    content: {
      content: 'analyzing',
      status: 'thinking',
    },
  };
}

describe('MessageThinking', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('preserves elapsed time when the component remounts for an active thinking message', () => {
    vi.setSystemTime(new Date('2026-05-26T09:00:10.000Z'));
    const createdAt = Date.now() - 5_000;

    const { unmount } = render(<MessageThinking message={createThinkingMessage(createdAt)} />);

    expect(screen.getByText('Thinking... · 5s')).toBeInTheDocument();

    unmount();

    vi.setSystemTime(new Date('2026-05-26T09:00:12.000Z'));
    render(<MessageThinking message={createThinkingMessage(createdAt)} />);

    expect(screen.getByText('Thinking... · 7s')).toBeInTheDocument();
  });

  it('shows the final duration without a spinner after active thinking becomes done', () => {
    vi.setSystemTime(new Date('2026-05-26T09:00:10.000Z'));
    const activeMessage = createThinkingMessage(Date.now() - 5_000);
    const { container, rerender } = render(<MessageThinking message={activeMessage} />);

    expect(screen.getByText('Thinking... · 5s')).toBeInTheDocument();

    rerender(
      <MessageThinking
        message={{
          ...activeMessage,
          content: {
            ...activeMessage.content,
            status: 'done',
            duration: 5_000,
          },
        }}
      />
    );

    expect(screen.getByText('Thought complete · 5s')).toBeInTheDocument();
    expect(container.querySelector('.arco-spin')).toBeNull();

    vi.advanceTimersByTime(10_000);

    expect(screen.getByText('Thought complete · 5s')).toBeInTheDocument();
    expect(screen.queryByText(/^Thinking\.\.\./)).not.toBeInTheDocument();
  });

  it('stops a persisted thinking spinner when the conversation is no longer processing', () => {
    vi.setSystemTime(new Date('2026-05-26T09:00:10.000Z'));
    const { container, rerender } = render(<MessageThinking message={createThinkingMessage(Date.now())} />);

    rerender(<MessageThinking message={createThinkingMessage(Date.now())} isProcessing={false} />);

    expect(screen.getByText('Thought complete · 0s')).toBeInTheDocument();
    expect(container.querySelector('.arco-spin')).toBeNull();
    vi.advanceTimersByTime(10_000);
    expect(screen.getByText('Thought complete · 0s')).toBeInTheDocument();
  });
});
