/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { getBackendEnvironment } from '@/common/adapter/httpBridge';

export const DEFAULT_RECENT_WS_KEY = 'aionui:recent-workspaces';
const MAX_RECENT_WORKSPACES = 5;

export const getActiveRecentWorkspaceKey = (): string => {
  if (typeof window === 'undefined') return DEFAULT_RECENT_WS_KEY;
  const environment = getBackendEnvironment();
  return environment?.type === 'remote' ? `${DEFAULT_RECENT_WS_KEY}:remote:${environment.id}` : DEFAULT_RECENT_WS_KEY;
};

export const getRecentWorkspaces = (storageKey: string = getActiveRecentWorkspaceKey()): string[] => {
  try {
    return JSON.parse(localStorage.getItem(storageKey) ?? '[]');
  } catch {
    return [];
  }
};

export const addRecentWorkspace = (path: string, storageKey: string = getActiveRecentWorkspaceKey()): void => {
  try {
    const prev = getRecentWorkspaces(storageKey);
    const next = [path, ...prev.filter((item) => item !== path)].slice(0, MAX_RECENT_WORKSPACES);
    localStorage.setItem(storageKey, JSON.stringify(next));
  } catch {}
};
