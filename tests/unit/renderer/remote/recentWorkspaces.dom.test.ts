import { beforeEach, describe, expect, it } from 'vitest';
import {
  addRecentWorkspace,
  getActiveRecentWorkspaceKey,
  getRecentWorkspaces,
} from '@renderer/components/workspace/recentWorkspaces';

describe('recentWorkspaces remote isolation', () => {
  beforeEach(() => {
    localStorage.clear();
    delete window.__backendEnvironment;
  });

  it('keeps local and remote paths in separate histories', () => {
    addRecentWorkspace('C:\\work\\local');
    window.__backendEnvironment = { type: 'remote', id: 'wsl-1', name: 'Ubuntu', kind: 'wsl' };
    addRecentWorkspace('/home/user/remote');

    expect(getRecentWorkspaces()).toEqual(['/home/user/remote']);
    expect(getActiveRecentWorkspaceKey()).toContain('wsl-1');
    delete window.__backendEnvironment;
    expect(getRecentWorkspaces()).toEqual(['C:\\work\\local']);
  });
});
