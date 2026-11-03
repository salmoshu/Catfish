/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Assistant } from '@/common/types/agent/assistantTypes';
import { Button, Dropdown } from '@arco-design/web-react';
import { Down, Robot } from '@icon-park/react';
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import ThemedLogo from '@/renderer/components/agent/ThemedLogo';
import { AionInlineSearchInput } from '@/renderer/components/base';
import { useAssistantOrder } from '@/renderer/hooks/assistant/useAssistantOrder';
import { useManagedAgentRuntimeCatalog } from '@/renderer/hooks/agent/useManagedAgents';
import { managedAgentSearchText } from '@/renderer/utils/model/agentTypes';
import { resolveAssistantAvatar } from '@/renderer/utils/model/assistantAvatar';
import { normalizeAssistantDisplayName } from '@/renderer/utils/model/assistantDisplay';
import { selectableAssistants } from '@/renderer/utils/model/assistantSelection';

export const RECENT_ASSISTANTS_STORAGE_KEY = 'catfish:recent-assistants:v1';

type AssistantSelectionAreaProps = {
  selectedAssistantId?: string | null;
  assistants: Assistant[];
  localeKey: string;
  onSelectAssistant: (assistantId: string) => void;
};

const readRecentAssistants = (): string[] => {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(RECENT_ASSISTANTS_STORAGE_KEY) ?? '[]');
    return Array.isArray(stored) ? stored.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
};

