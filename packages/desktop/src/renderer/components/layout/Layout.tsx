/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { TEAM_MODE_ENABLED } from '@/common/config/constants';
import PwaPullToRefresh from '@/renderer/components/layout/PwaPullToRefresh';
import Titlebar from '@/renderer/components/layout/Titlebar';
import { Layout as ArcoLayout, Message, Tooltip } from '@arco-design/web-react';
import classNames from 'classnames';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { setGlobalNavigate } from '@/renderer/utils/navigation';
import { usePreviewContext } from '@renderer/pages/conversation/Preview';
import { ProjectPanelHost } from '@renderer/components/layout/ProjectPanelHost';
import { ProjectPanelMobileOverlay } from '@renderer/components/layout/ProjectPanelMobileOverlay';
import { setCurrentProject, useCurrentProject } from '@renderer/pages/conversation/explorer/currentProjectStore';
import { setCurrentConversation } from '@renderer/pages/conversation/explorer/currentConversationStore';
import { useContainerWidth } from '@renderer/pages/conversation/hooks/useContainerWidth';
import { useProjectExplorerColumnWidth } from '@renderer/hooks/ui/useProjectExplorerColumnWidth';
import { useResizableSplit } from '@renderer/hooks/ui/useResizableSplit';
import { useProjectPreviewRegionWidth } from '@renderer/hooks/ui/useProjectPreviewRegionWidth';
import { useProjectPanelCollapse } from '@renderer/hooks/ui/useProjectPanelCollapse';
import { dispatchWorkspaceToggleEvent } from '@renderer/utils/workspace/workspaceEvents';
import { LayoutContext } from '@renderer/hooks/context/LayoutContext';
import { NavigationHistoryProvider } from '@renderer/hooks/context/NavigationHistoryContext';
import { useDeepLink } from '@renderer/hooks/system/useDeepLink';
import { useNotificationClick } from '@renderer/hooks/system/notification/useNotificationClick';
import { useBrowserNotification } from '@renderer/hooks/system/notification/useBrowserNotification';
import { useDesktopTurnNotification } from '@renderer/hooks/system/notification/useDesktopTurnNotification';
import { cleanupSiderTooltips } from '@renderer/utils/ui/siderTooltip';
import { useConversationShortcuts } from '@renderer/hooks/ui/useConversationShortcuts';
import { isElectronDesktop } from '@renderer/utils/platform';
import { IS_DISCONTINUED_BUILD } from '@/renderer/utils/discontinuedBuild';
import UpdateMigrationDialog from '@/renderer/components/settings/UpdateMigrationDialog';
import '@renderer/styles/layout.css';

const SidebarIcon: React.FC<{ size?: number; strokeWidth?: number }> = ({ size = 18, strokeWidth = 4 }) => (
  <svg
    width={size}
    height={size}
    viewBox='0 0 48 48'
    fill='none'
    stroke='currentColor'
    strokeWidth={strokeWidth}
    strokeLinecap='round'
    strokeLinejoin='round'
    aria-hidden='true'
    focusable='false'
    style={{ display: 'inline-block', verticalAlign: 'middle' }}
  >
    <rect x='6' y='10' width='36' height='28' rx='5' />
    <line x1='18' y1='10' x2='18' y2='38' />
  </svg>
);

const useDebug = () => {
  const [count, setCount] = useState(0);
  const timer = useRef<any>(null);
  const onClick = () => {
    const open = () => {
      ipcBridge.application.openDevTools.invoke().catch((error) => {
        console.error('Failed to open dev tools:', error);
      });
      setCount(0);
    };
    if (count >= 3) {
      return open();
    }
    setCount((prev) => {
      if (prev >= 2) {
        open();
        return 0;
      }
      return prev + 1;
    });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      clearTimeout(timer.current);
      setCount(0);
    }, 1000);
  };

  return { onClick };
};

const DEFAULT_SIDER_WIDTH = 260;
const DESKTOP_COLLAPSED_WIDTH = 0;
// 桌面侧栏连续可调：下限 200；低于此值拖拽即吸附收起（消灭旧 130 死区）。
// 上限 = 窗口宽 50%（动态随窗口）。
const SIDER_MIN_WIDTH = 200;
const MOBILE_SIDER_WIDTH_RATIO = 0.67;
const MOBILE_SIDER_MIN_WIDTH = 260;
const MOBILE_SIDER_MAX_WIDTH = 420;

