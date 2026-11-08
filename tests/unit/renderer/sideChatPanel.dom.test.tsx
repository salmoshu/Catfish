import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SideChatPanel from '@/renderer/pages/conversation/Preview/components/PreviewPanel/SideChatPanel';

const mocks = vi.hoisted(() => ({ create: vi.fn(), remove: vi.fn(), getSource: vi.fn() }));
vi.mock('@/common', () => ({
  ipcBridge: {
    conversation: {
      create: { invoke: mocks.create },
      remove: { invoke: mocks.remove },
    },
  },
}));
vi.mock('@/renderer/pages/guid/hooks/useGuidAssistantSelection', () => ({
  useGuidAssistantSelection: ({ preselectAssistantId }: { preselectAssistantId?: string }) => {
    const [id, setId] = React.useState('assistant-1');
    React.useLayoutEffect(() => {
      if (preselectAssistantId) setId(preselectAssistantId);
    }, [preselectAssistantId]);
    return {
      selectedAssistant: { id, name: 'Kimi' },
      selectedAssistantId: id,
      selectedAssistantBackend: 'kimi',
      assistants: [{ id: 'assistant-1' }, { id: 'source-assistant' }],
    };
  },
}));
vi.mock('@/renderer/pages/conversation/utils/conversationCache', () => ({ getConversationOrNull: mocks.getSource }));
vi.mock('@/renderer/components/agent/AcpModelSelector', () => ({
  default: ({ initialModelId, initialThoughtLevel }: { initialModelId?: string; initialThoughtLevel?: string }) => (
    <div data-testid='side-chat-model' data-model={initialModelId} data-thought={initialThoughtLevel} />
  ),
}));
vi.mock('@/renderer/pages/conversation/platforms/acp/AcpChat', () => ({
  default: ({ conversation_id, composerTools }: { conversation_id: string; composerTools: React.ReactNode }) => (
    <div data-testid='side-chat-conversation'>
      {conversation_id}
      {composerTools}
    </div>
  ),
}));

describe('SideChatPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.create.mockImplementation(async ({ extra }: { extra: Record<string, unknown> }) => ({
      id: 'temporary-chat',
      extra,
    }));
    mocks.remove.mockResolvedValue(true);
    mocks.getSource.mockResolvedValue(null);
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

  it('shows a creation failure and allows retrying in the same panel', async () => {
    mocks.create.mockRejectedValueOnce(new Error('Agent unavailable'));
    render(<SideChatPanel workspace='/repo' />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Agent unavailable');
    fireEvent.click(screen.getByRole('button', { name: 'common.retry' }));
    expect(await screen.findByTestId('side-chat-conversation')).toHaveTextContent('temporary-chat');
    expect(mocks.create).toHaveBeenCalledTimes(2);
  });

  it('waits for the main chat and inherits its assistant, model and thought level', async () => {
    let resolveSource!: (value: unknown) => void;
    mocks.getSource.mockReturnValue(
      new Promise((resolve) => {
        resolveSource = resolve;
      })
    );
    render(<SideChatPanel workspace='/repo' sourceConversationId='main-chat' />);
    expect(mocks.create).not.toHaveBeenCalled();
    await act(async () =>
      resolveSource({
        assistant: { id: 'source-assistant' },
        extra: { current_model_id: 'source-model', thought_level: 'high' },
      })
    );
    await screen.findByTestId('side-chat-conversation');
    expect(mocks.create).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        assistant: { id: 'source-assistant' },
        extra: expect.objectContaining({ current_model_id: 'source-model', thought_level: 'high' }),
      })
    );
    expect(screen.getByTestId('side-chat-model')).toHaveAttribute('data-model', 'source-model');
    expect(screen.getByTestId('side-chat-model')).toHaveAttribute('data-thought', 'high');
  });

  it('keeps an existing side chat when another main conversation is selected', async () => {
    const { rerender } = render(<SideChatPanel workspace='/repo' sourceConversationId='first-main' />);
    await screen.findByTestId('side-chat-conversation');
    rerender(<SideChatPanel workspace='/repo' sourceConversationId='second-main' />);
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(mocks.remove).not.toHaveBeenCalled();
    expect(mocks.getSource).toHaveBeenCalledExactlyOnceWith('first-main');
  });

  it('uses the default assistant if the main conversation cannot be loaded', async () => {
    mocks.getSource.mockRejectedValue(new Error('Conversation unavailable'));
    render(<SideChatPanel workspace='/repo' sourceConversationId='missing-main' />);
    await screen.findByTestId('side-chat-conversation');
    expect(mocks.create).toHaveBeenCalledTimes(1);
  });
});
