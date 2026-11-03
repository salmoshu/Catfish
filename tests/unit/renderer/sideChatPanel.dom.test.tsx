import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SideChatPanel from '@/renderer/pages/conversation/Preview/components/PreviewPanel/SideChatPanel';

const mocks = vi.hoisted(() => ({ create: vi.fn(), remove: vi.fn() }));
vi.mock('@/common', () => ({
  ipcBridge: {
    conversation: {
      create: { invoke: mocks.create },
      remove: { invoke: mocks.remove },
    },
  },
}));
vi.mock('@/renderer/pages/guid/hooks/useGuidAssistantSelection', () => ({
  useGuidAssistantSelection: () => ({
    selectedAssistant: { id: 'assistant-1', name: 'Kimi' },
    selectedAssistantId: 'assistant-1',
    selectedAssistantBackend: 'kimi',
  }),
}));
vi.mock('@/renderer/pages/conversation/platforms/acp/AcpChat', () => ({
  default: ({ conversation_id }: { conversation_id: string }) => (
    <div data-testid='side-chat-conversation'>{conversation_id}</div>
  ),
}));

describe('SideChatPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.create.mockResolvedValue({ id: 'temporary-chat', extra: { side_chat: true, is_temporary_workspace: true } });
    mocks.remove.mockResolvedValue(true);
  });

  it('creates a temporary conversation and deletes it when the tab unmounts', async () => {
    const { unmount } = render(<SideChatPanel workspace='/repo' />);
    expect(await screen.findByTestId('side-chat-conversation')).toHaveTextContent('temporary-chat');
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        assistant: { id: 'assistant-1' },
        extra: expect.objectContaining({ side_chat: true, is_temporary_workspace: true, workspace: '/repo' }),
      })
    );

    unmount();
    await waitFor(() => expect(mocks.remove).toHaveBeenCalledWith({ id: 'temporary-chat' }));
  });
});
