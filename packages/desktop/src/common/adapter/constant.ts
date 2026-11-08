/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

export const ADAPTER_BRIDGE_EVENT_KEY = 'office-ai-bridge-adapter';

export const EMBEDDED_TERMINAL_CHANNELS = {
  start: 'embedded-terminal:start',
  write: 'embedded-terminal:write',
  resize: 'embedded-terminal:resize',
  kill: 'embedded-terminal:kill',
  output: 'embedded-terminal:output',
} as const;
