import { useCallback, useSyncExternalStore } from 'react';
import type { WorkbenchSection } from './workbenchActivity';

export type WorkbenchPanelState = {
  workspaceOpen: boolean;
  planOpen: boolean;
  section: Exclude<WorkbenchSection, 'plan'>;
};

type PanelAction = 'workspace' | 'plan';
const states = new Map<string, WorkbenchPanelState>();
const listeners = new Set<() => void>();
const sections = new Set(['files', 'changes', 'preview', 'terminal', 'shell', 'agents']);

/** Open a workspace section, closing a docked plan only when the workspace was closed. */
export function openWorkbenchWorkspace(
  state: WorkbenchPanelState,
  section: WorkbenchPanelState['section']
): WorkbenchPanelState {
  return {
    ...state,
    section,
    workspaceOpen: true,
    planOpen: state.workspaceOpen ? state.planOpen : false,
  };
}

/** Apply the workspace/plan interaction rules without changing either panel's content. */
export function toggleWorkbenchPanel(state: WorkbenchPanelState, action: PanelAction): WorkbenchPanelState {
  if (action === 'plan') return { ...state, planOpen: !state.planOpen };
  return state.workspaceOpen ? { ...state, workspaceOpen: false } : openWorkbenchWorkspace(state, state.section);
}

const stateKey = (projectId: string | null, conversationId: string | null): string =>
  `workbench-panels:${projectId ?? ''}:${conversationId ?? ''}`;

const readState = (key: string, projectId: string | null, initiallyCollapsed: boolean): WorkbenchPanelState => {
  const cached = states.get(key);
  if (cached) return cached;
  let state: WorkbenchPanelState = { workspaceOpen: !initiallyCollapsed, planOpen: false, section: 'files' };
  try {
    const section = localStorage.getItem(`workbench-section:${projectId}`);
    if (section && sections.has(section)) state.section = section as WorkbenchPanelState['section'];
    if (localStorage.getItem(`project-panel-collapse:${projectId}`) === 'collapsed') state.workspaceOpen = false;
    const saved: unknown = JSON.parse(localStorage.getItem(key) ?? 'null');
    if (saved && typeof saved === 'object' && 'workspaceOpen' in saved && 'planOpen' in saved && 'section' in saved) {
      if (typeof saved.workspaceOpen === 'boolean' && typeof saved.planOpen === 'boolean') {
        state = {
          workspaceOpen: saved.workspaceOpen,
          planOpen: saved.planOpen,
          section:
            typeof saved.section === 'string' && sections.has(saved.section)
              ? (saved.section as WorkbenchPanelState['section'])
              : state.section,
        };
      }
    }
  } catch {
    // The in-memory state remains usable when storage is unavailable or invalid.
  }
  states.set(key, state);
  return state;
};

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/** Share and persist the two panels' presentation independently for each conversation. */
export function useWorkbenchPanelState(
  projectId: string | null,
  conversationId: string | null,
  initiallyCollapsed = false
) {
  const key = stateKey(projectId, conversationId);
  const state = useSyncExternalStore(subscribe, () => readState(key, projectId, initiallyCollapsed));
  const update = useCallback(
    (transform: (current: WorkbenchPanelState) => WorkbenchPanelState): void => {
      const next = transform(readState(key, projectId, initiallyCollapsed));
      states.set(key, next);
      try {
        localStorage.setItem(key, JSON.stringify(next));
        if (projectId) localStorage.setItem(`workbench-section:${projectId}`, next.section);
      } catch {
        // Keep state transitions working when persistence is unavailable.
      }
      for (const listener of listeners) listener();
    },
    [key, projectId, initiallyCollapsed]
  );
  const toggle = useCallback(
    (action: PanelAction) => update((current) => toggleWorkbenchPanel(current, action)),
    [update]
  );
  return { state, update, toggle };
}

export function resetWorkbenchPanelStateForTest(): void {
  states.clear();
}
