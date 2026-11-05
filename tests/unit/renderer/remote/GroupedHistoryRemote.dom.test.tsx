import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TChatConversation } from '@/common/config/storage';
import WorkspaceGroupedHistory from '@/renderer/pages/conversation/GroupedHistory';
import { WORKSPACE_EXPANSION_STORAGE_KEY } from '@/renderer/pages/conversation/GroupedHistory/hooks/useWorkspaceExpansionState';

const mocks = vi.hoisted(() => ({
  history: vi.fn(),
  actions: vi.fn(),
  selection: vi.fn(),
  drag: vi.fn(),
  archiveProject: vi.fn(),
  navigate: vi.fn(),
  local: vi.fn(),
  list: vi.fn(),
  connect: vi.fn(),
  activate: vi.fn(),
  progressOn: vi.fn(() => () => {}),
  disconnectedOn: vi.fn(() => () => {}),
}));

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('react-router-dom', () => ({
  useParams: () => ({}),
  useNavigate: () => mocks.navigate,
}));
vi.mock('@/common', () => ({
  ipcBridge: {
    remoteEnvironment: {
      localConversations: { invoke: mocks.local },
      list: { invoke: mocks.list },
      connect: { invoke: mocks.connect },
      activate: { invoke: mocks.activate },
      progress: { on: mocks.progressOn },
      disconnected: { on: mocks.disconnectedOn },
    },
  },
}));
vi.mock('@icon-park/react', async (original) => ({
  ...(await original<typeof import('@icon-park/react')>()),
  FolderClose: () => <svg data-testid='folder-close' />,
  FolderOpen: () => <svg data-testid='folder-open' />,
}));
vi.mock('@/renderer/hooks/context/LayoutContext', () => ({
  useLayoutContext: () => ({ isMobile: false }),
}));
vi.mock('@/renderer/pages/cron', () => ({
  useCronJobsMap: () => ({ getJobStatus: () => 'none', markAsRead: vi.fn(), setActiveConversation: vi.fn() }),
}));
vi.mock('@/renderer/pages/conversation/GroupedHistory/hooks/useConversations', () => ({
  useConversations: () => mocks.history(),
}));
vi.mock('@/renderer/pages/conversation/GroupedHistory/hooks/useConversationActions', () => ({
  useConversationActions: () => mocks.actions(),
}));
vi.mock('@/renderer/pages/conversation/GroupedHistory/hooks/useBatchSelection', () => ({
  useBatchSelection: () => mocks.selection(),
}));
vi.mock('@/renderer/pages/conversation/GroupedHistory/hooks/useDragAndDrop', () => ({
  useDragAndDrop: () => mocks.drag(),
}));
vi.mock('@/renderer/pages/conversation/GroupedHistory/ConversationRow', () => ({
  default: ({ conversation }: { conversation: TChatConversation }) => (
    <div data-testid='standard-conversation-row'>{conversation.name}</div>
  ),
  ConversationIdentityIcon: ({ conversation }: { conversation: TChatConversation }) => (
    <svg data-testid='cached-agent-icon' data-backend={(conversation.extra as { backend?: string }).backend} />
  ),
}));
vi.mock('@/renderer/pages/conversation/GroupedHistory/SortableConversationRow', () => ({ default: () => null }));
vi.mock('@/renderer/components/base/AionModal', () => ({ default: () => null }));

const workspace = '/home/user/RemoteProject';
const conversation = {
  id: 'remote-chat',
  name: 'remote-chat',
  type: 'acp',
  created_at: 1,
  modified_at: 2,
  extra: { backend: 'kimi', workspace, custom_workspace: true },
} as TChatConversation;
const secondConversation = {
  ...conversation,
  id: 'remote-chat-2',
  name: 'remote-chat-2',
} as TChatConversation;
const localConversation = {
  ...conversation,
  id: 'local-chat',
  name: 'local-chat',
  extra: { ...conversation.extra, workspace: 'E:/LocalProject' },
} as TChatConversation;

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  window.__backendEnvironment = { type: 'remote', id: 'wsl-1', name: 'Ubuntu-20.04', kind: 'wsl' };
  mocks.local.mockResolvedValue([]);
  mocks.list.mockResolvedValue([]);
  mocks.history.mockReturnValue({
    conversations: [conversation],
    isConversationGenerating: () => false,
    isConversationWaitingConfirmation: () => false,
    hasCompletionUnread: () => false,
    isManualUnread: () => false,
    markManualUnread: vi.fn(),
    clearManualUnread: vi.fn(),
    expandedWorkspaces: [workspace],
    pinnedConversations: [],
    timelineSections: [
      {
        timeline: 'Recent',
        items: [
          {
            type: 'workspace',
            time: 1,
            workspaceGroup: { workspace, display_name: 'RemoteProject', conversations: [conversation] },
          },
        ],
      },
    ],
    handleToggleWorkspace: vi.fn(),
    collapsedSections: new Set<string>(),
    toggleSection: vi.fn(),
  });
  mocks.actions.mockReturnValue({
    dropdownVisibleId: null,
    handleConversationClick: vi.fn(),
    handleArchive: vi.fn(),
    handleBatchArchive: vi.fn(),
    handleTogglePin: vi.fn(),
    handleMenuVisibleChange: vi.fn(),
    handleOpenMenu: vi.fn(),
    handleToggleManualUnread: vi.fn(),
    handleCreateCronTask: vi.fn(),
    handleArchiveProject: mocks.archiveProject,
    archiveProjectTarget: null,
    archiveProjectLoading: false,
    handleArchiveProjectCancel: vi.fn(),
    handleArchiveProjectConfirm: vi.fn(),
  });
  mocks.selection.mockReturnValue({
    selectedConversationIds: new Set<string>(),
    setSelectedConversationIds: vi.fn(),
    selectedCount: 0,
    allSelected: false,
    toggleSelectedConversation: vi.fn(),
    handleToggleSelectAll: vi.fn(),
  });
  mocks.drag.mockReturnValue({ sensors: [], handleDragEnd: vi.fn(), isDragEnabled: false });
});

