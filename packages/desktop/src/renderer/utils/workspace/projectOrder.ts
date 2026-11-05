/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { BackendEnvironment } from '@/common/types/remote';
import { environmentProjectKey, type EnvironmentProjects } from './environmentProjects';

export type ProjectOrderItem = {
  environment: BackendEnvironment;
  workspace: string;
  conversationIds: string[];
  lastActivityAt?: number;
};

const latestActivity = (item: ProjectOrderItem, activityAt: ReadonlyMap<string, number>): number =>
  Math.max(item.lastActivityAt ?? 0, ...item.conversationIds.map((id) => activityAt.get(id) ?? 0));

/** Build one visual order across local and remote projects by their latest real conversation activity. */
export const buildProjectOrder = (
  history: EnvironmentProjects[],
  activeItems: ProjectOrderItem[],
  activityAt: ReadonlyMap<string, number>
): Map<string, number> => {
  const items = new Map<string, ProjectOrderItem>();
  for (const entry of history) {
    for (const project of entry.projects) {
      items.set(environmentProjectKey(entry.environment, project.workspace), {
        environment: entry.environment,
        workspace: project.workspace,
        conversationIds: project.conversations.map((conversation) => conversation.id),
        lastActivityAt: Math.max(0, ...project.conversations.map((conversation) => conversation.modifiedAt)),
      });
    }
  }
  // Active data refreshes conversation ids without changing the cached insertion order.
  // It may also include a default workspace deliberately absent from the cache.
  for (const item of activeItems) {
    const key = environmentProjectKey(item.environment, item.workspace);
    const cached = items.get(key);
    items.set(key, { ...item, lastActivityAt: Math.max(item.lastActivityAt ?? 0, cached?.lastActivityAt ?? 0) });
  }

  const ordered = [...items.values()].toSorted((a, b) => latestActivity(b, activityAt) - latestActivity(a, activityAt));
  return new Map(ordered.map((item, index) => [environmentProjectKey(item.environment, item.workspace), index + 1]));
};
