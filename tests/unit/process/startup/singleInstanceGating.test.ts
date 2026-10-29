/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import {
  acquireSingleInstanceLockWithRetry,
  shouldRegisterBackendStartup,
  shouldShowMainWindowOnReady,
} from '@/process/startup/singleInstanceGating';

describe('shouldRegisterBackendStartup', () => {
  it('registers the backend startup flow only for the single-instance lock owner', () => {
    expect(shouldRegisterBackendStartup(true)).toBe(true);
  });

  it('never registers backend startup for a lock-losing instance', () => {
    expect(shouldRegisterBackendStartup(false)).toBe(false);
  });
});

describe('acquireSingleInstanceLockWithRetry', () => {
  it('returns immediately when the lock is acquired on the first attempt', async () => {
    let attempts = 0;
    const acquired = await acquireSingleInstanceLockWithRetry({
      requestLock: () => {
        attempts += 1;
        return true;
      },
    });

    expect(acquired).toBe(true);
    expect(attempts).toBe(1);
  });

  it('retries while the previous instance is releasing the lock', async () => {
    const outcomes = [false, false, true];
    const delays: number[] = [];
    let attempts = 0;
    const acquired = await acquireSingleInstanceLockWithRetry({
      requestLock: () => outcomes[attempts++] ?? true,
      schedule: (callback, delay) => {
        delays.push(delay);
        callback();
      },
    });

    expect(acquired).toBe(true);
    expect(attempts).toBe(3);
    expect(delays).toEqual([250, 250]);
  });

  it('gives up after the bounded retry instead of waiting forever', async () => {
    let attempts = 0;
    const acquired = await acquireSingleInstanceLockWithRetry({
      requestLock: () => {
        attempts += 1;
        return false;
      },
      maxAttempts: 3,
      schedule: (callback) => callback(),
    });

    expect(acquired).toBe(false);
    expect(attempts).toBe(3);
  });
});

describe('shouldShowMainWindowOnReady', () => {
  it('shows the window for a normal launch', () => {
    expect(shouldShowMainWindowOnReady(false, false, false)).toBe(true);
  });

  it('keeps a login launch hidden when close-to-tray is enabled', () => {
    expect(shouldShowMainWindowOnReady(false, true, true)).toBe(false);
  });

  it('honors a pre-ready second-instance launch even for a hidden login instance', () => {
    expect(shouldShowMainWindowOnReady(true, true, true)).toBe(true);
  });
});
