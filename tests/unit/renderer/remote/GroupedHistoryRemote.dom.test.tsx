import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TChatConversation } from '@/common/config/storage';
import WorkspaceGroupedHistory from '@/renderer/pages/conversation/GroupedHistory';

const mocks = vi.hoisted(() => ({
  history: vi.fn(),
  actions: vi.fn(),
  selection: vi.fn(),
  drag: vi.fn(),
  archiveProject: vi.fn(),
  navigate: vi.fn(),
}));

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('react-router-dom', () => ({
  useParams: () => ({}),
  useNavigate: () => mocks.navigate,
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
}));
vi.mock('@/renderer/pages/conversation/GroupedHistory/SortableConversationRow', () => ({ default: () => null }));
vi.mock('@/renderer/components/remote/EnvironmentProjects', () => ({ default: () => null }));
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

beforeEach(() => {
  vi.clearAllMocks();
  window.__backendEnvironment = { type: 'remote', id: 'wsl-1', name: 'Ubuntu-20.04', kind: 'wsl' };
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
    renameModalVisible: false,
    renameModalName: '',
    setRenameModalName: vi.fn(),
    renameLoading: false,
    dropdownVisibleId: null,
    handleConversationClick: vi.fn(),
    handleArchive: vi.fn(),
    handleBatchArchive: vi.fn(),
    handleEditStart: vi.fn(),
    handleRenameConfirm: vi.fn(),
    handleRenameCancel: vi.fn(),
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
  it('uses the globe, standard conversation row, and local project archive action', async () => {
    render(<WorkspaceGroupedHistory />);

    const icon = screen.getByRole('img', { name: 'RemoteProject' });
    expect(icon.querySelector('[data-kimi-icon="globe"]')).toBeInTheDocument();
    expect(icon.parentElement?.querySelectorAll('svg')).toHaveLength(1);
    expect(screen.getByTestId('standard-conversation-row')).toHaveTextContent('remote-chat');
    expect(screen.queryByRole('img', { name: /Ubuntu/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/Ubuntu/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Project actions'));
    fireEvent.click(await screen.findByText('conversation.history.archiveProject'));
    expect(mocks.archiveProject).toHaveBeenCalledWith('RemoteProject', [conversation]);
  });
});
