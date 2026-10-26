/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Registers the backend filesystem picker for WebUI and remote Electron environments.
 */

import { registerWebShowOpenHandler } from '@/common/adapter/ipcBridge';
import { showWebFsPicker } from './webFsPicker';

registerWebShowOpenHandler(showWebFsPicker);
