/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

export const GITHUB_UPDATE_OWNER = 'salmoshu';
export const GITHUB_UPDATE_REPO = 'Catfish';

export function buildGitHubFeedOptions() {
  return {
    provider: 'github' as const,
    owner: GITHUB_UPDATE_OWNER,
    repo: GITHUB_UPDATE_REPO,
  };
}
