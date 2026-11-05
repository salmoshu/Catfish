/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { BackendEnvironment } from '@/common/types/remote';
import { getBackendEnvironment } from '@/common/adapter/httpBridge';
import { environmentKey } from './environmentProjects';

const ENVIRONMENT_SCOPED_NAMESPACES = new Set(['conversation', 'explorer-project']);

export const getActiveBackendEnvironment = (): BackendEnvironment =>
  getBackendEnvironment() ?? ({ type: 'local' } as const);

export const isActiveBackendEnvironment = (environment: BackendEnvironment): boolean =>
  environmentKey(environment) === environmentKey(getActiveBackendEnvironment());

/** Cache ids are local to a backend; the same id on another backend is a different entity. */
export const backendCacheKey = (
  namespace: 'conversation' | 'explorer-project',
  id: string,
  environment: BackendEnvironment = getActiveBackendEnvironment()
): string => `${namespace}/${environmentKey(environment)}/${id}`;

/**
 * Revalidate general queries after a backend change, but never query an inactive
 * environment's entities through the newly selected backend. Inactive scoped
 * entries keep their last valid value and are refreshed when their env is active.
 */
export const shouldRevalidateBackendCacheKey = (key: unknown): boolean => {
  if (typeof key !== 'string') return true;
  const separator = key.indexOf('/');
  if (separator === -1) return true;
  const namespace = key.slice(0, separator);
  if (!ENVIRONMENT_SCOPED_NAMESPACES.has(namespace)) return true;
  return key.startsWith(`${namespace}/${environmentKey(getActiveBackendEnvironment())}/`);
};
