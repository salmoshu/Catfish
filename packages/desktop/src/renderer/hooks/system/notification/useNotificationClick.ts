/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ipcBridge } from '@/common';
import { getBackendEnvironment } from '@/common/adapter/httpBridge';
import type { BackendEnvironment } from '@/common/types/remote';
import { connectOrResumeEnvironment, syncBackendEnvironment } from '@/renderer/utils/workspace/backendSwitch';

const isSameEnvironment = (left: BackendEnvironment | undefined, right: BackendEnvironment): boolean => {
  if (left?.type !== right.type) return false;
  return right.type === 'local' || (left.type === 'remote' && left.id === right.id);
};

export const useNotificationClick = () => {
  const navigate = useNavigate();

  const handler = useCallback(
    (payload: { conversation_id?: string; environment?: BackendEnvironment }) => {
      void (async () => {
        console.log('[useNotificationClick] Received notification click:', payload);
        if (!payload.conversation_id) {
          console.warn('[useNotificationClick] No conversation_id in payload');
          return;
        }

        if (payload.environment && !isSameEnvironment(getBackendEnvironment(), payload.environment)) {
          if (payload.environment.type === 'local') {
            const result = await ipcBridge.remoteEnvironment.activate.invoke({});
            if (result.ok === false) {
              console.warn('[useNotificationClick] Failed to activate the local backend:', result.message);
              return;
            }
          } else {
            const result = await connectOrResumeEnvironment(payload.environment.id);
            if (result.ok === false) {
              console.warn('[useNotificationClick] Failed to activate the remote backend:', result.message);
              return;
            }
          }
          await syncBackendEnvironment();
        }

        console.log('[useNotificationClick] Navigating to conversation:', payload.conversation_id);
        void navigate(`/conversation/${payload.conversation_id}`);
      })().catch((error: unknown) => {
        console.warn('[useNotificationClick] Failed to open the conversation:', error);
      });
    },
    [navigate]
  );

  useEffect(() => {
    return ipcBridge.notification.clicked.on(handler);
  }, [handler]);
};
