/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TChatConversation } from '@/common/config/storage';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useConversationHistoryContext } from '@/renderer/hooks/context/ConversationHistoryContext';
import type { TimelineSection } from '../types';
import { getBackendEnvironment } from '@/common/adapter/httpBridge';
import { environmentProjectKey } from '@/renderer/utils/workspace/environmentProjects';
import {
  toggleExpandedWorkspace,
  useWorkspaceExpansionState,
  writeExpandedWorkspaces,
} from './useWorkspaceExpansionState';

// Persist section collapsed state across reloads.
const COLLAPSED_SECTIONS_KEY = 'grouped-history-collapsed-sections';

const readCollapsedSections = (): Set<string> => {
  try {
    const raw = localStorage.getItem(COLLAPSED_SECTIONS_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as string[];
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
};

// Where an active conversation lives, so we can expand the right containers
// before scrolling it into view.
type ConversationLocation = { section: 'pinned' | 'projects' | 'conversations'; workspace?: string };

const locateConversation = (
  id: string,
  pinned: TChatConversation[],
  sections: TimelineSection[]
): ConversationLocation | null => {
  if (pinned.some((c) => c.id === id)) return { section: 'pinned' };
  for (const section of sections) {
    for (const item of section.items) {
      if (item.type === 'workspace' && item.workspaceGroup) {
        if (item.workspaceGroup.conversations.some((c) => c.id === id)) {
          return { section: 'projects', workspace: item.workspaceGroup.workspace };
        }
      } else if (item.type === 'conversation' && item.conversation?.id === id) {
        return { section: 'conversations' };
      }
    }
  }
  return null;
};

export const useConversations = () => {
  const expandedWorkspaces = useWorkspaceExpansionState();
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(() => readCollapsedSections());
  const { id } = useParams();
  const {
    conversations,
    conversationActivityAt,
    isConversationGenerating,
    isConversationWaitingConfirmation,
    hasCompletionUnread,
    clearCompletionUnread,
    isManualUnread,
    markManualUnread,
    clearManualUnread,
    setActiveConversation,
    groupedHistory,
  } = useConversationHistoryContext();

  const { pinnedConversations, timelineSections } = groupedHistory;

  // Track whether auto-expand has already been performed to avoid
  // re-expanding workspaces after a user manually collapses them (#1156)
  const hasAutoExpandedRef = useRef(false);
  // Guard so the auto-expand + scroll for a given active id runs only once.
  // Reset when the active id changes so navigating back to a conversation
  // re-triggers, but manual collapses afterwards are not fought.
  const revealedIdRef = useRef<string | null>(null);

  const toggleSection = useCallback((key: string) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  // Reveal + scroll the active conversation into view.
  // Depends on the grouped data because on a cold start (opening the app
  // directly on a conversation URL) the list loads asynchronously — we re-run
  // once the target can be located, then expand its section/folder and scroll.
  // Use double-RAF to wait for the newly expanded content (and async siblings
  // like CronJobSiderSection) to render before computing the scroll position.
  useEffect(() => {
    if (!id) {
      setActiveConversation(null);
      revealedIdRef.current = null;
      return;
    }

    setActiveConversation(id);
    clearCompletionUnread(id);
    clearManualUnread(id);

    if (revealedIdRef.current === id) return;

    const location = locateConversation(id, pinnedConversations, timelineSections);
    if (!location) return; // data not loaded yet; effect re-runs when it arrives
    revealedIdRef.current = id;

    // Expand the containing section if collapsed.
    setCollapsedSections((prev) => {
      if (!prev.has(location.section)) return prev;
      const next = new Set(prev);
      next.delete(location.section);
      return next;
    });
    // Expand the containing project folder if collapsed.
    if (location.workspace) {
      const workspace = location.workspace;
      const environment = getBackendEnvironment() ?? { type: 'local' as const };
      const key = environmentProjectKey(environment, workspace);
      if (!expandedWorkspaces.includes(key) && !expandedWorkspaces.includes(workspace)) {
        toggleExpandedWorkspace(key, [workspace]);
      }
    }

    let cancelled = false;
    let outerRafId: number;
    let innerRafId: number;
    outerRafId = requestAnimationFrame(() => {
      innerRafId = requestAnimationFrame(() => {
        if (cancelled) return;
        const element = document.getElementById('c-' + id);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      });
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(outerRafId);
      cancelAnimationFrame(innerRafId);
    };
  }, [clearCompletionUnread, clearManualUnread, id, setActiveConversation, pinnedConversations, timelineSections]);

  // Persist section collapsed state
  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSED_SECTIONS_KEY, JSON.stringify([...collapsedSections]));
    } catch {
      // ignore
    }
  }, [collapsedSections]);

  // Auto-expand all workspaces on first load only (#1156)
  useEffect(() => {
    if (hasAutoExpandedRef.current) return;
    if (expandedWorkspaces.length > 0) {
      hasAutoExpandedRef.current = true;
      return;
    }
    const allWorkspaces: string[] = [];
    timelineSections.forEach((section) => {
      section.items.forEach((item) => {
        if (item.type === 'workspace' && item.workspaceGroup) {
          allWorkspaces.push(item.workspaceGroup.workspace);
        }
      });
    });
    if (allWorkspaces.length > 0) {
      const environment = getBackendEnvironment() ?? { type: 'local' as const };
      writeExpandedWorkspaces(allWorkspaces.map((workspace) => environmentProjectKey(environment, workspace)));
      hasAutoExpandedRef.current = true;
    }
  }, [timelineSections]);

  const handleToggleWorkspace = useCallback((workspace: string, legacyKeys: string[] = []) => {
    toggleExpandedWorkspace(workspace, legacyKeys);
  }, []);

  return {
    conversations,
    conversationActivityAt,
    isConversationGenerating,
    isConversationWaitingConfirmation,
    hasCompletionUnread,
    isManualUnread,
    markManualUnread,
    clearManualUnread,
    expandedWorkspaces,
    pinnedConversations,
    timelineSections,
    handleToggleWorkspace,
    collapsedSections,
    toggleSection,
  };
};
