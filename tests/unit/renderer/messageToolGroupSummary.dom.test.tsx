import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ipcBridge } from '@/common';
import type { TMessage } from '@/common/chat/chatLib';
import type { ToolMessage } from '@/common/chat/normalizeToolCall';
import MessageToolGroupSummary from '@/renderer/pages/conversation/Messages/components/MessageToolGroupSummary';

const fileChangesMock = vi.hoisted(() => vi.fn());
vi.mock('@/renderer/pages/conversation/Messages/MessageFileChanges', () => ({
  default: (props: unknown) => {
    fileChangesMock(props);
    return <div data-testid='inline-file-changes' />;
  },
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    database: {
      getConversationMessage: {
        invoke: vi.fn(),
      },
    },
  },
}));

describe('MessageToolGroupSummary', () => {
  it('stops the steps spinner and running badge after the turn ends', () => {
    const message = {
      id: 'message-running',
      conversation_id: 'conversation-1',
      type: 'tool_group',
      content: [{ call_id: 'call-1', name: 'ReadFile', status: 'Executing', description: 'Reading' }],
    } as unknown as ToolMessage;
    const { container, rerender } = render(<MessageToolGroupSummary messages={[message]} />);

    expect(screen.getByTestId('tool-group-running')).toBeInTheDocument();
    rerender(<MessageToolGroupSummary messages={[message]} isProcessing={false} />);

    expect(screen.queryByTestId('tool-group-running')).not.toBeInTheDocument();
    expect(container.querySelector('.badge-breathing')).toBeNull();
    expect(screen.getByRole('button', { name: /View Steps/ })).toHaveAttribute('aria-expanded', 'false');
    expect(container.querySelector('.tool-group-summary__body')).toBeNull();
  });

  it('loads full tool content when expanding a compact history item', async () => {
    const invoke = vi.mocked(ipcBridge.database.getConversationMessage.invoke);
    invoke.mockResolvedValue({
      id: 'message-1',
      conversation_id: 'conversation-1',
      type: 'acp_tool_call',
      content: {
        update: {
          session_update: 'tool_call',
          tool_call_id: 'tool-1',
          status: 'completed',
          title: 'rg',
          kind: 'search',
          raw_input: { pattern: 'needle', path: '.' },
          content: [{ type: 'content', content: { type: 'text', text: 'full output' } }],
        },
      },
    } as unknown as TMessage);

    render(
      <MessageToolGroupSummary
        messages={[
          {
            id: 'message-1',
            conversation_id: 'conversation-1',
            type: 'acp_tool_call',
            content: {
              _compact: {
                truncated: true,
                original_size: 90000,
                preview_chars: 4096,
              },
              update: {
                session_update: 'tool_call',
                tool_call_id: 'tool-1',
                status: 'completed',
                title: 'rg',
                kind: 'search',
                raw_input: { pattern: 'needle', path: '.' },
                content: [{ type: 'content', content: { type: 'text', text: 'preview' } }],
              },
            },
          } as unknown as ToolMessage,
        ]}
      />
    );

    fireEvent.click(screen.getByText('View Steps · {{count}}'));
    fireEvent.click(screen.getByText('rg'));

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith({
        conversation_id: 'conversation-1',
        message_id: 'message-1',
      });
    });
    expect(await screen.findByText('full output')).toBeInTheDocument();
  });

  it('renders a real file change from a mixed text-and-diff tool result', () => {
    const message = {
      id: 'message-edit',
      conversation_id: 'conversation-1',
      type: 'acp_tool_call',
      content: {
        update: {
          tool_call_id: 'tool-edit',
          status: 'completed',
          title: 'Edit file',
          kind: 'edit',
          raw_input: { file_path: '/workspace/app.ts' },
          content: [
            { type: 'content', content: { type: 'text', text: 'Edited successfully' } },
            { type: 'diff', path: '/workspace/app.ts', old_text: 'before', new_text: 'after' },
          ],
        },
      },
    } as unknown as ToolMessage;
    render(<MessageToolGroupSummary messages={[message]} isProcessing={false} />);

    fireEvent.click(screen.getByText('View Steps · {{count}}'));
    fireEvent.click(screen.getByText('Edit file'));

    expect(fileChangesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        diffsChanges: [
          expect.objectContaining({ fullPath: '/workspace/app.ts', diff: expect.stringContaining('after') }),
        ],
      })
    );
  });
});
