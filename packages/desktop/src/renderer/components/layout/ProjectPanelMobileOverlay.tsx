/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Button } from '@arco-design/web-react';
import React, { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { WorkbenchPanel } from '@/renderer/pages/conversation/Workbench';
import { useCurrentConversation } from '@/renderer/pages/conversation/explorer/currentConversationStore';
import { useWorkbenchPanelState } from '@/renderer/pages/conversation/Workbench/workbenchPanelState';

export type ProjectPanelMobileOverlayProps = {
  projectId: string;
  collapsed: boolean;
  onCollapse: () => void;
  widthPx: number;
};

export const ProjectPanelMobileOverlay: React.FC<ProjectPanelMobileOverlayProps> = ({
  projectId,
  collapsed,
  onCollapse,
  widthPx,
}) => {
  const { t } = useTranslation();
  const conversationId = useCurrentConversation();
  const { state } = useWorkbenchPanelState(projectId, conversationId, true);
  const mountIdRef = useRef<string>('');
  if (mountIdRef.current === '') mountIdRef.current = `pem-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  return (
    <>
      {!collapsed && <div className='fixed inset-0 bg-black/30 z-90' onClick={onCollapse} aria-hidden='true' />}
      <div
        data-explorer-mobile-overlay
        data-mount-id={mountIdRef.current}
        data-collapsed={collapsed ? 'true' : 'false'}
        className='!bg-1 relative'
        style={{
          position: 'fixed',
          right: 0,
          top: 0,
          height: '100vh',
          width: `${Math.round(widthPx)}px`,
          zIndex: 100,
          transform: collapsed ? 'translateX(100%)' : 'translateX(0)',
          transition: 'none',
          pointerEvents: collapsed ? 'none' : 'auto',
          borderLeft: '1px solid var(--bg-3)',
        }}
      >
        <div hidden={!state.planOpen || state.workspaceOpen || collapsed} className='h-full min-h-0' data-plan-dock>
          {conversationId && <div data-plan-panel-slot={conversationId} className='h-full min-h-0' />}
        </div>
        <div
          hidden={!state.workspaceOpen || collapsed}
          data-workspace-presentation={!state.workspaceOpen || collapsed ? 'hidden' : 'docked'}
          className='h-full overflow-hidden'
        >
          <WorkbenchPanel projectId={projectId} collapsed={collapsed} onCollapse={onCollapse} onExpand={onCollapse} />
        </div>
      </div>

      {!collapsed && (
        <Button
          type='text'
          className='fixed z-101 flex items-center justify-center transition-colors workspace-toggle-floating'
          style={{
            top: '50%',
            right: `${Math.round(widthPx)}px`,
            transform: 'translateY(-50%)',
            width: '20px',
            height: '64px',
            borderTopLeftRadius: '10px',
            borderBottomLeftRadius: '10px',
            backgroundColor: 'var(--bg-2)',
            boxShadow: '0 8px 20px rgba(0, 0, 0, 0.12)',
          }}
          onClick={onCollapse}
          aria-label={t('messages.workbench.collapse', { defaultValue: 'Collapse Workbench' })}
          icon={
            <span className='flex flex-col items-center justify-center gap-5px text-t-secondary'>
              <span className='block w-8px h-2px rd-999px bg-current opacity-85'></span>
              <span className='block w-8px h-2px rd-999px bg-current opacity-65'></span>
              <span className='block w-8px h-2px rd-999px bg-current opacity-45'></span>
            </span>
          }
        />
      )}
    </>
  );
};
