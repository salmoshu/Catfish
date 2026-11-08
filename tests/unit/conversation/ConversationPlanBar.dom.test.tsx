/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * The plan bar is a persistent progress view: it keeps the conversation's last
 * plan visible after a turn ends or is aborted, and distinguishes running work
 * from pending work. It has no inner collapse control.
 */

import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Button } from '@arco-design/web-react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useProjectPanelCollapse } from '@/renderer/hooks/ui/useProjectPanelCollapse';
import { dispatchWorkspaceToggleEvent } from '@/renderer/utils/workspace/workspaceEvents';
import { ProjectPanelHost } from '@/renderer/components/layout/ProjectPanelHost';
import {
  resetWorkbenchPanelStateForTest,
  toggleWorkbenchPanel,
  type WorkbenchPanelState,
} from '@/renderer/pages/conversation/Workbench/workbenchPanelState';
import type { WorkbenchSection } from '@/renderer/pages/conversation/Workbench/workbenchActivity';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) => (params ? `${key}:${Object.values(params).join('/')}` : key),
  }),
}));

const latestPlan = vi.fn();
const runtimeView = vi.fn();

vi.mock('@renderer/pages/conversation/PlanBar/useLatestPlan', () => ({
  __esModule: true,
  useLatestPlan: () => latestPlan(),
  selectLatestPlan: () => undefined,
}));

vi.mock('@renderer/pages/conversation/runtime/useConversationRuntimeView', () => ({
  __esModule: true,
  useConversationRuntimeView: () => runtimeView(),
}));

const scope = vi.hoisted(() => ({ projectId: 'panel-project', conversationId: 'conv-1', siderCollapsed: true }));
vi.mock('@/renderer/hooks/context/LayoutContext', () => ({ useLayoutContext: () => scope }));
vi.mock('@/renderer/pages/conversation/Preview/components/PreviewPanel/SideChatPanel', () => ({ default: () => null }));
vi.mock('@/renderer/pages/conversation/explorer/currentConversationStore', () => ({
  useCurrentConversation: () => scope.conversationId,
}));
vi.mock('@/renderer/pages/conversation/explorer/currentProjectStore', () => ({
  useCurrentProject: () => scope.projectId,
}));

vi.mock('@/renderer/pages/conversation/explorer/ExplorerContainer', () => ({
  ExplorerContainer: ({ activeSection }: { activeSection: WorkbenchSection }) => (
    <div data-testid='workspace-explorer'>{activeSection}</div>
  ),
}));

vi.mock('@/renderer/pages/conversation/Preview', () => ({
  usePreviewContext: () => ({ isOpen: false, activeTab: null }),
  PreviewPanel: () => null,
}));

vi.mock('@/renderer/pages/conversation/Messages/acp/MessageAcpTerminalOutput', () => ({ default: () => null }));

import { getChatSurfaceWidthClass } from '@renderer/pages/conversation/utils/chatSurfaceWidth';
import ConversationPlanBar from '@renderer/pages/conversation/PlanBar/ConversationPlanBar';
import ConversationPlanCard from '@renderer/pages/conversation/PlanBar/ConversationPlanCard';

const ENTRIES = [
  { content: 'read the readme', status: 'completed' },
  { content: 'count the files', status: 'in_progress' },
  { content: 'summarize', status: 'pending' },
];

const plan = (turnId?: string) => ({
  id: 'plan:turn-a',
  msg_id: 'turn-a',
  conversation_id: 'conv-1',
  type: 'plan',
  position: 'left',
  created_at: 1,
  content: { entries: ENTRIES, turn_id: turnId },
});

const setup = (opts: { plan?: unknown; isProcessing?: boolean; activeTurnId?: string | null }) => {
  latestPlan.mockReturnValue(opts.plan);
  runtimeView.mockReturnValue({
    isProcessing: opts.isProcessing ?? false,
    activeTurnId: opts.activeTurnId ?? null,
    hydrated: true,
  });
  return render(<ConversationPlanBar conversation_id='conv-1' />);
};

