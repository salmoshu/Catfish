import { useCallback, useEffect } from 'react';
import { useCurrentConversation } from '@/renderer/pages/conversation/explorer/currentConversationStore';
import { useWorkbenchPanelState } from '@/renderer/pages/conversation/Workbench/workbenchPanelState';
import { WORKSPACE_TOGGLE_EVENT, dispatchWorkspaceStateEvent } from '@/renderer/utils/workspace/workspaceEvents';

type UseProjectPanelCollapseParams = {
  projectId: string | null;
  isMobile: boolean;
  active: boolean;
  siderCollapsed?: boolean;
};

/** Keep the dock occupied while either panel is open and toggle the workspace independently. */
export function useProjectPanelCollapse({ projectId, isMobile, active }: UseProjectPanelCollapseParams) {
  const conversationId = useCurrentConversation();
  const { state, update, toggle } = useWorkbenchPanelState(projectId, conversationId, isMobile);
  const setCollapsed = useCallback(
    (collapsed: boolean): void => {
      update((current) =>
        collapsed ? { ...current, workspaceOpen: false, planOpen: false } : { ...current, workspaceOpen: true }
      );
    },
    [update]
  );

  useEffect(() => {
    const handleToggle = (event: Event) => {
      if (!active || !projectId) return;
      event.preventDefault();
      toggle('workspace');
    };
    window.addEventListener(WORKSPACE_TOGGLE_EVENT, handleToggle);
    return () => window.removeEventListener(WORKSPACE_TOGGLE_EVENT, handleToggle);
  }, [active, projectId, toggle]);

  useEffect(() => {
    if (active) dispatchWorkspaceStateEvent(!state.workspaceOpen);
  }, [active, state.workspaceOpen, conversationId]);

  return { collapsed: !state.workspaceOpen && !state.planOpen, setCollapsed };
}
