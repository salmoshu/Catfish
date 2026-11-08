/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { type PropsWithChildren } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MessageCursorPage } from '@/common/adapter/ipcBridge';
import type {
  IMessageAcpToolCall,
  IMessageText,
  IMessageToolCall,
  IMessageToolGroup,
  TMessage,
} from '@/common/chat/chatLib';
import type { MessageFileChangesProps } from '@/renderer/pages/conversation/Messages/MessageFileChanges';
import {
  MessageListLoadingProvider,
  MessageListProvider,
  MessagePaginationProvider,
  useUpdateMessageList,
  type MessagePaginationState,
} from '@/renderer/pages/conversation/Messages/hooks';
import MessageList from '@/renderer/pages/conversation/Messages/MessageList';

const { useTeamPermissionMock, loadHistoryMock } = vi.hoisted(() => ({
  useTeamPermissionMock: vi.fn(),
  loadHistoryMock: vi.fn(),
}));

vi.mock('@/renderer/utils/chat/messagePagination', () => ({
  DEFAULT_MESSAGE_PAGE_LIMIT: 50,
  loadConversationMessagePage: loadHistoryMock,
}));

vi.mock('@/renderer/pages/conversation/Messages/anchorRail/useConversationAnchors', () => ({
  useConversationAnchors: () => [],
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, options?: Record<string, unknown>) => {
      const template = typeof options?.defaultValue === 'string' ? options.defaultValue : _key;
      return template.replace(/\{\{(\w+)\}\}/g, (_match, name: string) =>
        name in (options ?? {}) ? String(options?.[name]) : `{{${name}}}`
      );
    },
  }),
}));

vi.mock('react-router-dom', () => ({
  useLocation: () => ({
    key: 'location-key',
    state: {},
  }),
}));

vi.mock('@arco-design/web-react', () => ({
  Button: ({ children, ...props }: PropsWithChildren<Record<string, unknown>>) => (
    <button {...props}>{children}</button>
  ),
  Image: {
    PreviewGroup: ({ children }: PropsWithChildren) => <>{children}</>,
  },
}));

vi.mock('@/renderer/hooks/context/ConversationContext', () => ({
  useConversationContextSafe: () => ({ conversation_id: 'conversation-1', type: 'aionrs' }),
}));

vi.mock('@/renderer/pages/team/hooks/TeamPermissionContext', () => ({
  useTeamPermission: useTeamPermissionMock,
}));

let mockIsProcessing = false;
vi.mock('@/renderer/pages/conversation/runtime/useConversationRuntimeView', () => ({
  useConversationRuntimeView: () => ({ isProcessing: mockIsProcessing }),
}));

vi.mock('@/renderer/pages/conversation/Messages/artifacts', () => ({
  useConversationArtifacts: () => [],
}));

vi.mock('@/renderer/pages/conversation/Messages/useAutoScroll', () => ({
  useAutoScroll: () => ({
    handleScrollerRef: () => {},
    handleContentRef: () => {},
    handleScroll: () => {},
    handleWheel: () => {},
    handlePointerDown: () => {},
    showScrollButton: false,
    scrollToBottom: () => {},
    scrollElementIntoView: () => {},
    hideScrollButton: () => {},
  }),
}));

vi.mock('@/renderer/pages/conversation/Messages/components/MessageText', () => ({
  default: ({ message, showCopyRow }: { message: IMessageText; showCopyRow?: boolean }) => (
    <div data-testid={`msgtext-${message.id}`} data-copy-row={String(showCopyRow ?? true)}>
      {message.content.content}
    </div>
  ),
  MessageTextActions: () => null,
}));

vi.mock('@/renderer/pages/conversation/Messages/components/MessageTips', () => ({
  default: () => <div>tips</div>,
}));

vi.mock('@/renderer/pages/conversation/Messages/components/MessageToolCall', () => ({
  default: () => <div>tool_call</div>,
}));

vi.mock('@/renderer/pages/conversation/Messages/components/MessageToolGroup', () => ({
  default: ({ message }: { message: IMessageToolGroup }) => (
    <div data-testid='tool-group' data-message-id={message.id}>
      tool_group
    </div>
  ),
}));

vi.mock('@/renderer/pages/conversation/Messages/components/MessageAgentStatus', () => ({
  default: () => <div>agent_status</div>,
}));

vi.mock('@/renderer/pages/conversation/Messages/components/MessagePermission', () => ({
  default: () => <div>permission</div>,
}));

vi.mock('@/renderer/pages/conversation/Messages/acp/MessageAcpPermission', () => ({
  default: () => <div>acp_permission</div>,
}));

