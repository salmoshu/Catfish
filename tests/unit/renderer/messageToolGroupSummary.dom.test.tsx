import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ipcBridge } from '@/common';
import type { IMessageToolCall, IMessageToolGroup, TMessage } from '@/common/chat/chatLib';
import type { ToolMessage } from '@/common/chat/normalizeToolCall';
import MessageToolGroupSummary from '@/renderer/pages/conversation/Messages/components/MessageToolGroupSummary';
import MessageToolCall from '@/renderer/pages/conversation/Messages/components/MessageToolCall';
import StructuredContent from '@/renderer/components/chat/StructuredContent';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import zhMessages from '@/renderer/services/i18n/locales/zh-CN/messages.json';

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
  it('uses the same expandable step for native edits while retaining their real diff', () => {
    const message = {
      id: 'native-edit',
      type: 'tool_call',
      content: {
        call_id: 'native-edit',
        name: 'Edit',
        status: 'completed',
        args: {
          file_path: '/workspace/native.ts',
          old_string: 'before',
          new_string: 'after',
        },
      },
    } as unknown as IMessageToolCall;
    render(<MessageToolCall message={message} isProcessing={false} />);
    expect(screen.getByText('native.ts')).toBeVisible();
    expect(screen.queryByTestId('inline-file-changes')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Edit file/ }));
    expect(fileChangesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        diffsChanges: [
          expect.objectContaining({ fullPath: '/workspace/native.ts', diff: expect.stringContaining('+after') }),
        ],
      })
    );
  });

  it('shows a localized purpose before exposing command details', async () => {
    const i18n = createInstance();
    await i18n.init({ lng: 'zh-CN', resources: { 'zh-CN': { translation: { messages: zhMessages } } } });
    const message = {
      id: 'localized-command',
      type: 'acp_tool_call',
      content: {
        update: {
          tool_call_id: 'localized-command',
          kind: 'execute',
          title: 'Shell',
          status: 'completed',
          raw_input: {
            command: 'bun run test --workers=1',
            description: '单线程复测滑块双击交互',
            workdir: 'C:\\workspace',
          },
        },
      },
    } as unknown as ToolMessage;
    render(
      <I18nextProvider i18n={i18n}>
        <MessageToolGroupSummary messages={[message]} variant='step' isProcessing={false} />
      </I18nextProvider>
    );

    expect(screen.getByText('运行命令')).toBeVisible();
    expect(screen.getByText('单线程复测滑块双击交互')).toBeVisible();
    expect(screen.queryByText('bun run test --workers=1')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /运行命令/ }));
    expect(screen.getByText('bun run test --workers=1')).toBeVisible();
    expect(screen.getByText('工作目录')).toBeVisible();
  });

  it('localizes known structured fields and preserves unfamiliar fields and data', async () => {
    const i18n = createInstance();
    await i18n.init({ lng: 'zh-CN', resources: { 'zh-CN': { translation: { messages: zhMessages } } } });
    render(
      <I18nextProvider i18n={i18n}>
        <StructuredContent value={{ file_path: 'C:\\workspace\\app.ts', vendor_option: 'kept' }} />
      </I18nextProvider>
    );
    expect(screen.getByText('文件路径')).toBeVisible();
    expect(screen.getByText('C:\\workspace\\app.ts')).toBeVisible();
    expect(screen.getByText('Vendor option')).toBeVisible();
    expect(screen.getByText('kept')).toBeVisible();
  });

  it('reports failure to retrieve a compact tool detail', async () => {
    vi.mocked(ipcBridge.database.getConversationMessage.invoke).mockRejectedValueOnce(new Error('unavailable'));
    const message = {
      id: 'compact-failed',
      conversation_id: 'conversation-1',
      type: 'acp_tool_call',
      content: {
        _compact: { truncated: true },
        update: { tool_call_id: 'compact-failed', kind: 'read', title: 'ReadFile', status: 'completed' },
      },
    } as unknown as ToolMessage;
    render(<MessageToolGroupSummary messages={[message]} variant='step' isProcessing={false} />);
    fireEvent.click(screen.getByRole('button', { name: /Read file/ }));
    expect(await screen.findByText('Failed to load full output')).toBeVisible();
  });

  it.each([
    ['Error', 'Failed'],
    ['Canceled', 'Canceled'],
    ['Executing', 'Incomplete'],
    ['Pending', 'Incomplete'],
  ])('preserves %s instead of showing success after the turn ends', (status, label) => {
    const message = {
      id: 'message-ended',
      conversation_id: 'conversation-1',
      type: 'tool_group',
      content: [{ call_id: 'call-ended', name: 'ReadFile', status, description: 'Read project settings' }],
    } as unknown as ToolMessage;
    render(<MessageToolGroupSummary messages={[message]} isProcessing={false} />);

    fireEvent.click(screen.getByRole('button', { name: /View Steps/ }));

    expect(screen.getByLabelText(label)).toBeVisible();
    expect(screen.queryByLabelText('Completed')).not.toBeInTheDocument();
  });

  it('keeps finished steps visible between tool calls during an active turn', () => {
    const message = {
      id: 'message-active',
      conversation_id: 'conversation-1',
      type: 'tool_group',
      content: [{ call_id: 'call-active', name: 'ReadFile', status: 'Executing', description: 'Read settings' }],
    } as unknown as IMessageToolGroup;
    const { rerender } = render(<MessageToolGroupSummary messages={[message]} />);

    rerender(
      <MessageToolGroupSummary
        messages={[{ ...message, content: [{ ...message.content[0], status: 'Success' }] } as ToolMessage]}
      />
    );

    expect(screen.getByRole('button', { name: /View Steps/ })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Read settings')).toBeVisible();
  });

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
        isProcessing={false}
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
    fireEvent.click(screen.getByText('Search'));

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
