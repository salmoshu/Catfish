import type { TChatConversation } from '@/common/config/storage';
import type { BackendEnvironment } from '@/common/types/remote';

const STORAGE_KEY = 'catfish:environment-projects:v1';
export const ENVIRONMENT_PROJECTS_CHANGED = 'catfish:environment-projects-changed';

export type EnvironmentProject = {
  workspace: string;
  conversations: Array<{ id: string; name: string; modifiedAt: number }>;
};

export type EnvironmentProjects = {
  environment: BackendEnvironment;
  projects: EnvironmentProject[];
};

/** Return a stable environment identity without conflating equal paths on different hosts. */
export const environmentKey = (environment: BackendEnvironment): string =>
  environment.type === 'local' ? 'local' : `remote:${environment.id}`;

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

const isHistory = (value: unknown): value is EnvironmentProjects => {
  if (!isRecord(value) || !isRecord(value.environment) || !Array.isArray(value.projects)) return false;
  const environment = value.environment;
  if (
    environment.type !== 'local' &&
    !(
      environment.type === 'remote' &&
      typeof environment.id === 'string' &&
      typeof environment.name === 'string' &&
      ['ssh', 'wsl', 'docker'].includes(String(environment.kind))
    )
  )
    return false;
  return value.projects.every(
    (project: unknown) =>
      isRecord(project) &&
      typeof project.workspace === 'string' &&
      Array.isArray(project.conversations) &&
      project.conversations.every(
        (conversation: unknown) =>
          isRecord(conversation) &&
          typeof conversation.id === 'string' &&
          typeof conversation.name === 'string' &&
          typeof conversation.modifiedAt === 'number'
      )
  );
};

/** Read the sidebar's display-only project index; malformed or unavailable storage is ignored. */
export const readEnvironmentProjects = (): EnvironmentProjects[] => {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
    return Array.isArray(stored) ? stored.filter(isHistory) : [];
  } catch {
    return [];
  }
};

const writeHistory = (history: EnvironmentProjects[]): void => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
    window.dispatchEvent(new Event(ENVIRONMENT_PROJECTS_CHANGED));
  } catch {
    // A full or unavailable browser store must not prevent loading conversations.
  }
};

/** Save project names and conversation identities, excluding models, credentials, messages and runtime state. */
export const recordEnvironmentProjects = (
  conversations: TChatConversation[],
  environment: BackendEnvironment | undefined = typeof window === 'undefined' ? undefined : window.__backendEnvironment
): void => {
  if (!environment) return;
  const projects = new Map<string, EnvironmentProject>();
  for (const conversation of conversations) {
    const extra = conversation.extra as Record<string, unknown> | undefined;
    const workspace = extra?.workspace;
    if (
      typeof workspace !== 'string' ||
      !workspace ||
      extra?.is_temporary_workspace === true ||
      !(extra?.custom_workspace === true || extra?.is_temporary_workspace === false) ||
      extra?.team_id ||
      extra?.teamId ||
      extra?.is_health_check
    )
      continue;
    let project = projects.get(workspace);
    if (!project) {
      project = { workspace, conversations: [] };
      projects.set(workspace, project);
    }
    project.conversations.push({
      id: conversation.id,
      name: conversation.name,
      modifiedAt: conversation.modified_at ?? conversation.created_at ?? 0,
    });
  }
  const key = environmentKey(environment);
  const history = readEnvironmentProjects();
  const previous = history.find((entry) => environmentKey(entry.environment) === key);
  const previousWorkspaces = new Map(previous?.projects.map((project) => [project.workspace, project]) ?? []);
  const orderedProjects = [
    ...(previous?.projects.filter((project) => projects.has(project.workspace)) ?? []),
    ...[...projects.values()].filter((project) => !previousWorkspaces.has(project.workspace)),
  ].map((project) => ({
    ...projects.get(project.workspace)!,
    conversations: projects.get(project.workspace)!.conversations.toSorted((a, b) => b.modifiedAt - a.modifiedAt),
  }));
  const next = { environment, projects: orderedProjects };
  const index = history.findIndex((entry) => environmentKey(entry.environment) === key);
  if (index === -1) {
    writeHistory([...history, next]);
    return;
  }
  writeHistory(history.map((entry, entryIndex) => (entryIndex === index ? next : entry)));
};

/** Remove cached project entries when their saved remote connection is deleted. */
export const forgetEnvironmentProjects = (id: string): void => {
  writeHistory(readEnvironmentProjects().filter((entry) => environmentKey(entry.environment) !== `remote:${id}`));
};
