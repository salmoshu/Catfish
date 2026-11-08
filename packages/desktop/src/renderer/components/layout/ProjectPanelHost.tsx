/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef } from 'react';
import { useCurrentProject } from '@/renderer/pages/conversation/explorer/currentProjectStore';
import { useCurrentConversation } from '@/renderer/pages/conversation/explorer/currentConversationStore';
import { useWorkbenchPanelState } from '@/renderer/pages/conversation/Workbench/workbenchPanelState';
import { WorkbenchPanel } from '@/renderer/pages/conversation/Workbench';
import { usePreviewContext } from '@/renderer/pages/conversation/Preview';
import type { WorkbenchSection } from '@/renderer/pages/conversation/Workbench/workbenchActivity';

export type ProjectPanelHostProps = {
  widthPx: number;
  collapsed: boolean;
  maximized?: boolean;
  dragHandle?: React.ReactNode;
  onCollapse?: () => void;
  onExpand?: () => void;
  onSectionChange?: (section: WorkbenchSection) => void;
};

export const ProjectPanelHost: React.FC<ProjectPanelHostProps> = ({
  widthPx,
  collapsed,
  maximized = false,
  dragHandle,
  onCollapse,
  onExpand,
  onSectionChange,
}) => {
  const projectId = useCurrentProject();
  const conversationId = useCurrentConversation();
  const { state } = useWorkbenchPanelState(projectId, conversationId);
  const planDocked = state.planOpen && !state.workspaceOpen;
  const hostCollapsed = collapsed || (!state.workspaceOpen && !planDocked);
  const { isOpen: previewOpen } = usePreviewContext();
  const mountIdRef = useRef<string>('');
  if (mountIdRef.current === '') mountIdRef.current = `pec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  if (!projectId) return null;

  return (
    <div
      data-project-panel-host
      data-explorer-column
      data-project-preview-region={previewOpen ? '' : undefined}
      data-mount-id={mountIdRef.current}
      data-collapsed={hostCollapsed ? 'true' : 'false'}
      className='!bg-1 h-full relative'
      style={{
        width: hostCollapsed ? '0px' : maximized ? '100%' : `${widthPx}px`,
        flexGrow: maximized && !hostCollapsed ? 1 : 0,
        flexShrink: maximized && !hostCollapsed ? 1 : 0,
        flexBasis: maximized && !hostCollapsed ? 0 : 'auto',
        borderLeft: hostCollapsed ? 'none' : '1px solid var(--bg-3)',
        overflow: 'hidden',
      }}
    >
      {!hostCollapsed && !maximized && dragHandle}
      <div hidden={!planDocked || hostCollapsed} className='h-full min-h-0 flex-1' data-plan-dock>
        {conversationId && <div data-plan-panel-slot={conversationId} className='h-full min-h-0' />}
      </div>
      <div
        data-workspace-presentation={!state.workspaceOpen || hostCollapsed ? 'hidden' : 'docked'}
        hidden={!state.workspaceOpen || hostCollapsed}
        className='h-full overflow-hidden'
      >
        <WorkbenchPanel
          projectId={projectId}
          collapsed={collapsed}
          onCollapse={onCollapse}
          onExpand={onExpand}
          onSectionChange={onSectionChange}
        />
      </div>
    </div>
  );
};
