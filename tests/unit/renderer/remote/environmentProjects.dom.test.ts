import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TChatConversation } from '@/common/config/storage';
import type { BackendEnvironment } from '@/common/types/remote';
import {
  environmentKey,
  forgetEnvironmentProjects,
  readEnvironmentProjects,
  recordEnvironmentProjects,
} from '@/renderer/utils/workspace/environmentProjects';

const remote: BackendEnvironment = { type: 'remote', id: 'wsl-1', name: 'Ubuntu', kind: 'wsl' };
const local: BackendEnvironment = { type: 'local' };
const conversation = (id: string, extra: Record<string, unknown> = {}): TChatConversation =>
  ({
    id,
    name: id,
    type: 'acp',
    created_at: 1,
    modified_at: 2,
    extra: { backend: 'kimi', workspace: '/repo', custom_workspace: true, ...extra },
    model: { api_key: 'must-not-be-cached' },
  }) as TChatConversation;

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe('environment project index', () => {
  it('retains local and remote projects separately even when their paths and conversation ids match', () => {
    recordEnvironmentProjects([conversation('same')], local);
    recordEnvironmentProjects([conversation('same')], remote);
    expect(readEnvironmentProjects().map((entry) => environmentKey(entry.environment))).toEqual([
      'local',
      'remote:wsl-1',
    ]);
    expect(readEnvironmentProjects().map((entry) => entry.projects[0].workspace)).toEqual(['/repo', '/repo']);
  });

  it('refreshes one environment without discarding other environments', () => {
    recordEnvironmentProjects([conversation('local')], local);
    recordEnvironmentProjects([conversation('remote')], remote);
    recordEnvironmentProjects([], remote);
    expect(readEnvironmentProjects().find((entry) => entry.environment.type === 'local')?.projects).toHaveLength(1);
    expect(readEnvironmentProjects().find((entry) => entry.environment.type === 'remote')?.projects).toEqual([]);
  });

  it('caches only display metadata and excludes temporary, team and health-check conversations', () => {
    recordEnvironmentProjects(
      [
        conversation('project', { custom_workspace: false, is_temporary_workspace: false }),
        conversation('temporary', { is_temporary_workspace: true }),
        conversation('team', { team_id: 'team-1' }),
        conversation('health', { is_health_check: true }),
      ],
      remote
    );
    expect(readEnvironmentProjects()[0].projects[0].conversations.map((item) => item.id)).toEqual(['project']);
    expect(JSON.stringify(readEnvironmentProjects())).not.toContain('must-not-be-cached');
  });

  it('forgets only the deleted connection', () => {
    recordEnvironmentProjects([conversation('local')], local);
    recordEnvironmentProjects([conversation('remote')], remote);
    forgetEnvironmentProjects('wsl-1');
    expect(readEnvironmentProjects().map((entry) => entry.environment.type)).toEqual(['local']);
  });

  it('ignores malformed stored history', () => {
    localStorage.setItem(
      'catfish:environment-projects:v1',
      JSON.stringify([{ environment: { type: 'remote' }, projects: [] }])
    );
    expect(readEnvironmentProjects()).toEqual([]);
    localStorage.setItem('catfish:environment-projects:v1', '{broken');
    expect(readEnvironmentProjects()).toEqual([]);
  });

  it('does not interrupt conversation loading when storage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('Quota exceeded');
    });
    expect(() => recordEnvironmentProjects([conversation('project')], local)).not.toThrow();
  });
});