vi.mock('@/renderer/pages/conversation/Messages/acp/MessageAcpToolCall', () => ({
  default: ({ message }: { message: IMessageAcpToolCall }) => (
    <div
      data-testid='acp-tool-call'
      data-message-id={message.id}
      data-diff-count={message.content.update.content?.filter((item) => item.type === 'diff').length ?? 0}
    >
      acp_tool_call
    </div>
  ),
}));

vi.mock('@/renderer/pages/conversation/Messages/components/MessagePlan', () => ({
  default: () => <div>plan</div>,
}));

vi.mock('@/renderer/pages/conversation/Messages/components/MessageThinking', () => ({
  default: () => <div>thinking</div>,
}));

vi.mock('@/renderer/pages/conversation/Messages/components/MessageCronTrigger', () => ({
  default: () => <div>cron_trigger</div>,
}));

vi.mock('@/renderer/pages/conversation/Messages/components/MessageSkillSuggest', () => ({
  default: () => <div>skill_suggest</div>,
}));

vi.mock('@/renderer/pages/conversation/Messages/components/MessageToolGroupSummary', () => ({
  default: ({ messages }: { messages: Array<IMessageToolGroup | IMessageAcpToolCall> }) => (
    <div data-testid='tool-summary'>{messages.map((message) => message.id).join(',')}</div>
  ),
}));

vi.mock('@/renderer/pages/conversation/Messages/MessageFileChanges', () => ({
  __esModule: true,
  default: ({ diffsChanges, variant }: MessageFileChangesProps) => (
    <div
      data-testid={variant === 'summary' ? 'file-changes-summary' : 'file-changes'}
      data-file-count={diffsChanges?.length ?? 0}
      data-insertions={diffsChanges?.reduce((total, file) => total + file.insertions, 0) ?? 0}
    >
      file_changes
      {diffsChanges?.map((file) => (
        <span key={file.fullPath}>{file.fullPath}</span>
      ))}
    </div>
  ),
}));

vi.mock('@/renderer/pages/conversation/Messages/components/SelectionReplyButton', () => ({
  default: () => null,
}));

vi.mock('@icon-park/react', () => ({
  Down: () => <span>down</span>,
  Checklist: () => <span>checklist</span>,
  Fish: () => <span data-testid='turn-work-fish-icon'>fish</span>,
  Right: () => <span>right</span>,
}));

function createTextMessage(): IMessageText {
  return {
    id: 'message-1',
    msg_id: 'msg-1',
    conversation_id: 'conversation-1',
    type: 'text',
    position: 'left',
    content: {
      content: 'streaming reply',
    },
    created_at: 1,
  };
}

type AcpToolCallOptions = {
  id?: string;
  status?: IMessageAcpToolCall['content']['update']['status'];
  content?: IMessageAcpToolCall['content']['update']['content'];
  truncated?: boolean;
};

function createAcpToolCall({
  id = 'acp-edit-1',
  status = 'completed',
  content,
  truncated = false,
}: AcpToolCallOptions = {}): IMessageAcpToolCall {
  return {
    id,
    msg_id: id,
    conversation_id: 'conversation-1',
    type: 'acp_tool_call',
    position: 'left',
    content: {
      session_id: 'session-1',
      ...(truncated
        ? {
            _compact: {
              truncated: true,
              original_size: 90000,
              preview_chars: 4096,
            },
          }
        : {}),
      update: {
        sessionUpdate: 'tool_call_update',
        tool_call_id: id,
        status,
        title: 'Edit file',
        kind: 'edit',
        content,
      },
    },
    created_at: 2,
  } as IMessageAcpToolCall;
}

function createToolGroup(content: IMessageToolGroup['content'], id = 'tool-group-1'): IMessageToolGroup {
  return {
    id,
    msg_id: id,
    conversation_id: 'conversation-1',
    type: 'tool_group',
    position: 'left',
    content,
    created_at: 2,
  };
}

function Wrapper({
  children,
  messages = [createTextMessage()],
  loading = false,
  pagination = {},
}: PropsWithChildren<{
  messages?: TMessage[];
  loading?: boolean;
  pagination?: Partial<MessagePaginationState>;
}>): JSX.Element {
  return (
    <MessageListLoadingProvider value={loading}>
      <MessagePaginationProvider
        value={{
          hasMoreBefore: false,
          hasMoreAfter: false,
          isLoadingBefore: false,
          isLoadingAnchor: false,
          ...pagination,
        }}
      >
        <MessageListProvider value={messages}>{children}</MessageListProvider>
      </MessagePaginationProvider>
    </MessageListLoadingProvider>
  );
}

