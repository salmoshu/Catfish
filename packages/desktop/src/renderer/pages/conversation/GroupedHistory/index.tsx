/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TChatConversation } from '@/common/config/storage';
import AionModal from '@/renderer/components/base/AionModal';
import KimiIcon from '@/renderer/components/base/KimiIcon';
import { useLayoutContext } from '@/renderer/hooks/context/LayoutContext';
import { useCronJobsMap } from '@/renderer/pages/cron';
import { restrictToVerticalAxis } from '@/renderer/utils/ui/dndModifiers';
import { DndContext, closestCenter } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Button, Dropdown, Empty, Menu, Spin, Tooltip } from '@arco-design/web-react';
import { FolderClose, MoreOne, Plus, Right } from '@icon-park/react';
import classNames from 'classnames';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';

import WorkspaceCollapse from '../components/WorkspaceCollapse';
import EnvironmentProjects from '@/renderer/components/remote/EnvironmentProjects';
import ConversationRow from './ConversationRow';
import SortableConversationRow from './SortableConversationRow';
import { useBatchSelection } from './hooks/useBatchSelection';
import { useConversationActions } from './hooks/useConversationActions';
import { useConversations } from './hooks/useConversations';
import { useDragAndDrop } from './hooks/useDragAndDrop';
import type { ConversationRowProps, WorkspaceGroupedHistoryProps } from './types';
import {
  ENVIRONMENT_PROJECTS_CHANGED,
  environmentProjectKey,
  readEnvironmentProjects,
} from '@/renderer/utils/workspace/environmentProjects';
import { buildProjectOrder } from '@/renderer/utils/workspace/projectOrder';
import { getBackendEnvironment } from '@/common/adapter/httpBridge';

