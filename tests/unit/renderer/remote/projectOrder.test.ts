import { describe, expect, it } from 'vitest';
import type { BackendEnvironment } from '@/common/types/remote';
import { buildProjectOrder } from '@/renderer/utils/workspace/projectOrder';
import type { EnvironmentProjects } from '@/renderer/utils/workspace/environmentProjects';

const local: BackendEnvironment = { type: 'local' };
const remote: BackendEnvironment = { type: 'remote', id: 'wsl', name: 'WSL', kind: 'wsl' };
const history: EnvironmentProjects[] = [
  {
    environment: local,
    projects: [
      { workspace: 'E:/LocalA', conversations: [{ id: 'a', name: 'A', modifiedAt: 1 }] },
      { workspace: 'E:/LocalB', conversations: [{ id: 'b', name: 'B', modifiedAt: 1 }] },
    ],
  },
  {
    environment: remote,
    projects: [
      { workspace: '/home/RemoteA', conversations: [{ id: 'ra', name: 'RA', modifiedAt: 1 }] },
      { workspace: '/home/RemoteB', conversations: [{ id: 'rb', name: 'RB', modifiedAt: 1 }] },
    ],
  },
];

const keys = (order: Map<string, number>) => [...order.entries()].toSorted((a, b) => a[1] - b[1]).map(([key]) => key);

describe('cross-environment project order', () => {
  it('keeps cached project positions regardless of which environment is active', () => {
    const order = buildProjectOrder(
      history,
      [{ environment: remote, workspace: '/home/RemoteB', conversationIds: ['rb'] }],
      new Map()
    );
    expect(keys(order)).toEqual([
      'local:E:/LocalA',
      'local:E:/LocalB',
      'remote:wsl:/home/RemoteA',
      'remote:wsl:/home/RemoteB',
    ]);
  });

  it('promotes only projects with real conversation activity', () => {
    const order = buildProjectOrder(
      history,
      [],
      new Map([
        ['rb', 100],
        ['b', 50],
      ])
    );
    expect(keys(order)).toEqual([
      'remote:wsl:/home/RemoteB',
      'local:E:/LocalB',
      'local:E:/LocalA',
      'remote:wsl:/home/RemoteA',
    ]);
  });

  it('places an uncached implicit default project after existing projects', () => {
    const order = buildProjectOrder(
      history,
      [{ environment: remote, workspace: '/home/CatfishCore', conversationIds: ['default'] }],
      new Map()
    );
    expect(order.get('remote:wsl:/home/CatfishCore')).toBe(5);
  });

  it('uses recent conversation activity even when no stream transition was observed', () => {
    const recentHistory: EnvironmentProjects[] = [
      {
        environment: local,
        projects: [{ workspace: 'E:/LocalA', conversations: [{ id: 'a', name: 'A', modifiedAt: 20 }] }],
      },
      {
        environment: remote,
        projects: [{ workspace: '/home/RemoteA', conversations: [{ id: 'ra', name: 'RA', modifiedAt: 100 }] }],
      },
    ];
    const order = buildProjectOrder(recentHistory, [], new Map());
    expect(keys(order)).toEqual(['remote:wsl:/home/RemoteA', 'local:E:/LocalA']);
  });
});
