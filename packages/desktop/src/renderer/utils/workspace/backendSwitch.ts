/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { BackendEnvironment, RemoteOperationResult } from '@/common/types/remote';
import { resetBackendSocket, setBackendRuntime } from '@/common/adapter/httpBridge';
import { configService } from '@/common/config/configService';
import { emitter } from '@/renderer/utils/emitter';

export const BACKEND_ENVIRONMENT_CHANGED = 'catfish:backend-environment-changed';

/** Resume an existing runtime before starting a new remote connection. */
export const connectOrResumeEnvironment = async (id: string): Promise<RemoteOperationResult<BackendEnvironment>> => {
  const resumed = await ipcBridge.remoteEnvironment.activate.invoke({ id });
  if (resumed.ok) return resumed;
  if (resumed.ok === false && resumed.code !== 'not_connected') return resumed;
  return ipcBridge.remoteEnvironment.connect.invoke({ id });
};

/** Point the renderer at the selected backend and refresh data without remounting the application. */
export const syncBackendEnvironment = async (): Promise<void> => {
  const state = await ipcBridge.remoteEnvironment.state.invoke();
  if (!state.port) throw new Error('The selected backend has no available port');
  setBackendRuntime(state.active, state.port);
  resetBackendSocket();
  await configService.reload();
  emitter.emit('chat.history.refresh');
  window.dispatchEvent(new Event(BACKEND_ENVIRONMENT_CHANGED));
};

/** Navigate and switch the renderer backend while preserving the current document and theme. */
export const switchBackendRoute = async (route: string): Promise<void> => {
  window.location.hash = route;
  await syncBackendEnvironment();
};
