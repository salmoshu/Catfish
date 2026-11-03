/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Assistant } from '@/common/types/agent/assistantTypes';
import AssistantSelectionArea, {
  orderAssistantsByRecent,
  RECENT_ASSISTANTS_STORAGE_KEY,
} from '@/renderer/pages/guid/components/AssistantSelectionArea';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) => options?.defaultValue || key,
  }),
}));

vi.mock('@/renderer/hooks/assistant/useAssistantOrder', () => ({
  useAssistantOrder: () => ({ assistantOrder: [] }),
}));

const renderPicker = (items = assistants(), onSelectAssistant = vi.fn()) => {
  render(
    <AssistantSelectionArea
      selectedAssistantId='bare-aionrs'
      assistants={items}
      localeKey='en-US'
      onSelectAssistant={onSelectAssistant}
    />
  );
  return onSelectAssistant;
};

describe('AssistantSelectionArea', () => {
  beforeEach(() => {
    cleanup();
    localStorage.clear();
  });

  it('keeps the selected agent in the compact input selector', () => {
    renderPicker();
    expect(screen.getByTestId('assistant-selector')).toHaveTextContent('Catfish CLI');
    expect(screen.getByTestId('assistant-selector')).toHaveClass('sendbox-model-btn', 'guid-config-btn');
    expect(screen.queryByTestId('preset-pill-bare-aionrs')).not.toBeInTheDocument();
  });

  it('selects an agent from the dropdown and records it as most recently used', async () => {
    const onSelect = renderPicker();
    fireEvent.click(screen.getByTestId('assistant-selector'));
    fireEvent.click(await screen.findByTestId('assistant-option-builtin-writer'));

    expect(onSelect).toHaveBeenCalledWith('builtin-writer');
    expect(JSON.parse(localStorage.getItem(RECENT_ASSISTANTS_STORAGE_KEY) ?? '[]')[0]).toBe('builtin-writer');
  });

  it('puts recent agents first and retains the configured order for the rest', () => {
    const items = manyAssistants();
    const original = items.map((item) => item.id);
    expect(orderAssistantsByRecent(items, ['user-review', 'bare-aionrs']).map((item) => item.id)).toEqual([
      'user-review',
      'bare-aionrs',
      ...original.filter((id) => id !== 'user-review' && id !== 'bare-aionrs'),
    ]);
  });

  it('restores recent ordering across mounts', async () => {
    localStorage.setItem(RECENT_ASSISTANTS_STORAGE_KEY, JSON.stringify(['user-review', 'bare-aionrs']));
    renderPicker(manyAssistants());
    fireEvent.click(screen.getByTestId('assistant-selector'));

    const options = await screen.findAllByTestId(/^assistant-option-/);
    expect(options.slice(0, 3).map((item) => item.getAttribute('data-assistant-id'))).toEqual([
      'user-review',
      'bare-aionrs',
      'user-research',
    ]);
  });

  it('only shows search for a long agent list and filters by name', async () => {
    renderPicker(manyAssistants());
    fireEvent.click(screen.getByTestId('assistant-selector'));
    await screen.findByTestId('assistant-option-builtin-writer');
    expect(screen.queryByTestId('assistant-search')).not.toBeInTheDocument();
    cleanup();

    const bulk = Array.from({ length: 8 }, (_, index) => mkAssistant(`user-${index}`, `Agent ${index}`));
    const { unmount } = render(
      <AssistantSelectionArea
        selectedAssistantId='bare-aionrs'
        assistants={[...manyAssistants(), ...bulk]}
        localeKey='en-US'
        onSelectAssistant={vi.fn()}
      />
    );
    fireEvent.click(screen.getByTestId('assistant-selector'));
    const search = await screen.findByTestId('assistant-search');
    fireEvent.change(search, { target: { value: 'Agent 7' } });
    expect(screen.getByTestId('assistant-option-user-7')).toBeInTheDocument();
    expect(screen.queryByTestId('assistant-option-builtin-writer')).not.toBeInTheDocument();
    unmount();
  });

  it('can re-render from an empty catalog without breaking hook order', () => {
    const { rerender } = render(
      <AssistantSelectionArea
        selectedAssistantId={null}
        assistants={[]}
        localeKey='en-US'
        onSelectAssistant={vi.fn()}
      />
    );
    expect(screen.queryByTestId('assistant-selector')).not.toBeInTheDocument();

    rerender(
      <AssistantSelectionArea
        selectedAssistantId='bare-aionrs'
        assistants={assistants()}
        localeKey='en-US'
        onSelectAssistant={vi.fn()}
      />
    );
    expect(screen.getByTestId('assistant-selector')).toBeInTheDocument();
  });
});

function assistants(): Assistant[] {
  return [mkAssistant('bare-aionrs', 'Catfish CLI'), mkAssistant('builtin-writer', 'Writer')];
}

function manyAssistants(): Assistant[] {
  return [...assistants(), mkAssistant('user-research', 'Researcher'), mkAssistant('user-review', 'Reviewer')];
}

function mkAssistant(id: string, name: string): Assistant {
  return {
    id,
    source: id.startsWith('user-') ? 'user' : id.startsWith('builtin-') ? 'builtin' : 'generated',
    name,
    name_i18n: {},
    description_i18n: {},
    enabled: true,
    sort_order: 10,
    preset_agent_type: 'aionrs',
    enabled_skills: [],
    custom_skill_names: [],
    disabled_builtin_skills: [],
    context_i18n: {},
    prompts: [],
    prompts_i18n: {},
    models: [],
    agent_status: 'online',
    team_selectable: true,
    deletable: false,
  } as Assistant;
}