const detectMobileViewportOrTouch = (): boolean => {
  if (typeof window === 'undefined') return false;
  if (isElectronDesktop()) {
    return window.innerWidth < 768;
  }
  const width = window.innerWidth;
  const byWidth = width < 768;
  // 仅在小屏时才将 coarse/touch 视为移动端，避免触控笔记本被误判
  // Treat touch/coarse pointer as mobile only on smaller viewports
  const smallScreen = width < 1024;
  const byMedia = window.matchMedia('(hover: none)').matches || window.matchMedia('(pointer: coarse)').matches;
  const byTouchPoints = typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0;
  return byWidth || (smallScreen && (byMedia || byTouchPoints));
};

const Layout: React.FC<{
  sider: React.ReactNode;
  onSessionClick?: () => void;
}> = ({ sider, onSessionClick: _onSessionClick }) => {
  const [collapsed, setCollapsed] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [viewportWidth, setViewportWidth] = useState<number>(() =>
    typeof window === 'undefined' ? 390 : window.innerWidth
  );
  const { onClick } = useDebug();
  useDeepLink();
  useNotificationClick();
  useBrowserNotification();
  useDesktopTurnNotification();
  const navigate = useNavigate();
  const location = useLocation();
  const workspaceAvailable =
    location.pathname.startsWith('/conversation/') || (TEAM_MODE_ENABLED && location.pathname.startsWith('/team/'));
  const toggleSider = useCallback(() => {
    setCollapsed((previous) => !previous);
  }, []);
  useConversationShortcuts({ navigate, toggleSider });
  // Expose navigate to code running outside the Router tree (e.g. the globally
  // mounted FeedbackReportModal's "via chat" action).
  useEffect(() => {
    setGlobalNavigate(navigate);
    return () => setGlobalNavigate(null);
  }, [navigate]);
  const { t } = useTranslation();
  useEffect(() => {
    let reloadTimer: number | undefined;
    const dispose =
      ipcBridge.remoteEnvironment?.disconnected?.on((event) => {
        const active = window.__backendEnvironment;
        if (active?.type !== 'remote' || active.id !== event.environmentId) return;
        Message.warning(t('guid.workspace.remote.unexpectedDisconnect'));
        reloadTimer = window.setTimeout(() => window.location.reload(), 800);
      }) ?? (() => {});
    return () => {
      dispose();
      if (reloadTimer !== undefined) window.clearTimeout(reloadTimer);
    };
  }, [t]);
  // The "Catfish" wordmark acts as Home / Back-to-Chat, but only from settings routes.
  // In non-settings routes the user is already "home", so it is a no-op (and not actionable).
  const isSettingsRoute = location.pathname.startsWith('/settings');
  // Only wired to the wordmark in the isSettingsRoute branch below, so the
  // "no-op outside settings" contract is enforced structurally — no internal
  // route guard needed (the chat-route wordmark is a plain, inert div).
  const handleBrandHome = useCallback(() => {
    // Mirror Titlebar's handleBackToChat convention: return to the last non-settings path.
    let target: string | null = null;
    try {
      target = sessionStorage.getItem('aion:last-non-settings-path');
    } catch {
      // ignore
    }
    if (target && !target.startsWith('/settings')) {
      void navigate(target);
      return;
    }
    void navigate('/guid');
  }, [navigate]);
  // Close preview whenever the user leaves the conversation route entirely
  // (e.g. switches to a team, /guid, or settings). Within /conversation/:id
  // the finer-grained closePreviewIfScopeChanged in conversation/index.tsx
  // handles scope changes, so we only need to act here on route-type changes.
  // Use closePreview directly — closePreviewIfScopeChanged skips the call
  // when lastScopeRef is already null (e.g. on team routes where it was
  // never updated), which would leave the panel open.
  const {
    closePreview: closePreviewOnRouteChange,
    isOpen: isPreviewOpen,
    isMaximized: isPreviewMaximized,
  } = usePreviewContext();
  // Layout-level explorer column width engine (stage3 FULL / P2): measure the
  // [content | explorer] row, clamp the explorer width so chat (+ preview) keep
  // their reserve. Active only when a project is bound and on desktop.
  const currentProject = useCurrentProject();
  const [workbenchSection, setWorkbenchSection] = useState<'files' | 'changes' | 'preview' | 'terminal' | 'agents'>(
    'files'
  );
  const { containerRef: mainRowRef, containerWidth: mainRowWidth } = useContainerWidth();
  const explorerActive = Boolean(currentProject) && !isMobile;
  const { widthPx: explorerWidthPx, createDragHandle: createExplorerDragHandle } = useProjectExplorerColumnWidth(
    mainRowWidth,
    isPreviewOpen,
    explorerActive
  );
  // The Workbench stays mounted at width 0 while collapsed, preserving project
  // subscriptions, editor state and browser pages.
  const { collapsed: explorerCollapsed, setCollapsed: setExplorerCollapsed } = useProjectPanelCollapse({
    projectId: currentProject,
    isMobile,
    active: Boolean(currentProject),
  });
  const toggleExplorer = useCallback(() => {
    dispatchWorkspaceToggleEvent();
  }, []);
  const explorerMobileWidthPx = Math.min(420, Math.max(280, Math.round(viewportWidth * 0.85)));
  const workbenchWide = isPreviewOpen || workbenchSection === 'terminal' || workbenchSection === 'agents';
  const workbenchResizeActive = Boolean(currentProject) && !isMobile && workbenchWide && !explorerCollapsed;
  const previewMaximized =
    Boolean(currentProject) &&
    !isMobile &&
    isPreviewOpen &&
    workbenchSection === 'preview' &&
    !explorerCollapsed &&
    isPreviewMaximized;
  const { widthPx: previewWidthPx, createDragHandle: createPreviewRegionDragHandle } = useProjectPreviewRegionWidth(
    mainRowWidth,
    0,
    workbenchResizeActive
  );
  const workbenchWidthPx = workbenchWide ? previewWidthPx : explorerWidthPx;
  const routeLayoutMountedRef = useRef(false);
  useEffect(() => {
    if (!routeLayoutMountedRef.current) {
      routeLayoutMountedRef.current = true;
      return; // skip initial mount — preview starts closed, don't wipe persisted tabs
    }
    if (!workspaceAvailable) {
      closePreviewOnRouteChange();
      // Leaving every project-bearing route (conversation + team) → no active
      // project → hide the Explorer host. Within /conversation/* and /team/* the
      // route itself publishes project_id, so we only clear when leaving both.
      setCurrentProject(null);
    }
    // The active-conversation target is published by the conversation route
    // (mounted conversation) and the team route (active member column). Clear it
    // only when leaving both, so a stale target can't leak to a non-chat route.
    if (!workspaceAvailable) {
      setCurrentConversation(null);
    }
  }, [location.pathname, workspaceAvailable, closePreviewOnRouteChange]);

  const collapsedRef = useRef(collapsed);

  // 桌面侧栏连续可调宽 + 记忆宽度 + 收起吸附。复用 useResizableSplit
  // 的 pointer/rAF 拖拽管线：拖到 <200 吸附收起（onCollapsedChange→collapsed），
  // ≥200 跟手且写盘，双击分隔线恢复 260。上限动态跟随窗口 50%。移动端不使用。
  const { splitRatio: desktopSiderWidth, createDragHandle: createSiderDragHandle } = useResizableSplit({
    unit: 'px',
    defaultWidth: DEFAULT_SIDER_WIDTH,
    minWidth: SIDER_MIN_WIDTH,
    maxWidth: Math.max(SIDER_MIN_WIDTH, Math.round(viewportWidth * 0.5)),
    storageKey: 'sider-width-px',
    collapseThreshold: SIDER_MIN_WIDTH,
    collapsedWidth: DESKTOP_COLLAPSED_WIDTH,
    collapsed,
    onCollapsedChange: setCollapsed,
  });

  // 检测移动端并响应窗口大小变化
  useEffect(() => {
    const checkMobile = () => {
      const mobile = detectMobileViewportOrTouch();
      setIsMobile(mobile);
      setViewportWidth(window.innerWidth);
    };

    // 初始检测
    checkMobile();

    // 监听窗口大小变化
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // 进入移动端后立即折叠 / Collapse immediately when switching to mobile
  useEffect(() => {
    if (!isMobile || collapsedRef.current) {
      return;
    }
    setCollapsed(true);
  }, [isMobile]);

  // 清理侧栏 Tooltip 残留节点，避免移动端路由切换后浮层卡在左上角
  useEffect(() => {
    cleanupSiderTooltips();
  }, [isMobile, collapsed, location.pathname, location.search, location.hash]);

  // Bridge Main Process logs to F12 Console
  useEffect(() => {
    const unsubscribe = ipcBridge.application.logStream.on((entry) => {
      const prefix = `%c[Main:${entry.tag}]%c ${entry.message}`;
      const style = 'color:#7c3aed;font-weight:bold';
      if (entry.level === 'error') {
        console.error(prefix, style, 'color:inherit', ...(entry.data !== undefined ? [entry.data] : []));
      } else if (entry.level === 'warn') {
        console.warn(prefix, style, 'color:inherit', ...(entry.data !== undefined ? [entry.data] : []));
      } else {
        console.log(prefix, style, 'color:inherit', ...(entry.data !== undefined ? [entry.data] : []));
      }
    });
    return () => unsubscribe();
  }, []);

  // Handle tray events from main process / 处理来自主进程的托盘事件
  useEffect(() => {
    if (!isElectronDesktop()) return;

    // Navigate to guid page when requested from tray / 托盘请求导航到 guid 页面
    const handleNavigateToGuid = () => {
      void navigate('/guid');
    };

    // Navigate to conversation when requested from tray / 托盘请求导航到对话页面
    const handleNavigateToConversation = (event: CustomEvent<{ conversation_id: string }>) => {
      void navigate(`/conversation/${event.detail.conversation_id}`);
    };

    // Open about dialog when requested from tray / 托盘请求打开关于对话框
    const handleOpenAbout = () => {
      // Navigate to settings/about page / 导航到设置/关于页面
      void navigate('/settings/about');
    };

    // Handle pause all tasks request from tray / 托盘请求暂停所有任务
    const handlePauseAllTasks = async () => {
      const result = await ipcBridge.task.stopAll.invoke();
      if (result?.success) {
        // Navigate to settings page to show task status
        void navigate('/settings/system');
      }
    };

    // Handle check update request from tray / 托盘请求检查更新
    const handleCheckUpdate = () => {
      window.dispatchEvent(new CustomEvent('aionui-open-update-modal', { detail: { source: 'tray' } }));
    };

    // Listen for tray events / 监听托盘事件
    window.addEventListener('tray:navigate-to-guid', handleNavigateToGuid as EventListener);
    window.addEventListener('tray:navigate-to-conversation', handleNavigateToConversation as EventListener);
    window.addEventListener('tray:open-about', handleOpenAbout as EventListener);
    window.addEventListener('tray:pause-all-tasks', handlePauseAllTasks as EventListener);
    window.addEventListener('tray:check-update', handleCheckUpdate as EventListener);

    return () => {
      window.removeEventListener('tray:navigate-to-guid', handleNavigateToGuid as EventListener);
      window.removeEventListener('tray:navigate-to-conversation', handleNavigateToConversation as EventListener);
      window.removeEventListener('tray:open-about', handleOpenAbout as EventListener);
      window.removeEventListener('tray:pause-all-tasks', handlePauseAllTasks as EventListener);
      window.removeEventListener('tray:check-update', handleCheckUpdate as EventListener);
    };
  }, [navigate]);

  const siderWidth = isMobile
    ? Math.max(
        MOBILE_SIDER_MIN_WIDTH,
        Math.min(MOBILE_SIDER_MAX_WIDTH, Math.round(viewportWidth * MOBILE_SIDER_WIDTH_RATIO))
      )
    : desktopSiderWidth;
  useEffect(() => {
    collapsedRef.current = collapsed;
  }, [collapsed]);

  const siderStyle = isMobile
    ? {
        position: 'fixed' as const,
        left: 0,
        zIndex: 100,
        transform: collapsed ? 'translateX(-100%)' : 'translateX(0)',
        transition: 'none',
        pointerEvents: collapsed ? ('none' as const) : ('auto' as const),
      }
    : {
        position: 'relative' as const,
        overflow: 'visible' as const,
      };

  return (
    <LayoutContext.Provider value={{ isMobile, siderCollapsed: collapsed, setSiderCollapsed: setCollapsed }}>
      <NavigationHistoryProvider>
        <div className='app-shell flex flex-col size-full min-h-0'>
          <Titlebar workspaceAvailable={workspaceAvailable} />
          {/* 移动端左侧边栏蒙板 / Mobile left sider backdrop */}
          {isMobile && !collapsed && (
            <div className='fixed inset-0 bg-black/30 z-90' onClick={() => setCollapsed(true)} aria-hidden='true' />
          )}

          <ArcoLayout className={'size-full layout flex-1 min-h-0'}>
            <ArcoLayout.Sider
              collapsedWidth={isMobile ? 0 : 0}
              collapsed={collapsed}
              width={siderWidth}
              className={classNames('!bg-2 layout-sider', {
                collapsed: collapsed,
              })}
              style={siderStyle}
            >
              <ArcoLayout.Header
                className={classNames(
                  'flex items-center justify-start pt-8px pb-8px ps-18px pe-16px gap-12px layout-sider-header',
                  isMobile && 'layout-sider-header--mobile',
                  {
                    'cursor-pointer group ': collapsed,
                  }
                )}
              >
                <div
                  className={classNames('bg-black shrink-0 size-32px relative rd-0.5rem', {
                    '!size-24px': collapsed,
                  })}
                  onClick={onClick}
                >
                  <svg
                    className={classNames('w-5.5 h-5.5 absolute inset-0 m-auto', {
                      'scale-140': !collapsed,
                    })}
                    viewBox='0 0 1024 1024'
                    fill='none'
                  >
                    <g fill='#f5f5f4'>
                      <path d='M 420 397 C 462 318, 548 267, 646 250 C 607 304, 582 355, 574 414 Z' />
                      <path d='M 326 584 C 354 653, 411 699, 482 712 C 449 666, 425 621, 414 574 Z' />
                      <path d='M 560 618 C 592 677, 645 713, 705 722 C 679 673, 650 629, 626 594 Z' />
                      <path d='M 826 456 C 873 432, 919 407, 956 380 C 944 429, 941 474, 948 520 C 952 548, 960 575, 970 600 C 925 573, 879 550, 830 538 Z' />
                      <path d='M 178 502 C 184 438, 282 385, 414 379 C 535 374, 641 413, 756 450 C 808 467, 849 465, 889 443 L 913 500 C 861 534, 798 564, 724 590 C 599 633, 454 651, 334 624 C 231 601, 165 560, 178 502 Z' />
                    </g>
                    <g fill='none' stroke='#121318' strokeWidth='11' strokeLinecap='round' opacity='0.72'>
                      <path d='M 454 383 C 493 333, 535 300, 593 276' />
                      <path d='M 487 392 C 524 349, 559 321, 610 296' />
                      <path d='M 355 602 C 380 641, 408 666, 446 685' />
                      <path d='M 382 589 C 405 625, 429 649, 458 665' />
                      <path d='M 592 625 C 616 660, 642 683, 671 698' />
                      <path d='M 855 477 C 886 461, 912 445, 936 426' />
                      <path d='M 860 509 C 893 518, 920 532, 944 549' />
                    </g>
                    <path
                      d='M 334 449 C 305 484, 305 540, 338 575'
                      fill='none'
                      stroke='#121318'
                      strokeWidth='17'
                      strokeLinecap='round'
                      opacity='0.78'
                    />
                    <g fill='none' stroke='#f5f5f4' strokeWidth='23' strokeLinecap='round'>
                      <path d='M 238 454 C 181 389, 157 287, 221 197' />
                      <path d='M 215 521 C 158 614, 197 746, 337 806' />
                      <path d='M 193 493 C 119 474, 65 505, 43 566' />
                      <path d='M 241 548 C 224 609, 260 655, 307 672' />
                    </g>
                    <circle cx='283' cy='463' r='25' fill='#1783ff' />
                  </svg>
                </div>
                {isSettingsRoute ? (
                  <Tooltip content={t('common.back', { defaultValue: 'Back to Chat' })} position='bottom'>
                    <div
                      className='text-16px text-t-primary collapsed-hidden font-semibold cursor-pointer'
                      role='button'
                      tabIndex={0}
                      aria-label={t('common.back', { defaultValue: 'Back to Chat' })}
                      onClick={handleBrandHome}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          handleBrandHome();
                        }
                      }}
                    >
                      Catfish
                    </div>
                  </Tooltip>
                ) : (
                  <div className='text-16px text-t-primary collapsed-hidden font-semibold'>Catfish</div>
                )}
                {isMobile && !collapsed && (
                  <button
                    type='button'
                    className='app-titlebar__button app-titlebar__button--mobile'
                    onClick={() => setCollapsed(true)}
                    title='Collapse sidebar'
                    aria-label='Collapse sidebar'
                  >
                    <SidebarIcon size={18} strokeWidth={2.5} />
                  </button>
                )}
                {/* 侧栏折叠改由标题栏统一控制 / Sidebar folding handled by Titlebar toggle */}
              </ArcoLayout.Header>
              <ArcoLayout.Content className='pt-0 px-8px pb-0 layout-sider-content'>
                {React.isValidElement(sider)
                  ? React.cloneElement(sider, {
                      onSessionClick: () => {
                        cleanupSiderTooltips();
                        if (isMobile) setCollapsed(true);
                      },
                      collapsed,
                    } as any)
                  : sider}
              </ArcoLayout.Content>
              {!isMobile &&
                createSiderDragHandle({
                  className: 'z-20',
                  style: { right: '-4px', width: '8px' },
                  linePlacement: 'start',
                })}
            </ArcoLayout.Sider>

            {/* Chat and the unified project Workbench share one measured row.
                The host lives above the conversation subtree, so same-project
                switches preserve tree subscriptions, editors and browser tabs. */}
            <div ref={mainRowRef} className='flex flex-1 min-h-0 overflow-hidden'>
              <ArcoLayout.Content
                className={'bg-1 layout-content flex flex-col min-h-0 flex-1'}
                onClick={() => {
                  if (isMobile && !collapsed) setCollapsed(true);
                }}
                style={
                  isMobile
                    ? {
                        width: '100%',
                      }
                    : previewMaximized
                      ? // 最大化时聊天区隐藏（保持挂载不卸载，还原后即刻恢复）
                        // Hidden while maximized (kept mounted so restoring is instant)
                        { display: 'none' }
                      : undefined
                }
              >
                <Outlet />
                <PwaPullToRefresh />
                {IS_DISCONTINUED_BUILD && <UpdateMigrationDialog />}
              </ArcoLayout.Content>
              {!isMobile && (
                <ProjectPanelHost
                  widthPx={workbenchWidthPx}
                  collapsed={explorerCollapsed}
                  maximized={previewMaximized}
                  onCollapse={() => setExplorerCollapsed(true)}
                  onExpand={() => setExplorerCollapsed(false)}
                  onSectionChange={setWorkbenchSection}
                  dragHandle={
                    workbenchWide
                      ? createPreviewRegionDragHandle({
                          className: 'absolute start-0 top-0 bottom-0 z-20',
                          style: { width: '20px', left: '-20px' },
                          reverse: true,
                          linePlacement: 'end',
                          lineClassName: 'opacity-30 group-hover:opacity-100 group-active:opacity-100',
                          lineStyle: { width: '2px' },
                        })
                      : createExplorerDragHandle({
                          className: 'absolute start-0 top-0 bottom-0 z-20',
                          reverse: true,
                        })
                  }
                />
              )}
            </div>

            {/* Mobile overlay: backdrop + fixed panel + floating collapse handle. */}
            {isMobile && Boolean(currentProject) && (
              <ProjectPanelMobileOverlay
                projectId={currentProject as string}
                collapsed={explorerCollapsed}
                onCollapse={toggleExplorer}
                widthPx={explorerMobileWidthPx}
              />
            )}
          </ArcoLayout>
        </div>
      </NavigationHistoryProvider>
    </LayoutContext.Provider>
  );
};

export default Layout;