afterEach(() => {
  cleanup();
  delete window.__backendEnvironment;
});

describe('active remote grouped history', () => {
  it('expands and collapses every project conversation from the Projects header', () => {
    render(<WorkspaceGroupedHistory />);

    fireEvent.click(screen.getByRole('button', { name: 'conversation.history.collapseAllProjects' }));
    expect(JSON.parse(localStorage.getItem(WORKSPACE_EXPANSION_STORAGE_KEY) ?? '[]')).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: 'conversation.history.expandAllProjects' }));
    expect(JSON.parse(localStorage.getItem(WORKSPACE_EXPANSION_STORAGE_KEY) ?? '[]')).toContain(
      'remote:wsl-1:/home/user/RemoteProject'
    );
  });

  it('uses active project actions without offering offline reconnect', async () => {
    render(<WorkspaceGroupedHistory />);

    const icon = screen.getByRole('img', { name: 'RemoteProject' });
    expect(icon.querySelector('[data-kimi-icon="globe"]')).toBeInTheDocument();
    expect(icon.parentElement?.querySelectorAll('svg')).toHaveLength(1);
    expect(screen.getByTestId('standard-conversation-row')).toHaveTextContent('remote-chat');
    expect(screen.queryByRole('img', { name: /Ubuntu/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/Ubuntu/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'conversation.history.newConversationInProject' })).toHaveClass(
      'hidden',
      'group-hover:flex'
    );
    expect(screen.getByLabelText('Project actions')).toHaveClass('hidden', 'group-hover:flex');
    expect(screen.queryByRole('button', { name: 'mcp.connect' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Project actions'));
    fireEvent.click(await screen.findByText('conversation.history.archiveProject'));
    expect(mocks.archiveProject).toHaveBeenCalledWith('RemoteProject', [conversation]);
  });

  it('aligns cached local headers with active remote project groups', async () => {
    mocks.local.mockResolvedValue([localConversation]);
    render(<WorkspaceGroupedHistory />);

    const localHeader = await screen.findByText('LocalProject');
    const remoteHeader = screen.getByText('RemoteProject');
    expect(localHeader.className).toBe(remoteHeader.className);
    expect(screen.getByTestId('folder-close')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'conversation.history.newConversationInProject' })).toHaveLength(2);
    expect(screen.queryByRole('button', { name: 'mcp.connect' })).not.toBeInTheDocument();

    fireEvent.click(localHeader);
    expect(screen.getByTestId('folder-open')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'local-chat' })).toBeInTheDocument();
    expect(localHeader.closest('.workspace-collapse')?.querySelector('.sticky')).toHaveStyle({ top: '28px' });
  });

  it('shows a spinner for a collapsed project when a non-first child is generating', () => {
    const history = mocks.history();
    const item = history.timelineSections[0].items[0];
    mocks.history.mockReturnValue({
      ...history,
      conversations: [conversation, secondConversation],
      isConversationGenerating: (id: string) => id === secondConversation.id,
      expandedWorkspaces: [],
      timelineSections: [
        {
          ...history.timelineSections[0],
          items: [
            {
              ...item,
              workspaceGroup: { ...item.workspaceGroup, conversations: [conversation, secondConversation] },
            },
          ],
        },
      ],
    });

    const { container } = render(<WorkspaceGroupedHistory />);

    expect(container.querySelector('.workspace-collapse .arco-spin')).not.toBeNull();
    expect(screen.getByTestId('active-project-running')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'RemoteProject' })).toBeInTheDocument();
  });

  it('keeps the remote globe instead of a spinner while the project is expanded', () => {
    const history = mocks.history();
    const item = history.timelineSections[0].items[0];
    mocks.history.mockReturnValue({
      ...history,
      conversations: [conversation, secondConversation],
      isConversationGenerating: (id: string) => id === secondConversation.id,
      expandedWorkspaces: [workspace],
      timelineSections: [
        {
          ...history.timelineSections[0],
          items: [
            {
              ...item,
              workspaceGroup: { ...item.workspaceGroup, conversations: [conversation, secondConversation] },
            },
          ],
        },
      ],
    });

    const { container } = render(<WorkspaceGroupedHistory />);

    expect(container.querySelector('.workspace-collapse .arco-spin')).toBeNull();
    expect(screen.getByRole('img', { name: 'RemoteProject' }).querySelector('[data-kimi-icon="globe"]')).not.toBeNull();
  });
});
