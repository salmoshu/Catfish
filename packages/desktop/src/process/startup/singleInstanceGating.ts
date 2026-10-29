/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Decide whether this process is allowed to register the backend startup flow
 * (whenReady -> handleAppReady -> startBackendOrExit).
 *
 * Only the instance that owns the single-instance lock may spawn aioncore. A
 * lock-losing instance must never register backend startup; otherwise it races
 * the first instance's aioncore over the same data directory, which produced
 * the "local data repair failed" false alarm in Sentry 135525166.
 *
 * Extracted as a pure function so the gating decision is unit-testable without
 * importing index.ts (whose module top-level runs heavy Electron side effects).
 */
export function shouldRegisterBackendStartup(gotTheLock: boolean): boolean {
  return gotTheLock === true;
}

export const DEFAULT_SINGLE_INSTANCE_RETRY_ATTEMPTS = 20;
export const DEFAULT_SINGLE_INSTANCE_RETRY_DELAY_MS = 250;

/** Whether a pending second-instance request must make the window visible. */
export function shouldShowMainWindowOnReady(
  pendingSecondInstance: boolean,
  wasLaunchedAtLogin: boolean,
  closeToTrayEnabled: boolean
): boolean {
  return pendingSecondInstance || !(wasLaunchedAtLogin && closeToTrayEnabled);
}

/**
 * Wait briefly for a previous instance to finish quitting and release the lock.
 * A lock-losing instance still exits after the bounded retry, but a launch that
 * races normal shutdown can continue instead of silently disappearing.
 */
export function acquireSingleInstanceLockWithRetry(options: {
  requestLock: () => boolean;
  maxAttempts?: number;
  retryDelayMs?: number;
  schedule?: (callback: () => void, delayMs: number) => void;
}): Promise<boolean> {
  const {
    requestLock,
    maxAttempts = DEFAULT_SINGLE_INSTANCE_RETRY_ATTEMPTS,
    retryDelayMs = DEFAULT_SINGLE_INSTANCE_RETRY_DELAY_MS,
    schedule = (callback, delay) => setTimeout(callback, delay),
  } = options;
  let attempts = 0;

  const attempt = (): Promise<boolean> => {
    attempts += 1;
    if (requestLock()) return Promise.resolve(true);
    if (attempts >= maxAttempts) return Promise.resolve(false);
    return new Promise((resolve) => {
      schedule(() => {
        void attempt().then(resolve);
      }, retryDelayMs);
    });
  };

  return attempt();
}
