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
  const floating = state.workspaceOpen && state.planOpen;
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
      data-collapsed={collapsed ? 'true' : 'false'}
      className='!bg-1 h-full relative'
      style={{
        width: collapsed ? '0px' : maximized ? '100%' : `${widthPx}px`,
        flexGrow: maximized && !collapsed ? 1 : 0,
        flexShrink: maximized && !collapsed ? 1 : 0,
        flexBasis: maximized && !collapsed ? 0 : 'auto',
        borderLeft: collapsed ? 'none' : '1px solid var(--bg-3)',
        overflow: floating ? 'visible' : 'hidden',
      }}
    >
      {!collapsed && !maximized && dragHandle}
      <div hidden={!state.planOpen || collapsed} className='h-full min-h-0 flex-1' data-plan-dock>
        {conversationId && <div data-plan-panel-slot={conversationId} className='h-full min-h-0' />}
      </div>
      <div
        data-workspace-presentation={!state.workspaceOpen || collapsed ? 'hidden' : floating ? 'floating' : 'docked'}
        hidden={!state.workspaceOpen || collapsed}
        className={
          floating
            ? 'absolute top-16px bottom-16px z-70 rounded-16px border border-[var(--color-border-2)] bg-[var(--color-bg-popup)] shadow-lg overflow-hidden'
            : 'h-full overflow-hidden'
        }
        style={
          floating
            ? { right: 'calc(100% + 16px)', width: `min(${widthPx}px, calc(100vw - ${widthPx + 32}px))` }
            : undefined
        }
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
