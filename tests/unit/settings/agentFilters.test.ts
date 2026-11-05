/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import {
  filterAgentsByAvailability,
  getAgentAvailabilityFilterStats,
  mergeManagedAgentCatalogs,
  type AgentAvailabilityFilter,
} from '@/renderer/pages/settings/AgentSettings/agentFilters';
import type { ManagedAgent } from '@/renderer/utils/model/agentTypes';

const agent = (id: string, status: ManagedAgent['status'], backend = id): ManagedAgent =>
  ({
    id,
    backend,
    name: id,
    agent_type: 'acp',
    agent_source: 'builtin',
    enabled: true,
    installed: status !== 'missing',
    status,
  }) as ManagedAgent;

describe('agent availability filters', () => {
  const agents = [agent('a', 'offline'), agent('b', 'online'), agent('c', 'missing'), agent('d', 'online')];

  it('counts all, available, and unavailable agents', () => {
    expect(getAgentAvailabilityFilterStats(agents)).toEqual({ all: 4, available: 2, unavailable: 2 });
  });

  it.each<[AgentAvailabilityFilter, string[]]>([
    ['all', ['a', 'b', 'c', 'd']],
    ['available', ['b', 'd']],
    ['unavailable', ['a', 'c']],
  ])('filters %s agents without changing relative order', (filter, expectedIds) => {
    expect(filterAgentsByAvailability(agents, filter).map((item) => item.id)).toEqual(expectedIds);
  });
});

describe('remote agent catalog merging', () => {
  it('keeps local-only agents and lets remote health data replace shared rows', () => {
    const merged = mergeManagedAgentCatalogs(
      [agent('codex', 'online'), agent('kimi', 'online')],
      [agent('codex', 'offline')]
    );

    expect(merged.map((item) => item.id)).toEqual(['codex', 'kimi']);
    expect(merged[0].status).toBe('offline');
    expect(filterAgentsByAvailability(merged, 'available').map((item) => item.id)).toEqual(['kimi']);
    expect(getAgentAvailabilityFilterStats(merged)).toEqual({ all: 2, available: 1, unavailable: 1 });
  });
});
