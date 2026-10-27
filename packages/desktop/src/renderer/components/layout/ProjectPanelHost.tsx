/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef } from 'react';
import { useCurrentProject } from '@/renderer/pages/conversation/explorer/currentProjectStore';
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
      className='!bg-1 h-full overflow-hidden relative'
      style={{
        width: collapsed ? '0px' : maximized ? '100%' : `${widthPx}px`,
        flexGrow: maximized && !collapsed ? 1 : 0,
        flexShrink: maximized && !collapsed ? 1 : 0,
        flexBasis: maximized && !collapsed ? 0 : 'auto',
        borderLeft: collapsed ? 'none' : '1px solid var(--bg-3)',
      }}
    >
      {!collapsed && !maximized && dragHandle}
      <WorkbenchPanel
        projectId={projectId}
        collapsed={collapsed}
        onCollapse={onCollapse}
        onExpand={onExpand}
        onSectionChange={onSectionChange}
      />
    </div>
  );
};
