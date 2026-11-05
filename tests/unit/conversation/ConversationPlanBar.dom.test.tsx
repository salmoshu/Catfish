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
import { afterEach, describe, expect, it, vi } from 'vitest';

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

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('ConversationPlanBar', () => {
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

describe('ConversationPlanCard', () => {
  const setupCard = (sidebarOpen: boolean, entriesPlan: unknown = plan('turn-id-1')) => {
    document.body.innerHTML = `<div data-plan-card-slot="conv-1"></div><div data-project-panel-host data-collapsed="${!sidebarOpen}"><div data-workbench data-active-section="files"></div><div data-plan-panel-slot="conv-1"></div></div>`;
    const panel = document.querySelector<HTMLElement>('[data-project-panel-host]');
    if (!panel) throw new Error('Missing test workbench');
    vi.spyOn(panel, 'getBoundingClientRect').mockReturnValue({ left: 900, width: 320 } as DOMRect);
    latestPlan.mockReturnValue(entriesPlan);
    runtimeView.mockReturnValue({ isProcessing: false, activeTurnId: null, hydrated: true });
    render(<ConversationPlanCard conversation_id='conv-1' />);
    fireEvent.click(screen.getByRole('button', { name: 'conversation.planBar.title' }));
    return screen.queryByRole('dialog', { name: 'conversation.planBar.title' });
  };

  it('floats over the conversation when the workbench is already open', () => {
    const dialog = setupCard(true);
    expect(dialog).toHaveStyle({ position: 'fixed', boxSizing: 'border-box', left: '544px', width: '340px' });
    expect(screen.getByText('conversation.planBar.progress:1/3')).toBeInTheDocument();
  });

  it('keeps the plan button and shows an empty state when there is no plan', () => {
    const dialog = setupCard(true, null);
    expect(dialog).not.toBeNull();
    expect(screen.getByText('conversation.planBar.empty')).toBeInTheDocument();
    expect(screen.queryByText(/conversation\.planBar\.progress/)).toBeNull();
  });

  it('opens the collapsed workbench and renders the plan inside it', () => {
    const dialog = setupCard(false);
    expect(dialog).toBeNull();
    const panel = document.querySelector<HTMLElement>('[data-project-panel-host]');
    const workbench = document.querySelector<HTMLElement>('[data-workbench]');
    if (!panel || !workbench) throw new Error('Missing test workbench');
    panel.dataset.collapsed = 'false';
    workbench.dataset.activeSection = 'plan';
    fireEvent(window, new CustomEvent('aionui-workbench-section'));

    const embeddedPlan = screen.getByTestId('conversation-plan-bar');
    expect(embeddedPlan).toHaveAttribute('data-variant', 'panel');
    expect(embeddedPlan.parentElement).toHaveAttribute('data-plan-panel-slot', 'conv-1');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('closes the floating plan when the workbench expands', () => {
    expect(setupCard(true)).not.toBeNull();
    fireEvent(window, new CustomEvent('aionui-workspace-state'));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('collapses the workbench again when closing a plan opened from the collapsed state', () => {
    expect(setupCard(false)).toBeNull();
    const panel = document.querySelector<HTMLElement>('[data-project-panel-host]');
    const workbench = document.querySelector<HTMLElement>('[data-workbench]');
    if (!panel || !workbench) throw new Error('Missing test workbench');
    panel.dataset.collapsed = 'false';
    workbench.dataset.activeSection = 'plan';
    fireEvent(window, new CustomEvent('aionui-workbench-section'));

    const toggle = vi.fn((event: Event) => event.preventDefault());
    window.addEventListener('aionui-workspace-toggle', toggle);
    fireEvent.click(screen.getByRole('button', { name: 'conversation.planBar.title' }));
    expect(toggle).toHaveBeenCalledOnce();
    window.removeEventListener('aionui-workspace-toggle', toggle);
  });
});