/** Match assistant names, descriptions and runtime command metadata. */
export function assistantMatchesSearch(
  assistant: Assistant,
  localeKey: string,
  query: string,
  agentSearchText?: string
): boolean {
  return [
    assistant.name,
    assistant.name_i18n?.[localeKey],
    assistant.description,
    assistant.description_i18n?.[localeKey],
    agentSearchText,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .includes(query);
}

/** Put recently chosen agents first, retaining the configured order for all others. */
export const orderAssistantsByRecent = (assistants: Assistant[], recentIds: string[]): Assistant[] => {
  const ranks = new Map(recentIds.map((id, index) => [id, index]));
  return assistants
    .map((assistant, index) => ({ assistant, index }))
    .toSorted((a, b) => {
      const aRank = ranks.get(a.assistant.id);
      const bRank = ranks.get(b.assistant.id);
      if (aRank !== undefined && bRank !== undefined) return aRank - bRank;
      if (aRank !== undefined) return -1;
      if (bRank !== undefined) return 1;
      return a.index - b.index;
    })
    .map(({ assistant }) => assistant);
};

const AssistantAvatar: React.FC<{ assistant: Assistant; size?: number }> = ({ assistant, size = 18 }) => {
  const avatar = resolveAssistantAvatar(assistant.avatar);
  return (
    <span
      className='inline-flex shrink-0 items-center justify-center overflow-hidden rounded-999px bg-fill-2'
      style={{ width: size, height: size }}
    >
      {avatar.kind === 'image' ? (
        <ThemedLogo src={avatar.value} alt='' className='h-full w-full object-contain' />
      ) : avatar.kind === 'emoji' ? (
        <span className='text-14px leading-none'>{avatar.value}</span>
      ) : (
        <Robot theme='outline' size={Math.max(12, size - 4)} fill='currentColor' />
      )}
    </span>
  );
};

const AssistantSelectionArea: React.FC<AssistantSelectionAreaProps> = ({
  selectedAssistantId,
  assistants,
  localeKey,
  onSelectAssistant,
}) => {
  const { t } = useTranslation();
  const { assistantOrder } = useAssistantOrder();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [recentIds, setRecentIds] = useState(readRecentAssistants);

  const orderedAssistants = useMemo(() => {
    const enabled = selectableAssistants(assistants, assistantOrder);
    return orderAssistantsByRecent(enabled, recentIds);
  }, [assistantOrder, assistants, recentIds]);
  const selectedAssistant =
    orderedAssistants.find((assistant) => assistant.id === selectedAssistantId) ?? orderedAssistants[0];
  const managedAgentRuntimeCatalog = useManagedAgentRuntimeCatalog();
  const agentSearchTextById = useMemo(
    () => new Map(managedAgentRuntimeCatalog.map((agent) => [agent.id, managedAgentSearchText(agent, localeKey)])),
    [localeKey, managedAgentRuntimeCatalog]
  );
  const filteredAssistants = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return orderedAssistants;
    return orderedAssistants.filter((assistant) =>
      assistantMatchesSearch(
        assistant,
        localeKey,
        query,
        assistant.agent_id ? agentSearchTextById.get(assistant.agent_id) : undefined
      )
    );
  }, [agentSearchTextById, localeKey, orderedAssistants, search]);

  if (!selectedAssistant) return null;

  const selectAssistant = (assistantId: string): void => {
    const nextRecent = [assistantId, ...recentIds.filter((id) => id !== assistantId)];
    setRecentIds(nextRecent);
    try {
      localStorage.setItem(RECENT_ASSISTANTS_STORAGE_KEY, JSON.stringify(nextRecent));
    } catch {
      // Storage is optional; the current selection still works without it.
    }
    onSelectAssistant(assistantId);
    setOpen(false);
    setSearch('');
  };

  const label = normalizeAssistantDisplayName(selectedAssistant.name_i18n?.[localeKey] || selectedAssistant.name);
  const droplist = (
    <div className='w-260px max-w-[calc(100vw-32px)] p-6px'>
      {orderedAssistants.length > 8 && (
        <div className='mb-6px'>
          <AionInlineSearchInput
            value={search}
            onChange={setSearch}
            placeholder={t('team.create.searchPlaceholder', { defaultValue: 'Search' })}
            data-testid='assistant-search'
          />
        </div>
      )}
      <div className='max-h-300px overflow-y-auto'>
        {filteredAssistants.map((assistant) => {
          const itemLabel = normalizeAssistantDisplayName(assistant.name_i18n?.[localeKey] || assistant.name);
          const selected = assistant.id === selectedAssistant.id;
          return (
            <Button
              key={assistant.id}
              type='text'
              data-testid={`assistant-option-${assistant.id}`}
              data-assistant-id={assistant.id}
              data-assistant-selected={selected ? 'true' : 'false'}
              aria-pressed={selected}
              className={`!mb-2px !flex !h-34px !w-full !min-w-0 !items-center !justify-start !gap-8px !rounded-6px !px-8px !text-13px ${
                selected ? '!bg-fill-2 !text-t-primary' : '!text-t-secondary hover:!bg-fill-2 hover:!text-t-primary'
              }`}
              onClick={() => selectAssistant(assistant.id)}
            >
              <AssistantAvatar assistant={assistant} />
              <span className='min-w-0 flex-1 truncate text-start'>{itemLabel}</span>
            </Button>
          );
        })}
      </div>
    </div>
  );

  return (
    <Dropdown
      trigger='click'
      position='bl'
      popupVisible={open}
      onVisibleChange={(visible) => {
        setOpen(visible);
        if (!visible) setSearch('');
      }}
      droplist={droplist}
      unmountOnExit={false}
    >
      <Button
        type='text'
        size='small'
        aria-label={t('settings.agents', { defaultValue: 'Agents' })}
        data-testid='assistant-selector'
        data-assistant-id={selectedAssistant.id}
        data-assistant-selected='true'
        className='!flex !h-28px !max-w-160px !min-w-0 !items-center !gap-5px !rounded-6px !border-none !px-7px !text-12px !text-t-secondary hover:!bg-fill-2 hover:!text-t-primary'
      >
        <AssistantAvatar assistant={selectedAssistant} size={16} />
        <span className='min-w-0 truncate'>{label}</span>
        <Down theme='outline' size={11} fill='currentColor' className='shrink-0' />
      </Button>
    </Dropdown>
  );
};

export default AssistantSelectionArea;
