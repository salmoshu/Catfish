/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { normalizeAssistantDisplayName, resolveAssistantName } from '@renderer/utils/model/assistantDisplay';

describe('normalizeAssistantDisplayName', () => {
  it('maps the legacy AionCli assistant name to Catfish Cli', () => {
    expect(normalizeAssistantDisplayName('Aion CLI')).toBe('Catfish CLI');
    expect(normalizeAssistantDisplayName('AionUi Butler')).toBe('Catfish Butler');
  });

  it('leaves other assistant names unchanged', () => {
    expect(normalizeAssistantDisplayName('Claude Code')).toBe('Claude Code');
    expect(normalizeAssistantDisplayName(undefined)).toBeUndefined();
  });
});

describe('resolveAssistantName', () => {
  it('normalizes both localized and fallback assistant names', () => {
    expect(resolveAssistantName({ id: 'aionrs', name: 'Aion CLI', name_i18n: {} }, 'zh-CN')).toBe('Catfish CLI');
    expect(resolveAssistantName({ id: 'aionui-assistant', name: 'AionUi Butler', name_i18n: {} }, 'zh-CN')).toBe(
      'Catfish Butler'
    );
  });
});
