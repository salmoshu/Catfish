import { useSyncExternalStore } from 'react';
import type { TMessage } from '@/common/chat/chatLib';
import {
  deriveWorkbenchActivity,
  EMPTY_WORKBENCH_ACTIVITY,
  type WorkbenchActivity,
  type WorkbenchSection,
} from './workbenchActivity';

const MAX_ACTIVITY_CONVERSATIONS = 12;
const activities = new Map<string, WorkbenchActivity>();
const listeners = new Set<() => void>();

export const WORKBENCH_OPEN_EVENT = 'aionui-workbench-open';

export const openWorkbenchSection = (section: WorkbenchSection): void => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<WorkbenchOpenDetail>(WORKBENCH_OPEN_EVENT, { detail: { section } }));
};

export type WorkbenchOpenDetail = { section: WorkbenchSection };

export const publishWorkbenchActivity = (conversationId: string, messages: TMessage[]): void => {
  if (!conversationId) return;
  activities.delete(conversationId);
  activities.set(conversationId, deriveWorkbenchActivity(messages));
  while (activities.size > MAX_ACTIVITY_CONVERSATIONS) {
    const oldest = activities.keys().next().value;
    if (typeof oldest !== 'string') break;
    activities.delete(oldest);
  }
  for (const listener of listeners) listener();
};

export const getWorkbenchActivity = (conversationId: string | null): WorkbenchActivity => {
  return conversationId ? (activities.get(conversationId) ?? EMPTY_WORKBENCH_ACTIVITY) : EMPTY_WORKBENCH_ACTIVITY;
};

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const useWorkbenchActivity = (conversationId: string | null): WorkbenchActivity => {
  return useSyncExternalStore(
    subscribe,
    () => getWorkbenchActivity(conversationId),
    () => EMPTY_WORKBENCH_ACTIVITY
  );
};

export const resetWorkbenchActivityForTest = (): void => {
  activities.clear();
  listeners.clear();
};
