import { useEffect, useState } from 'react';

export const WORKSPACE_EXPANSION_STORAGE_KEY = 'aionui_workspace_expansion';
export const WORKSPACE_EXPANSION_EVENT = 'aionui:workspace-expansion-changed';

type WorkspaceExpansionChangeDetail = {
  expandedWorkspaces: string[];
};

export const readExpandedWorkspaces = (): string[] => {
  if (typeof window === 'undefined') {
    return [];
  }

  try {
    const stored = localStorage.getItem(WORKSPACE_EXPANSION_STORAGE_KEY);
    if (!stored) {
      return [];
    }

    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export const dispatchWorkspaceExpansionChange = (expandedWorkspaces: string[]): void => {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(
    new CustomEvent<WorkspaceExpansionChangeDetail>(WORKSPACE_EXPANSION_EVENT, {
      detail: { expandedWorkspaces },
    })
  );
};

export const writeExpandedWorkspaces = (expandedWorkspaces: string[]): void => {
  try {
    localStorage.setItem(WORKSPACE_EXPANSION_STORAGE_KEY, JSON.stringify(expandedWorkspaces));
  } catch {
    // The custom event still keeps the current document in sync without storage.
  }
  dispatchWorkspaceExpansionChange(expandedWorkspaces);
};

export const toggleExpandedWorkspace = (key: string, legacyKeys: string[] = []): void => {
  const current = readExpandedWorkspaces();
  const expanded = current.includes(key) || legacyKeys.some((legacyKey) => current.includes(legacyKey));
  const next = expanded ? current.filter((item) => item !== key && !legacyKeys.includes(item)) : [...current, key];
  writeExpandedWorkspaces(next);
};

export const useWorkspaceExpansionState = (): string[] => {
  const [expandedWorkspaces, setExpandedWorkspaces] = useState<string[]>(() => readExpandedWorkspaces());

  useEffect(() => {
    const handleWorkspaceExpansionChange = (event: Event) => {
      const customEvent = event as CustomEvent<WorkspaceExpansionChangeDetail>;
      setExpandedWorkspaces(customEvent.detail?.expandedWorkspaces ?? readExpandedWorkspaces());
    };

    const handleStorage = (event: StorageEvent) => {
      if (event.key === WORKSPACE_EXPANSION_STORAGE_KEY) {
        setExpandedWorkspaces(readExpandedWorkspaces());
      }
    };

    window.addEventListener(WORKSPACE_EXPANSION_EVENT, handleWorkspaceExpansionChange as EventListener);
    window.addEventListener('storage', handleStorage);

    return () => {
      window.removeEventListener(WORKSPACE_EXPANSION_EVENT, handleWorkspaceExpansionChange as EventListener);
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  return expandedWorkspaces;
};
