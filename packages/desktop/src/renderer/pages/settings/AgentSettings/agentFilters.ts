import type { ManagedAgent } from '@/renderer/utils/model/agentTypes';

export type AgentAvailabilityFilter = 'all' | 'available' | 'unavailable';

const isAgentAvailable = (agent: ManagedAgent): boolean => agent.status === 'online';

export const getAgentAvailabilityFilterStats = (agents: ManagedAgent[]) => ({
  all: agents.length,
  available: agents.filter(isAgentAvailable).length,
  unavailable: agents.filter((agent) => !isAgentAvailable(agent)).length,
});

export const filterAgentsByAvailability = (agents: ManagedAgent[], filter: AgentAvailabilityFilter): ManagedAgent[] => {
  if (filter === 'available') {
    return agents.filter(isAgentAvailable);
  }
  if (filter === 'unavailable') {
    return agents.filter((agent) => !isAgentAvailable(agent));
  }
  return agents;
};

const managedAgentCatalogKey = (agent: ManagedAgent): string =>
  agent.agent_source === 'custom'
    ? `custom:${agent.id}`
    : `${agent.agent_type}:${agent.backend?.trim().toLowerCase() || agent.id}`;

/** Keep the local catalog visible in a remote view; remote health data wins for shared identities. */
export const mergeManagedAgentCatalogs = (
  localAgents: ManagedAgent[],
  remoteAgents: ManagedAgent[]
): ManagedAgent[] => {
  const merged = new Map<string, ManagedAgent>();
  for (const agent of [...localAgents, ...remoteAgents]) {
    merged.set(managedAgentCatalogKey(agent), agent);
  }
  return [...merged.values()];
};