beforeEach(() => {
  localStorage.clear();
  resetWorkbenchPanelStateForTest();
  scope.projectId = 'panel-project';
  scope.conversationId = 'conv-1';
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('ConversationPlanBar', () => {
  it('shows proposed plan text without an empty state or a completed progress count', () => {
    setup({ plan: { ...plan(), content: { entries: [], explanation: 'Inspect then verify' } } });
    expect(screen.getByText('Inspect then verify')).toBeTruthy();
    expect(screen.queryByText('conversation.planBar.empty')).toBeNull();
    expect(screen.queryByText(/conversation.planBar.progress/)).toBeNull();
  });
  it('shows the plan explanation and high priority steps', () => {
    setup({
      plan: {
        ...plan(),
        content: {
          explanation: 'Verify before release',
          entries: [{ content: 'run tests', status: 'pending', priority: 'high' }],
        },
      },
    });
    expect(screen.getByText('Verify before release')).toBeTruthy();
    expect(screen.getByText('conversation.planBar.priorityHigh')).toBeTruthy();
  });
  it('renders the plan and its progress', () => {
    setup({ plan: plan('turn-id-1'), isProcessing: true, activeTurnId: 'turn-id-1' });
    expect(screen.getByText('conversation.planBar.title')).toBeTruthy();
    expect(screen.getByText('conversation.planBar.progress:1/3')).toBeTruthy();
  });

  it('keeps the plan visible once the turn has ended', () => {
    setup({ plan: plan('turn-id-1'), isProcessing: false, activeTurnId: null });
    expect(screen.getByTestId('conversation-plan-bar')).toBeTruthy();
    expect(screen.getByText('count the files')).toBeTruthy();
  });

  it('keeps a plan from an earlier turn visible after the task resumes', () => {
    setup({ plan: plan('turn-id-OLD'), isProcessing: true, activeTurnId: 'turn-id-NEW' });
    expect(screen.getByText('conversation.planBar.progress:1/3')).toBeTruthy();
    expect(screen.getByText('count the files')).toBeTruthy();
  });

  it('renders an empty state when there is no plan', () => {
    setup({ plan: undefined, isProcessing: false });
    expect(screen.getByTestId('conversation-plan-bar')).toBeTruthy();
    expect(screen.getByText('conversation.planBar.empty')).toBeTruthy();
  });

  it('marks the running step separately from pending steps', () => {
    setup({ plan: plan('turn-id-1'), isProcessing: true, activeTurnId: 'turn-id-1' });
    const running = screen.getByText('count the files').closest('[data-status]');
    const pending = screen.getByText('summarize').closest('[data-status]');
    expect(running).toHaveAttribute('data-status', 'in_progress');
    expect(pending).toHaveAttribute('data-status', 'pending');
    expect(running?.querySelector('[data-status="in_progress"]')).toBeTruthy();
    expect(running).toHaveAttribute('aria-current', 'step');
  });

  it('has no collapse control and keeps every entry visible', () => {
    setup({ plan: plan('turn-id-1'), isProcessing: true, activeTurnId: 'turn-id-1' });
    for (const entry of ENTRIES) {
      expect(screen.getByText(entry.content)).toBeTruthy();
    }
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('uses the same width class as the send box so the bar does not overhang it', () => {
    // The bar sits directly above the send box. Both must share the centered,
    // bounded `.chat-surface-fluid` content column.
    const { container } = setup({ plan: plan('turn-id-1'), isProcessing: true, activeTurnId: 'turn-id-1' });
    const bar = container.querySelector('[data-testid="conversation-plan-bar"]');
    expect(bar?.className).toContain(getChatSurfaceWidthClass());
  });

  it('keeps horizontal padding off the root so it does not overhang the send box', () => {
    // Keep horizontal insets on the children so they do not add to the shared
    // content column's width or make the plan bar overhang the Composer.
    const { container } = setup({ plan: plan('turn-id-1'), isProcessing: true, activeTurnId: 'turn-id-1' });
    const bar = container.querySelector('[data-testid="conversation-plan-bar"]') as HTMLElement;
    expect(bar.className).toContain('chat-surface-fluid');
    expect(bar.className).not.toMatch(/(^|\s)-?p[xlre]-/);
  });

  it('caps its height relative to the viewport, not at a fixed pixel value', () => {
    // The zone above the send box also holds CommandQueuePanel (capped at
    // min(36vh, 320px)), ThoughtDisplay and a growable input. A fixed cap here
    // takes a large share of a short window and squeezes the message list, so
    // this bar follows the same viewport-relative convention as its neighbour.
    const { container } = setup({ plan: plan('turn-id-1'), isProcessing: true, activeTurnId: 'turn-id-1' });
    const scroller = container.querySelector('[data-testid="conversation-plan-bar"] .overflow-y-auto') as HTMLElement;
    expect(scroller).toBeTruthy();
    expect(scroller.style.maxHeight).toContain('vh');
  });
});

describe('independent workspace and plan panels', () => {
  const Harness = () => {
    const { collapsed, setCollapsed } = useProjectPanelCollapse({
      projectId: scope.projectId,
      isMobile: false,
      active: true,
      siderCollapsed: scope.siderCollapsed,
    });
    return (
      <>
        <Button onClick={() => dispatchWorkspaceToggleEvent()}>Toggle workspace</Button>
        <div data-plan-card-slot={scope.conversationId} />
        <ProjectPanelHost widthPx={320} collapsed={collapsed} onExpand={() => setCollapsed(false)} />
        <ConversationPlanCard conversation_id={scope.conversationId} />
      </>
    );
  };
  const key = () => `workbench-panels:${scope.projectId}:${scope.conversationId}`;
  const setupPanels = (workspaceOpen: boolean, planOpen: boolean) => {
    latestPlan.mockReturnValue(plan('turn-1'));
    runtimeView.mockReturnValue({ isProcessing: false, hydrated: true });
    localStorage.setItem(key(), JSON.stringify({ workspaceOpen, planOpen, section: 'files' }));
    return render(<Harness />);
  };
  const expectPresentation = (workspace: boolean, plan: boolean) => {
    expect(document.querySelector('[data-project-panel-host]')).toHaveAttribute(
      'data-collapsed',
      String(!workspace && !plan)
    );
    expect(document.querySelector('[data-workspace-presentation]')).toHaveAttribute(
      'data-workspace-presentation',
      workspace ? 'docked' : 'hidden'
    );
    expect(screen.getByRole('button', { name: 'conversation.planBar.title' })).toHaveAttribute(
      'aria-expanded',
      String(plan)
    );
    if (plan) expect(screen.getByText('count the files')).toBeVisible();
    else expect(screen.queryByTestId('conversation-plan-bar')).not.toBeInTheDocument();
  };

  it.each([
    [false, false, 'workspace', true, false],
    [false, false, 'plan', false, true],
    [true, false, 'plan', true, true],
    [true, false, 'workspace', false, false],
    [false, true, 'workspace', true, true],
    [false, true, 'plan', false, false],
    [true, true, 'workspace', false, true],
    [true, true, 'plan', true, false],
  ] as const)('A=%s B=%s, toggling %s produces A=%s B=%s', (a, b, action, nextA, nextB) => {
    const state: WorkbenchPanelState = { workspaceOpen: a, planOpen: b, section: 'files' };
    expect(toggleWorkbenchPanel(state, action)).toEqual({ ...state, workspaceOpen: nextA, planOpen: nextB });
    setupPanels(a, b);
    fireEvent.click(
      screen.getByRole('button', { name: action === 'workspace' ? 'Toggle workspace' : 'conversation.planBar.title' })
    );
    expectPresentation(nextA, nextB);
  });

  it('restores each conversation after switching away, including the floating plan', () => {
    const view = setupPanels(true, true);
    expectPresentation(true, true);
    scope.conversationId = 'conv-2';
    localStorage.setItem(key(), JSON.stringify({ workspaceOpen: false, planOpen: true, section: 'changes' }));
    view.rerender(<Harness />);
    expectPresentation(false, true);
    scope.conversationId = 'conv-1';
    view.rerender(<Harness />);
    expectPresentation(true, true);
    expect(document.querySelector('[data-workbench]')).toHaveAttribute('data-active-section', 'files');
  });

  it('restores both panels after unmounting and reloading persisted state', () => {
    const view = setupPanels(false, false);
    fireEvent.click(screen.getByRole('button', { name: 'conversation.planBar.title' }));
    fireEvent.click(screen.getByRole('button', { name: 'Toggle workspace' }));
    expectPresentation(true, true);
    view.unmount();
    resetWorkbenchPanelStateForTest();
    render(<Harness />);
    expectPresentation(true, true);
  });

  it('keeps the workspace docked and mounted when closing the floating plan', () => {
    setupPanels(true, true);
    const explorer = screen.getByTestId('workspace-explorer');
    fireEvent.click(screen.getByRole('button', { name: 'conversation.planBar.title' }));
    expectPresentation(true, false);
    expect(screen.getByTestId('workspace-explorer')).toBe(explorer);
  });

  it('opens an empty plan in the dock when no plan has arrived', () => {
    setupPanels(false, false);
    latestPlan.mockReturnValue(undefined);
    fireEvent.click(screen.getByRole('button', { name: 'conversation.planBar.title' }));
    expect(screen.getByText('conversation.planBar.empty')).toBeVisible();
  });

  it('keeps the plan in the right dock when the left sidebar is opened', () => {
    const view = setupPanels(false, true);
    expect(document.querySelector('[data-plan-presentation]')).toBeNull();
    scope.siderCollapsed = false;
    view.rerender(<Harness />);
    expect(screen.getByTestId('conversation-plan-bar')).toBeVisible();
    expect(document.querySelector('[data-project-panel-host]')).toHaveAttribute('data-collapsed', 'false');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    scope.siderCollapsed = true;
  });

  it('keeps the workspace mounted when opening a floating plan, including an open left sidebar', () => {
    scope.siderCollapsed = false;
    setupPanels(true, false);
    const explorer = screen.getByTestId('workspace-explorer');
    fireEvent.click(screen.getByRole('button', { name: 'conversation.planBar.title' }));
    expect(screen.getByRole('dialog', { name: 'conversation.planBar.title' })).toBeVisible();
    expect(screen.getByTestId('workspace-explorer')).toBe(explorer);
    expectPresentation(true, true);
    fireEvent.keyDown(window, { key: 'Escape' });
    expectPresentation(true, false);
    scope.siderCollapsed = true;
  });
});
