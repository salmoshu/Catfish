/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { RemoteHostKeyApproval } from './environment';

export type RemoteEnvironmentConnectParams = {
  id: string;
  hostKeyApproval?: RemoteHostKeyApproval;
};

export type RemoteEnvironmentDisconnectEvent = {
  environmentId: string;
  reason: string;
};
