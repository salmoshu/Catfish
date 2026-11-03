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
};

const latestActivity = (item: ProjectOrderItem, activityAt: ReadonlyMap<string, number>): number =>
  Math.max(0, ...item.conversationIds.map((id) => activityAt.get(id) ?? 0));

/** Build one visual order across local and remote projects without promoting an environment on selection. */
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
      });
    }
  }
  // Active data refreshes conversation ids without changing the cached insertion order.
  // It may also include a default workspace deliberately absent from the cache.
  for (const item of activeItems) {
    items.set(environmentProjectKey(item.environment, item.workspace), item);
  }

  const ordered = [...items.values()].toSorted((a, b) => {
    const activityDifference = latestActivity(b, activityAt) - latestActivity(a, activityAt);
    return activityDifference || 0;
  });
  return new Map(ordered.map((item, index) => [environmentProjectKey(item.environment, item.workspace), index + 1]));
};
