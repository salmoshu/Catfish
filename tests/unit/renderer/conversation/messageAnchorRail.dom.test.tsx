import React from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import MessageAnchorRail from '@/renderer/pages/conversation/Messages/anchorRail/MessageAnchorRail';

const { jumpMock, searchMock } = vi.hoisted(() => ({
  jumpMock: vi.fn(),
  searchMock: vi.fn(),
}));

vi.mock('@/renderer/utils/chat/chatMinimapEvents', () => ({
  dispatchChatMessageJump: jumpMock,
  dispatchChatSearchPanelOpen: searchMock,
}));

vi.mock('@/renderer/hooks/context/ConversationContext', () => ({
  useConversationContextSafe: () => ({ conversation_id: 'conversation-1' }),
}));

vi.mock('@/renderer/pages/conversation/Messages/hooks', () => ({
  useMessageList: () => [],
}));

vi.mock('@/renderer/pages/conversation/Messages/anchorRail/useConversationAnchors', () => ({
  useConversationAnchors: () => [
    { index: 1, question: 'First user question', answer: '', messageId: 'message-1', msgId: 'msg-1' },
    { index: 2, question: 'Second user question', answer: '', messageId: 'message-2', msgId: 'msg-2' },
  ],
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

describe('MessageAnchorRail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders vertical marks and expandable question labels', () => {
    render(<MessageAnchorRail />);

    expect(screen.getAllByTestId('message-anchor-tick-mark')).toHaveLength(2);
    expect(screen.getByText('First user question')).toBeInTheDocument();
    expect(screen.getByText('Second user question')).toBeInTheDocument();

    const firstTick = screen.getAllByTestId('message-anchor-tick')[0];
    fireEvent.focus(firstTick);
    expect(firstTick).toHaveAttribute('aria-current', 'location');
    expect(firstTick).toHaveAttribute('data-anchor-active', 'true');
  });

  it('jumps to a turn and keeps the search action available', () => {
    render(<MessageAnchorRail />);

    fireEvent.click(screen.getAllByTestId('message-anchor-tick')[0]);
    expect(jumpMock).toHaveBeenCalledWith({
      conversation_id: 'conversation-1',
      messageId: 'message-1',
      msgId: 'msg-1',
      align: 'start',
      behavior: 'smooth',
    });

    fireEvent.click(screen.getByTestId('message-anchor-rail-search'));
    expect(searchMock).toHaveBeenCalledWith({ conversation_id: 'conversation-1' });
  });

  it('hides before the collapsed rail can overlap the centered 720px message column', () => {
    const stylesheet = readFileSync(
      join(
        __dirname,
        '../../../../packages/desktop/src/renderer/pages/conversation/Messages/anchorRail/MessageAnchorRail.module.css'
      ),
      'utf8'
    );
    expect(stylesheet).toContain('@container (min-width: 816px)');
  });
});