function ReplaceMessagesButton({ messages }: { messages: TMessage[] }): JSX.Element {
  const updateMessages = useUpdateMessageList();
  return <button onClick={() => updateMessages(messages)}>replace messages</button>;
}

describe('MessageList', () => {
  beforeEach(() => {
    mockIsProcessing = false;
    useTeamPermissionMock.mockReturnValue(null);
    loadHistoryMock.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('adds a file summary after the final reply and keeps it outside the folded work', () => {
    const message = createAcpToolCall({
      content: [{ type: 'diff', path: '/repo/file.ts', old_text: 'old', new_text: 'new' }],
    });
    render(<MessageList />, {
      wrapper: ({ children }) => (
        <Wrapper messages={[message, { ...createTextMessage(), created_at: 3 }]}>{children}</Wrapper>
      ),
    });
    const summary = screen.getByTestId('turn-file-summary');
    expect(screen.getByTestId('file-changes-summary')).toHaveAttribute('data-file-count', '1');
    expect(summary.closest('[data-testid="turn-work-summary"]')).toBeNull();
    expect(
      screen.getByTestId('msgtext-message-1').compareDocumentPosition(summary) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it('waits until the active task ends before showing its file summary', () => {
    mockIsProcessing = true;
    const message = createAcpToolCall({
      content: [{ type: 'diff', path: '/repo/file.ts', old_text: 'old', new_text: 'new' }],
    });
    const view = render(<MessageList />, {
      wrapper: ({ children }) => <Wrapper messages={[message]}>{children}</Wrapper>,
    });
    expect(screen.getByTestId('acp-tool-call')).toBeVisible();
    expect(screen.queryByTestId('turn-file-summary')).not.toBeInTheDocument();
    mockIsProcessing = false;
    view.rerender(<MessageList />);
    expect(screen.getByTestId('turn-file-summary')).toBeVisible();
  });

  it('loads through collapsed history pages until the conversation can scroll', async () => {
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(600);
    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(function (this: HTMLElement) {
      return this.querySelector('[data-testid="msgtext-earlier-question"]') ? 900 : 160;
    });
    const messages: TMessage[] = [
      { ...createAcpToolCall(), created_at: 1000 },
      { ...createTextMessage(), created_at: 796000 },
    ];
    loadHistoryMock
      .mockResolvedValueOnce({
        items: [{ ...createAcpToolCall({ id: 'older-work' }), created_at: 500 }],
        oldest_cursor: 'page-2',
        newest_cursor: 'page-3',
        has_more_before: true,
        has_more_after: true,
      })
      .mockResolvedValueOnce({
        items: [{ ...createTextMessage(), id: 'earlier-question', msg_id: 'earlier-question', position: 'right' }],
        oldest_cursor: 'page-1',
        newest_cursor: 'page-2',
        has_more_before: true,
        has_more_after: true,
      });

    render(<MessageList />, {
      wrapper: ({ children }) => (
        <Wrapper messages={messages} pagination={{ hasMoreBefore: true, oldestCursor: 'page-3' }}>
          {children}
        </Wrapper>
      ),
    });

    expect(screen.getByTestId('turn-work-summary')).toHaveTextContent('Worked for 13m 15s');
    await waitFor(() => expect(screen.getByTestId('msgtext-earlier-question')).toBeInTheDocument());
    expect(loadHistoryMock).toHaveBeenCalledTimes(2);
    expect(loadHistoryMock).toHaveBeenNthCalledWith(1, 'conversation-1', {
      before: 'page-3',
      limit: 50,
      contentMode: 'compact',
    });
    expect(loadHistoryMock).toHaveBeenNthCalledWith(2, 'conversation-1', {
      before: 'page-2',
      limit: 50,
      contentMode: 'compact',
    });
  });

  it('loads history on an upward wheel at the top without needing a scroll event', async () => {
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(600);
    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(900);
    let resolvePage!: (page: MessageCursorPage<TMessage>) => void;
    loadHistoryMock.mockImplementation(
      () =>
        new Promise<MessageCursorPage<TMessage>>((resolve) => {
          resolvePage = resolve;
        })
    );
    render(<MessageList />, {
      wrapper: ({ children }) => (
        <Wrapper pagination={{ hasMoreBefore: true, oldestCursor: 'page-2' }}>{children}</Wrapper>
      ),
    });
    expect(loadHistoryMock).not.toHaveBeenCalled();
    const scroller = screen.getByTestId('message-list-scroller');
    fireEvent.wheel(scroller, { deltaY: -80 });
    fireEvent.wheel(scroller, { deltaY: -80 });
    expect(loadHistoryMock).toHaveBeenCalledTimes(1);
    fireEvent.scroll(scroller);
    expect(loadHistoryMock).toHaveBeenCalledTimes(1);
    await act(async () =>
      resolvePage({
        items: [],
        oldest_cursor: null,
        newest_cursor: null,
        has_more_before: false,
        has_more_after: false,
      })
    );
  });

  it('does not repeatedly retry a failed automatic history request', async () => {
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(600);
    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(160);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    loadHistoryMock.mockRejectedValue(new Error('History unavailable'));
    render(<MessageList />, {
      wrapper: ({ children }) => (
        <Wrapper pagination={{ hasMoreBefore: true, oldestCursor: 'page-2' }}>{children}</Wrapper>
      ),
    });
    await waitFor(() => expect(console.error).toHaveBeenCalledTimes(1));
    expect(loadHistoryMock).toHaveBeenCalledTimes(1);
    fireEvent.wheel(screen.getByTestId('message-list-scroller'), { deltaY: -80 });
    await waitFor(() => expect(console.error).toHaveBeenCalledTimes(2));
  });

  it('preserves the visible message position when older history is prepended', async () => {
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(600);
    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(function (this: HTMLElement) {
      return this.querySelector('[data-testid="msgtext-earlier-question"]') ? 1100 : 900;
    });
    loadHistoryMock.mockResolvedValue({
      items: [{ ...createTextMessage(), id: 'earlier-question', msg_id: 'earlier-question', position: 'right' }],
      oldest_cursor: 'page-1',
      newest_cursor: 'page-2',
      has_more_before: false,
      has_more_after: true,
    });
    render(<MessageList />, {
      wrapper: ({ children }) => (
        <Wrapper pagination={{ hasMoreBefore: true, oldestCursor: 'page-2' }}>{children}</Wrapper>
      ),
    });
    const scroller = screen.getByTestId('message-list-scroller');
    scroller.scrollTop = 120;
    fireEvent.wheel(scroller, { deltaY: -80 });
    await waitFor(() => expect(scroller.scrollTop).toBe(320));
    expect(loadHistoryMock).toHaveBeenCalledTimes(1);
  });

  it('never renders a plan as a stream row (it belongs to ConversationPlanBar)', () => {
    // A plan is a replaceable snapshot pinned above the send box, not a message.
    // Filtered rather than rendered as null: a null row still occupies a slot.
    render(
      <>
        <MessageList />
        <ReplaceMessagesButton
          messages={[
            {
              id: 'text-before',
              msg_id: 'turn-a',
              conversation_id: 'conversation-1',
              type: 'text',
              position: 'left',
              created_at: 1,
              content: { content: 'before the plan' },
            } as TMessage,
            {
              id: 'plan:turn-a',
              msg_id: 'turn-a',
              conversation_id: 'conversation-1',
              type: 'plan',
              position: 'left',
              created_at: 2,
              content: { entries: [{ content: 'PLAN_ENTRY_MARKER', status: 'pending' }] },
            } as TMessage,
            {
              id: 'text-after',
              msg_id: 'turn-b',
              conversation_id: 'conversation-1',
              type: 'text',
              position: 'left',
              created_at: 3,
              content: { content: 'after the plan' },
            } as TMessage,
          ]}
        />
      </>,
      { wrapper: ({ children }) => <Wrapper>{children}</Wrapper> }
    );

    fireEvent.click(screen.getByText('replace messages'));

    // Assert on the ROW, not on rendered entry text: this file stubs the message
    // components, so entry text would be absent either way and the test would
    // pass against the unfixed code.
    const content = screen.getByTestId('message-list-content');
    expect(content.querySelectorAll('[data-message-type="plan"]')).toHaveLength(0);
    expect(content.querySelectorAll('[data-message-type="text"]')).toHaveLength(1);
    expect(screen.getByText('after the plan')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('turn-work-summary').querySelector('button')!);
    expect(content.querySelectorAll('[data-message-type="text"]')).toHaveLength(2);
    expect(screen.getByText('before the plan')).toBeInTheDocument();
  });

  it('renders message rows with external margin spacing in the plain scroll list', () => {
    render(<MessageList />, {
      wrapper: ({ children }) => <Wrapper>{children}</Wrapper>,
    });

    expect(screen.getByTestId('message-list-scroller')).toBeInTheDocument();
    expect(screen.getByTestId('message-list-content')).toBeInTheDocument();

    const messageRow = screen.getByTestId('message-text-left');
    expect(messageRow.className).toContain('m-t-10px');
    expect(messageRow.className).not.toContain('pt-10px');
  });

  it('uses container-responsive fluid width for standalone message rows', () => {
    render(<MessageList />, {
      wrapper: ({ children }) => <Wrapper>{children}</Wrapper>,
    });

    const messageRow = screen.getByTestId('message-text-left');
    expect(messageRow.className).toContain('chat-surface-fluid');
    expect(messageRow.className).not.toContain('w-[calc(100%-24px)]');
    expect(messageRow.className).not.toContain('md:w-[calc(100%-clamp(80px,10vw,240px))]');
    expect(messageRow.className).not.toContain('max-w-780px');
  });

  it('right-aligns user messages', () => {
    const userMessage = {
      ...createTextMessage(),
      id: 'user-message',
      position: 'right',
    } as IMessageText;

    render(<MessageList />, {
      wrapper: ({ children }) => <Wrapper messages={[userMessage]}>{children}</Wrapper>,
    });

    const messageRow = screen.getByTestId('message-text-right');
    expect(messageRow.className).toContain('justify-end');
    expect(messageRow.className).not.toContain('justify-start');
  });

  it('keeps the command queue out of the scrollable message timeline', () => {
    render(<MessageList />, {
      wrapper: ({ children }) => <Wrapper>{children}</Wrapper>,
    });

    expect(screen.queryByTestId('conversation-command-queue-slot')).not.toBeInTheDocument();
  });

  it('uses the same container-responsive width in team mode', () => {
    // Team and standalone rows share one class. Width is decided by the available
    // column, not by the mode: narrow team parallel columns stay full width, while
    // wider standalone and team single columns share the same centered 720px cap.
    useTeamPermissionMock.mockReturnValue({
      isTeamMode: true,
      isLeaderAgent: true,
      leaderConversationId: 'conversation-1',
      allConversationIds: ['conversation-1'],
      propagateMode: vi.fn(),
      warmupSession: vi.fn().mockResolvedValue(undefined),
    });

    render(<MessageList />, {
      wrapper: ({ children }) => <Wrapper>{children}</Wrapper>,
    });

    const messageRow = screen.getByTestId('message-text-left');
    expect(messageRow.className).toContain('chat-surface-fluid');
    // No hardcoded viewport-based widths: the container query owns the breakpoint.
    expect(messageRow.className).not.toContain('w-[calc(100%-24px)]');
    expect(messageRow.className).not.toContain('md:w-[calc(100%-clamp(80px,10vw,240px))]');
  });

  it('collapses completed work and shows the copy row only on the final AI summary', () => {
    const messages = [
      { id: 'think-1', type: 'thinking', position: 'left', content: { content: 'thinking' }, created_at: 1000 },
      { id: 'text-a', type: 'text', position: 'left', content: { content: 'a' }, created_at: 2000 },
      { id: 'tool-1', type: 'tool_call', position: 'left', content: { content: 't' }, created_at: 3000 },
      { id: 'text-b', type: 'text', position: 'left', content: { content: 'b' }, created_at: 4000 },
      { id: 'user-1', type: 'text', position: 'right', content: { content: 'q' }, created_at: 5000 },
      { id: 'text-c', type: 'text', position: 'left', content: { content: 'c' }, created_at: 6000 },
    ] as unknown as IMessageText[];

    render(<MessageList />, {
      wrapper: ({ children }) => <Wrapper messages={messages}>{children}</Wrapper>,
    });

    const workSummary = screen.getByTestId('turn-work-summary');
    expect(workSummary).toHaveTextContent('Worked for 3s');
    expect(screen.getByTestId('turn-work-fish-icon')).toBeInTheDocument();
    expect(workSummary.querySelector('button')).toHaveClass('!text-t-secondary');
    expect(screen.queryByTestId('msgtext-text-a')).not.toBeInTheDocument();
    expect(screen.queryByTestId('tool-summary')).not.toBeInTheDocument();
    expect(screen.getByTestId('msgtext-text-b').getAttribute('data-copy-row')).toBe('true');
    expect(screen.getByTestId('msgtext-user-1').getAttribute('data-copy-row')).toBe('true');
    expect(screen.getByTestId('msgtext-text-c').getAttribute('data-copy-row')).toBe('true');

    fireEvent.click(workSummary.querySelector('button') as HTMLButtonElement);
    expect(screen.getByTestId('msgtext-text-a')).toBeInTheDocument();
    expect(screen.getByTestId('tool-summary')).toBeInTheDocument();
  });

  it('folds trailing View Steps into the work summary instead of detaching the copy row', () => {
    const messages = [
      { id: 'text-a', type: 'text', position: 'left', content: { content: 'answer' }, created_at: 1000 },
      createToolGroup([], 'tool-group-1'),
    ] as unknown as IMessageText[];

    render(<MessageList />, {
      wrapper: ({ children }) => <Wrapper messages={messages}>{children}</Wrapper>,
    });

    expect(screen.getByTestId('turn-work-summary')).toBeInTheDocument();
    expect(screen.getByTestId('msgtext-text-a').getAttribute('data-copy-row')).toBe('true');
    expect(screen.queryByTestId('turn-actions-text-a')).not.toBeInTheDocument();
    expect(screen.queryByTestId('tool-summary')).not.toBeInTheDocument();
  });

  it('withholds the streaming turn copy row but keeps earlier finished turns', () => {
    mockIsProcessing = true;
    // Turn 1 finished (text-a), then a user message, then turn 2 still streaming (text-b).
    const messages = [
      { id: 'text-a', type: 'text', position: 'left', content: { content: 'a' }, created_at: 1 },
      { id: 'user-1', type: 'text', position: 'right', content: { content: 'q' }, created_at: 2 },
      { id: 'text-b', type: 'text', position: 'left', content: { content: 'b' }, created_at: 3 },
    ] as unknown as IMessageText[];

    render(<MessageList />, {
      wrapper: ({ children }) => <Wrapper messages={messages}>{children}</Wrapper>,
    });

    // Earlier finished turn keeps its row even while a later turn streams.
    expect(screen.getByTestId('msgtext-text-a').getAttribute('data-copy-row')).toBe('true');
    // The in-progress final turn withholds its row until streaming ends.
    expect(screen.getByTestId('msgtext-text-b').getAttribute('data-copy-row')).toBe('false');
  });

  it('renders the empty slot when there are no messages', () => {
    render(<MessageList emptySlot={<div>empty state</div>} />, {
      wrapper: ({ children }) => <Wrapper messages={[]}>{children}</Wrapper>,
    });

    expect(screen.getByText('empty state')).toBeInTheDocument();
  });

  it('renders a skeleton while the initial message batch is loading', () => {
    render(<MessageList emptySlot={<div>empty state</div>} />, {
      wrapper: ({ children }) => (
        <Wrapper messages={[]} loading>
          {children}
        </Wrapper>
      ),
    });

    expect(screen.getByTestId('message-list-skeleton')).toBeInTheDocument();
    expect(screen.queryByText('empty state')).not.toBeInTheDocument();
  });

  it('renders complete ACP diffs through the specialized file-change message', () => {
    const message = createAcpToolCall({
      content: [
        { type: 'content', content: { type: 'text', text: 'updated both files' } },
        { type: 'diff', path: '/workspace/a.ts', old_text: 'old a', new_text: 'new a' },
        { type: 'diff', path: '/workspace/b.ts', old_text: 'old b', new_text: 'new b' },
      ],
    });

    render(<MessageList />, {
      wrapper: ({ children }) => <Wrapper messages={[message]}>{children}</Wrapper>,
    });

    expect(screen.getByTestId('acp-tool-call')).toHaveAttribute('data-diff-count', '2');
    expect(screen.queryByTestId('tool-summary')).not.toBeInTheDocument();
  });

  it('renders a newly created file when only new text is present', () => {
    const message = createAcpToolCall({
      content: [{ type: 'diff', path: '/workspace/new-file.ts', new_text: 'export const created = true;' }],
    });

    render(<MessageList />, {
      wrapper: ({ children }) => <Wrapper messages={[message]}>{children}</Wrapper>,
    });

    expect(screen.getByTestId('acp-tool-call')).toHaveAttribute('data-diff-count', '1');
    expect(screen.queryByTestId('tool-summary')).not.toBeInTheDocument();
  });

  it('keeps ACP calls without diffs in View Steps', () => {
    const message = createAcpToolCall({
      id: 'acp-read-1',
      content: [{ type: 'content', content: { type: 'text', text: 'file contents' } }],
    });

    render(<MessageList />, {
      wrapper: ({ children }) => <Wrapper messages={[message]}>{children}</Wrapper>,
    });

    expect(screen.getByTestId('tool-summary')).toHaveTextContent('acp-read-1');
    expect(screen.queryByTestId('acp-tool-call')).not.toBeInTheDocument();
  });

  it('keeps malformed ACP diffs in View Steps instead of showing misleading stats', () => {
    const message = createAcpToolCall({
      content: [
        { type: 'diff', path: '/workspace/valid.ts', old_text: 'old', new_text: 'new' },
        null,
        { type: 'diff', new_text: 'missing path' },
      ] as unknown as IMessageAcpToolCall['content']['update']['content'],
    });

    render(<MessageList />, {
      wrapper: ({ children }) => <Wrapper messages={[message]}>{children}</Wrapper>,
    });

    expect(screen.getByTestId('tool-summary')).toHaveTextContent(message.id);
    expect(screen.queryByTestId('acp-tool-call')).not.toBeInTheDocument();
  });

  it('keeps an ACP message without an update in View Steps', () => {
    const message = {
      ...createAcpToolCall({ id: 'acp-missing-update' }),
      content: { session_id: 'session-1' },
    } as unknown as IMessageAcpToolCall;

    render(<MessageList />, {
      wrapper: ({ children }) => <Wrapper messages={[message]}>{children}</Wrapper>,
    });

    expect(screen.getByTestId('tool-summary')).toHaveTextContent(message.id);
    expect(screen.queryByTestId('acp-tool-call')).not.toBeInTheDocument();
  });

  it('keeps truncated ACP diffs in View Steps instead of calculating stats from the preview', () => {
    const message = createAcpToolCall({
      truncated: true,
      content: [{ type: 'diff', path: '/workspace/file.ts', old_text: 'partial old', new_text: 'partial new' }],
    });

    render(<MessageList />, {
      wrapper: ({ children }) => <Wrapper messages={[message]}>{children}</Wrapper>,
    });

    expect(screen.getByTestId('tool-summary')).toHaveTextContent(message.id);
    expect(screen.queryByTestId('acp-tool-call')).not.toBeInTheDocument();
  });

  it('switches a running tool from View Steps when its completed update adds a diff', () => {
    const runningMessage = createAcpToolCall({ status: 'in_progress' });
    const completedMessage = createAcpToolCall({
      content: [{ type: 'diff', path: '/workspace/file.ts', old_text: 'old', new_text: 'new' }],
    });
    render(
      <Wrapper messages={[runningMessage]}>
        <MessageList />
        <ReplaceMessagesButton messages={[completedMessage]} />
      </Wrapper>
    );

    expect(screen.getByTestId('tool-summary')).toHaveTextContent(runningMessage.id);

    fireEvent.click(screen.getByText('replace messages'));

    expect(screen.getByTestId('acp-tool-call')).toHaveAttribute('data-message-id', completedMessage.id);
    expect(screen.queryByTestId('tool-summary')).not.toBeInTheDocument();
  });

  it('preserves surrounding tool summaries when an ACP edit contains multiple diffs', () => {
    const readMessage = createAcpToolCall({ id: 'acp-read-1' });
    const editMessage = createAcpToolCall({
      id: 'acp-edit-1',
      content: [
        { type: 'diff', path: '/workspace/a.ts', old_text: 'old a', new_text: 'new a' },
        { type: 'diff', path: '/workspace/b.ts', old_text: 'old b', new_text: 'new b' },
      ],
    });
    const executeMessage = createAcpToolCall({ id: 'acp-execute-1' });

    render(<MessageList />, {
      wrapper: ({ children }) => <Wrapper messages={[readMessage, editMessage, executeMessage]}>{children}</Wrapper>,
    });

    expect(screen.getByTestId('acp-tool-call')).toHaveAttribute('data-diff-count', '2');
    expect(screen.getAllByTestId('tool-summary')).toHaveLength(2);
    expect(screen.getAllByTestId('tool-summary').map((item) => item.textContent)).toEqual([
      'acp-read-1',
      'acp-execute-1',
    ]);
  });

  it('preserves the legacy single WriteFile summary path', () => {
    const message = createToolGroup([
      {
        call_id: 'write-1',
        description: 'Write file',
        name: 'WriteFile',
        render_output_as_markdown: false,
        result_display: {
          file_diff: 'diff --git a/file.ts b/file.ts\n-old\n+new',
          file_name: '/workspace/file.ts',
        },
        status: 'Success',
      },
    ]);

    render(<MessageList />, {
      wrapper: ({ children }) => <Wrapper messages={[message]}>{children}</Wrapper>,
    });

    expect(screen.getByTestId('file-changes')).toHaveAttribute('data-file-count', '1');
    expect(screen.getByTestId('file-changes')).toHaveTextContent('/workspace/file.ts');
    expect(screen.getByTestId('file-changes')).toHaveAttribute('data-insertions', '1');
    expect(screen.queryByTestId('tool-summary')).not.toBeInTheDocument();
  });

  it('aggregates legacy groups containing only structured WriteFile results', () => {
    const message = createToolGroup([
      {
        call_id: 'write-1',
        description: 'Write file',
        name: 'WriteFile',
        render_output_as_markdown: false,
        result_display: {
          file_diff: 'diff --git a/file.ts b/file.ts\n-old\n+new',
          file_name: '/workspace/file.ts',
        },
        status: 'Success',
      },
      {
        call_id: 'write-2',
        description: 'Write second file',
        name: 'WriteFile',
        render_output_as_markdown: false,
        result_display: {
          file_diff: 'diff --git a/second.ts b/second.ts\n-old\n+new',
          file_name: '/workspace/second.ts',
        },
        status: 'Success',
      },
    ]);

    render(<MessageList />, {
      wrapper: ({ children }) => <Wrapper messages={[message]}>{children}</Wrapper>,
    });

    expect(screen.getByTestId('file-changes')).toHaveAttribute('data-file-count', '2');
    expect(screen.getByTestId('file-changes')).toHaveTextContent('/workspace/file.ts');
    expect(screen.getByTestId('file-changes')).toHaveTextContent('/workspace/second.ts');
    expect(screen.queryByTestId('tool-summary')).not.toBeInTheDocument();
  });

  it('shows each file in a multi-file WriteFile patch', () => {
    const message = createToolGroup([
      {
        call_id: 'write-multiple',
        description: 'Write files',
        name: 'WriteFile',
        render_output_as_markdown: false,
        result_display: {
          file_diff: 'diff --git a/a.ts b/a.ts\n+one\ndiff --git a/b.ts b/b.ts\n+two\n+three\n',
          file_name: 'a.ts',
        },
        status: 'Success',
      },
    ]);
    render(<MessageList />, {
      wrapper: ({ children }) => <Wrapper messages={[message]}>{children}</Wrapper>,
    });
    expect(screen.getByTestId('file-changes')).toHaveAttribute('data-file-count', '2');
    expect(screen.getByTestId('file-changes')).toHaveAttribute('data-insertions', '3');
    expect(screen.getByTestId('file-changes')).toHaveTextContent('b.ts');
  });

  it.each(['Error', 'Canceled', 'Executing', 'Pending', 'Confirming'] as const)(
    'retains the tool state instead of displaying %s writes as successful edits',
    (status) => {
      const message = createToolGroup([
        {
          call_id: 'write-unfinished',
          description: 'Write file',
          name: 'WriteFile',
          render_output_as_markdown: false,
          result_display: { file_diff: 'diff --git a/a.ts b/a.ts\n+one\n', file_name: 'a.ts' },
          status,
        },
      ]);
      render(<MessageList />, {
        wrapper: ({ children }) => <Wrapper messages={[message]}>{children}</Wrapper>,
      });
      expect(screen.getByTestId('tool-summary')).toHaveTextContent(message.id);
      expect(screen.queryByTestId('file-changes')).not.toBeInTheDocument();
      expect(screen.queryByTestId('turn-file-summary')).not.toBeInTheDocument();
    }
  );

  it('shows paths and line counts for legacy write_file operations as well as the final summary', () => {
    const message: IMessageToolCall = {
      id: 'write-file',
      msg_id: 'write-file',
      conversation_id: 'conversation-1',
      type: 'tool_call',
      position: 'left',
      content: {
        call_id: 'write-file',
        name: 'write_file',
        args: { path: '/workspace/new.ts', content: 'one\ntwo\n' },
        status: 'completed',
      },
    };
    render(<MessageList />, {
      wrapper: ({ children }) => <Wrapper messages={[message]}>{children}</Wrapper>,
    });
    expect(screen.getByTestId('file-changes')).toHaveTextContent('/workspace/new.ts');
    expect(screen.getByTestId('file-changes')).toHaveAttribute('data-insertions', '2');
    expect(screen.getByTestId('file-changes-summary')).toHaveAttribute('data-insertions', '2');
  });

  it('keeps mixed legacy tool groups in View Steps without dropping non-file tools', () => {
    const message = createToolGroup([
      {
        call_id: 'write-1',
        description: 'Write file',
        name: 'WriteFile',
        render_output_as_markdown: false,
        result_display: {
          file_diff: 'diff --git a/file.ts b/file.ts\n-old\n+new',
          file_name: '/workspace/file.ts',
        },
        status: 'Success',
      },
      {
        call_id: 'read-1',
        description: 'Read file',
        name: 'ReadFile',
        render_output_as_markdown: false,
        result_display: 'done',
        status: 'Success',
      },
    ]);

    render(<MessageList />, {
      wrapper: ({ children }) => <Wrapper messages={[message]}>{children}</Wrapper>,
    });

    expect(screen.getByTestId('tool-summary')).toHaveTextContent(message.id);
    expect(screen.getByTestId('file-changes')).toHaveAttribute('data-file-count', '1');
    expect(screen.queryByTestId('tool-group')).not.toBeInTheDocument();
  });
});