const WorkspaceGroupedHistory: React.FC<WorkspaceGroupedHistoryProps> = ({
  onSessionClick,
  collapsed = false,
  tooltipEnabled = false,
  batchMode = false,
  onBatchModeChange,
  afterPinnedContent,
}) => {
  const { id } = useParams();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const layout = useLayoutContext();
  const isMobile = layout?.isMobile ?? false;
  const { getJobStatus, markAsRead, setActiveConversation } = useCronJobsMap();
  const [environmentHistory, setEnvironmentHistory] = useState(readEnvironmentProjects);
  useEffect(() => {
    const refresh = () => setEnvironmentHistory(readEnvironmentProjects());
    window.addEventListener(ENVIRONMENT_PROJECTS_CHANGED, refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener(ENVIRONMENT_PROJECTS_CHANGED, refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);

  const {
    conversations,
    conversationActivityAt = new Map<string, number>(),
    isConversationGenerating,
    isConversationWaitingConfirmation,
    hasCompletionUnread,
    isManualUnread,
    markManualUnread,
    clearManualUnread,
    expandedWorkspaces,
    pinnedConversations,
    timelineSections,
    handleToggleWorkspace,
    collapsedSections,
    toggleSection,
  } = useConversations();

  const SectionLabel = useCallback(
    ({ sectionKey, label, trailing }: { sectionKey: string; label: string; trailing?: React.ReactNode }) => {
      const isCollapsed = collapsedSections.has(sectionKey);
      return (
        <div
          className='group/label sider-section-label flex items-center px-12px h-28px select-none sticky top-0 z-10 mt-8px cursor-pointer'
          onClick={() => toggleSection(sectionKey)}
        >
          <span className='text-14px text-t-tertiary sider-section-title group-hover/label:text-t-primary transition-colors font-[500] leading-none'>
            {label}
          </span>
          <span className='ms-2px flex items-center justify-center opacity-0 group-hover/label:opacity-100 transition-opacity text-t-tertiary shrink-0'>
            <Right
              theme='outline'
              size={12}
              className={classNames('transition-transform duration-150', { 'rotate-90': !isCollapsed })}
            />
          </span>
          {trailing && (
            <div className='ms-auto' onClick={(e) => e.stopPropagation()}>
              {trailing}
            </div>
          )}
        </div>
      );
    },
    [collapsedSections, toggleSection]
  );

  // Sync active conversation ref when route changes (for URL navigation)
  // This doesn't trigger state update, avoiding double render
  useEffect(() => {
    if (id) {
      setActiveConversation(id);
    }
  }, [id, setActiveConversation]);

  const {
    selectedConversationIds,
    setSelectedConversationIds,
    selectedCount,
    allSelected,
    toggleSelectedConversation,
    handleToggleSelectAll,
  } = useBatchSelection(batchMode, conversations);

  const {
    dropdownVisibleId,
    handleConversationClick,
    handleArchive,
    handleBatchArchive,
    handleTogglePin,
    handleMenuVisibleChange,
    handleOpenMenu,
    handleToggleManualUnread,
    handleCreateCronTask,
    handleArchiveProject,
    archiveProjectTarget,
    archiveProjectLoading,
    handleArchiveProjectCancel,
    handleArchiveProjectConfirm,
  } = useConversationActions({
    batchMode,
    onSessionClick,
    onBatchModeChange,
    selectedConversationIds,
    setSelectedConversationIds,
    toggleSelectedConversation,
    markAsRead,
    markManualUnread,
    clearManualUnread,
    isManualUnread,
  });

  const { sensors, handleDragEnd, isDragEnabled } = useDragAndDrop({
    pinnedConversations,
    batchMode,
    collapsed,
  });

  // Fork-lineage badge support: resolve a parent conversation's display name
  // from the already-loaded sidebar list (no extra fetch; unresolved = the
  // parent was deleted or not loaded → the badge falls back to a generic tip).
  const conversationNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const conversation of conversations) {
      map.set(conversation.id, conversation.name);
    }
    return map;
  }, [conversations]);
  const resolveConversationName = useCallback(
    (conversationId: string) => conversationNameById.get(conversationId),
    [conversationNameById]
  );

  const getConversationRowProps = useCallback(
    (conversation: TChatConversation): ConversationRowProps => ({
      conversation,
      isGenerating: isConversationGenerating(conversation.id),
      isWaitingConfirmation: isConversationWaitingConfirmation(conversation.id),
      hasUnread: hasCompletionUnread(conversation.id) || isManualUnread(conversation.id),
      isManualUnread: isManualUnread(conversation.id),
      collapsed,
      tooltipEnabled,
      batchMode,
      checked: selectedConversationIds.has(conversation.id),
      selected: id === conversation.id,
      menuVisible: dropdownVisibleId !== null && dropdownVisibleId === conversation.id,
      onToggleChecked: toggleSelectedConversation,
      onConversationClick: handleConversationClick,
      onOpenMenu: handleOpenMenu,
      onMenuVisibleChange: handleMenuVisibleChange,
      onCreateCronTask: handleCreateCronTask,
      onArchive: handleArchive,
      onTogglePin: handleTogglePin,
      onToggleManualUnread: handleToggleManualUnread,
      getJobStatus,
      resolveConversationName,
    }),
    [
      collapsed,
      tooltipEnabled,
      batchMode,
      isConversationGenerating,
      isConversationWaitingConfirmation,
      hasCompletionUnread,
      isManualUnread,
      selectedConversationIds,
      id,
      dropdownVisibleId,
      toggleSelectedConversation,
      handleConversationClick,
      handleOpenMenu,
      handleMenuVisibleChange,
      handleCreateCronTask,
      handleArchive,
      handleTogglePin,
      handleToggleManualUnread,
      getJobStatus,
      resolveConversationName,
    ]
  );

  const renderConversation = (conversation: TChatConversation, dimIcon = false) => {
    const rowProps = getConversationRowProps(conversation);
    return <ConversationRow key={conversation.id} {...rowProps} dimIcon={dimIcon} />;
  };

  // Collect all sortable IDs for the pinned section
  const pinnedIds = useMemo(() => pinnedConversations.map((c) => c.id), [pinnedConversations]);

  // Codex-style split: project folders (workspaces) on top, free conversations below.
  // Projects section: collect all workspace groups across timeline sections, ordered by recency.
  const projectGroups = useMemo(() => {
    const seen = new Set<string>();
    const groups: Array<{ workspace: string; displayName: string; conversations: TChatConversation[] }> = [];
    for (const section of timelineSections) {
      for (const item of section.items) {
        if (item.type === 'workspace' && item.workspaceGroup && !seen.has(item.workspaceGroup.workspace)) {
          seen.add(item.workspaceGroup.workspace);
          groups.push({
            workspace: item.workspaceGroup.workspace,
            displayName: item.workspaceGroup.display_name,
            conversations: item.workspaceGroup.conversations,
          });
        }
      }
    }
    return groups;
  }, [timelineSections]);

  const projectOrder = useMemo(() => {
    const environment = getBackendEnvironment() ?? { type: 'local' as const };
    return buildProjectOrder(
      environmentHistory,
      projectGroups.map((group) => ({
        environment,
        workspace: group.workspace,
        conversationIds: group.conversations.map((conversation) => conversation.id),
      })),
      conversationActivityAt
    );
  }, [conversationActivityAt, environmentHistory, projectGroups]);

  // Conversations section: keep timeline grouping (today/yesterday/...) but only show non-workspace conversations.
  const conversationOnlySections = useMemo(
    () =>
      timelineSections
        .map((section) => ({
          ...section,
          items: section.items.filter((item) => item.type === 'conversation' && item.conversation),
        }))
        .filter((section) => section.items.length > 0),
    [timelineSections]
  );

  if (timelineSections.length === 0 && pinnedConversations.length === 0) {
    return (
      <>
        {afterPinnedContent}
        <EnvironmentProjects
          collapsed={collapsed}
          heading={
            !collapsed && <SectionLabel sectionKey='projects' label={t('conversation.history.projectsSection')} />
          }
          hidden={collapsedSections.has('projects')}
          emptyContent={
            <div className='py-48px flex-center'>
              <Empty description={t('conversation.history.noHistory')} />
            </div>
          }
        />
      </>
    );
  }

  return (
    <>
      {batchMode && !collapsed && (
        <div className='px-12px pb-8px pt-2px sticky top-0 z-20 bg-[var(--bg-2)]'>
          <div className='rd-8px bg-fill-1 p-10px flex flex-col gap-8px border border-solid border-[rgba(var(--primary-6),0.08)]'>
            <div className='text-12px leading-18px text-t-secondary'>
              {t('conversation.history.selectedCount', { count: selectedCount })}
            </div>
            <div className='grid grid-cols-2 gap-6px'>
              <Button
                className='!w-full !justify-center !min-w-0 !h-30px !px-8px !text-12px whitespace-nowrap'
                size='mini'
                type='secondary'
                onClick={handleToggleSelectAll}
              >
                {allSelected ? t('common.cancel') : t('conversation.history.selectAll')}
              </Button>
              <Button
                className='!w-full !justify-center !min-w-0 !h-30px !px-8px !text-12px whitespace-nowrap'
                size='mini'
                type='primary'
                onClick={handleBatchArchive}
              >
                {t('conversation.history.batchArchive')}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 归档项目确认弹窗 — 使用项目自家 AionModal + 圆角线框按钮（归档为非危险态，用主色） */}
      <AionModal
        visible={archiveProjectTarget !== null}
        style={{ width: '400px' }}
        header={{
          title: t('conversation.history.archiveProjectTitle'),
          showClose: true,
          style: { borderBottom: 'none' },
        }}
        onCancel={handleArchiveProjectCancel}
        footer={
          <div className='flex justify-end gap-12px pt-16px'>
            <button
              type='button'
              className='px-24px py-8px rounded-20px text-14px font-medium transition-all'
              style={{
                border: '1px solid var(--color-border-2)',
                backgroundColor: 'var(--color-fill-2)',
                color: 'var(--color-text-1)',
                cursor: archiveProjectLoading ? 'not-allowed' : 'pointer',
                opacity: archiveProjectLoading ? 0.55 : 1,
              }}
              onMouseEnter={(event) => {
                if (!archiveProjectLoading) event.currentTarget.style.backgroundColor = 'var(--color-fill-3)';
              }}
              onMouseLeave={(event) => {
                if (!archiveProjectLoading) event.currentTarget.style.backgroundColor = 'var(--color-fill-2)';
              }}
              onClick={handleArchiveProjectCancel}
              disabled={archiveProjectLoading}
            >
              {t('common.cancel')}
            </button>
            <button
              type='button'
              className='px-24px py-8px rounded-20px text-14px font-medium transition-all'
              style={{
                border: '1px solid rgb(var(--primary-6))',
                backgroundColor: 'transparent',
                color: 'rgb(var(--primary-6))',
                cursor: archiveProjectLoading ? 'not-allowed' : 'pointer',
                opacity: archiveProjectLoading ? 0.55 : 1,
              }}
              onMouseEnter={(event) => {
                if (!archiveProjectLoading) {
                  event.currentTarget.style.backgroundColor = 'rgba(var(--primary-6), 0.08)';
                }
              }}
              onMouseLeave={(event) => {
                if (!archiveProjectLoading) event.currentTarget.style.backgroundColor = 'transparent';
              }}
              onClick={() => void handleArchiveProjectConfirm()}
              disabled={archiveProjectLoading}
            >
              {archiveProjectLoading ? t('conversation.history.archiving') : t('conversation.history.archiveProject')}
            </button>
          </div>
        }
      >
        <div className='text-14px leading-22px text-t-secondary'>
          {t('conversation.history.archiveProjectConfirm', {
            name: archiveProjectTarget?.name ?? '',
            count: archiveProjectTarget?.conversations.length ?? 0,
          })}
        </div>
      </AionModal>

      <div>
        {/* L1: Pinned section */}
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          modifiers={[restrictToVerticalAxis]}
          onDragEnd={handleDragEnd}
        >
          {pinnedConversations.length > 0 && (
            <div className='min-w-0'>
              {!collapsed && <SectionLabel sectionKey='pinned' label={t('conversation.history.pinnedSection')} />}
              {!collapsedSections.has('pinned') && (
                <SortableContext items={pinnedIds} strategy={verticalListSortingStrategy}>
                  <div className='min-w-0'>
                    {pinnedConversations.map((conversation) => {
                      const props = getConversationRowProps(conversation);
                      return isDragEnabled ? (
                        <SortableConversationRow key={conversation.id} {...props} />
                      ) : (
                        <ConversationRow key={conversation.id} {...props} />
                      );
                    })}
                  </div>
                </SortableContext>
              )}
            </div>
          )}
        </DndContext>

        {/* Slot 由父级（Sider）填入：例如 Team / CronJob sections，位于「置顶」之后、「项目」之前 */}
        {afterPinnedContent}

        {/* L1: Projects section — one ordering across local and remote environments */}
        <div className='flex flex-col'>
          {projectGroups.length > 0 && (
            <div className='contents'>
              {!collapsed && <SectionLabel sectionKey='projects' label={t('conversation.history.projectsSection')} />}
              {!collapsedSections.has('projects') &&
                projectGroups.map((group) => {
                  const environment = getBackendEnvironment() ?? { type: 'local' as const };
                  const workspaceKey = environmentProjectKey(environment, group.workspace);
                  const projectExpanded =
                    expandedWorkspaces.includes(workspaceKey) || expandedWorkspaces.includes(group.workspace);
                  const showProjectActivity =
                    !projectExpanded &&
                    group.conversations.some((conversation) => isConversationGenerating(conversation.id));
                  const projectMenu = (
                    <Menu
                      onClickMenuItem={(key) => {
                        if (key === 'archive') {
                          handleArchiveProject(group.displayName, group.conversations);
                        }
                      }}
                    >
                      <Menu.Item key='archive'>
                        <span className='flex items-center gap-8px'>
                          <FolderClose theme='outline' size='14' />
                          {t('conversation.history.archiveProject')}
                        </span>
                      </Menu.Item>
                    </Menu>
                  );
                  return (
                    <div
                      key={group.workspace}
                      className='min-w-0'
                      style={{
                        order: projectOrder.get(
                          environmentProjectKey(getBackendEnvironment() ?? { type: 'local' }, group.workspace)
                        ),
                      }}
                    >
                      <WorkspaceCollapse
                        expanded={projectExpanded}
                        onToggle={() => handleToggleWorkspace(workspaceKey, [group.workspace])}
                        siderCollapsed={collapsed}
                        stickyHeader
                        stickyTop={28}
                        leadingIcon={
                          showProjectActivity ? (
                            <Spin size={16} />
                          ) : getBackendEnvironment()?.type === 'remote' ? (
                            <span role='img' aria-label={group.displayName} className='inline-flex items-center'>
                              <KimiIcon name='globe' size={16} />
                            </span>
                          ) : undefined
                        }
                        header={
                          <span className='text-14px font-[500] truncate flex-1 text-t-primary min-w-0'>
                            {group.displayName}
                          </span>
                        }
                        trailing={
                          <span className='flex items-center gap-6px'>
                            <Tooltip content={t('conversation.history.newConversationInProject')} position='top'>
                              <span
                                role='button'
                                tabIndex={0}
                                aria-label={t('conversation.history.newConversationInProject')}
                                className={classNames(
                                  'flex-center cursor-pointer transition-colors text-t-secondary hover:text-t-primary size-20px rd-4px sider-action-btn',
                                  isMobile ? 'flex' : 'hidden group-hover:flex'
                                )}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void navigate('/guid', { state: { workspace: group.workspace } });
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    void navigate('/guid', { state: { workspace: group.workspace } });
                                  }
                                }}
                              >
                                <Plus theme='outline' size='14' fill='currentColor' className='block leading-none' />
                              </span>
                            </Tooltip>
                            <Dropdown
                              droplist={projectMenu}
                              trigger='click'
                              position='br'
                              getPopupContainer={() => document.body}
                              unmountOnExit={false}
                            >
                              <span
                                aria-label='Project actions'
                                className={classNames(
                                  'flex-center cursor-pointer transition-colors text-t-secondary hover:text-t-primary size-20px rd-4px sider-action-btn',
                                  isMobile ? 'flex' : 'hidden group-hover:flex'
                                )}
                                onClick={(e) => e.stopPropagation()}
                              >
                                <MoreOne theme='outline' size='14' fill='currentColor' className='block leading-none' />
                              </span>
                            </Dropdown>
                          </span>
                        }
                      >
                        <div className={classNames('flex flex-col min-w-0', { 'mt-1px': !collapsed })}>
                          {group.conversations.map((conversation) => renderConversation(conversation, true))}
                        </div>
                      </WorkspaceCollapse>
                    </div>
                  );
                })}
            </div>
          )}

          <EnvironmentProjects
            collapsed={collapsed}
            heading={
              projectGroups.length === 0 &&
              !collapsed && <SectionLabel sectionKey='projects' label={t('conversation.history.projectsSection')} />
            }
            hidden={collapsedSections.has('projects')}
            getProjectOrder={(environment, project) =>
              projectOrder.get(environmentProjectKey(environment, project.workspace)) ?? projectOrder.size + 1
            }
            isConversationGenerating={isConversationGenerating}
          />
        </div>

        {/* L1: Conversations section — peer to projects, internally split by timeline */}
        {conversationOnlySections.length > 0 && (
          <div className='min-w-0'>
            {!collapsed && (
              <SectionLabel sectionKey='conversations' label={t('conversation.history.conversationsSection')} />
            )}
            {!collapsedSections.has('conversations') &&
              conversationOnlySections.map((section) => (
                <div key={section.timeline} className='min-w-0'>
                  {!collapsed && conversationOnlySections.length > 1 && (
                    <div className='flex items-center px-16px h-24px select-none'>
                      <span className='text-12px text-t-secondary font-[500] leading-none'>{section.timeline}</span>
                    </div>
                  )}
                  {section.items.map((item) =>
                    item.type === 'conversation' && item.conversation ? renderConversation(item.conversation) : null
                  )}
                </div>
              ))}
          </div>
        )}
      </div>
    </>
  );
};

export default WorkspaceGroupedHistory;
