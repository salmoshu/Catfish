/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Assistant } from '@/common/types/agent/assistantTypes';

type AssistantNameSource = Pick<Assistant, 'id' | 'name' | 'name_i18n'>;

export function normalizeAssistantDisplayName(name: string | null | undefined): string | undefined {
  if (name === 'Aion CLI') return 'Catfish CLI';
  if (name === 'AionUi Butler') return 'Catfish Butler';
  return name ?? undefined;
}

export function resolveAssistantName(
  assistant: AssistantNameSource | null | undefined,
  localeKey: string,
  fallback = 'Assistant'
): string {
  if (!assistant) {
    return fallback;
  }

  const localizedName = assistant.name_i18n?.[localeKey] || assistant.name_i18n?.['en-US'];
  return normalizeAssistantDisplayName(localizedName?.trim() || assistant.name?.trim()) || assistant.id || fallback;
}
