import type { IMessageAcpToolCall, IMessageToolCall, IMessageToolGroup } from './chatLib';
import { getAcpImagePath } from './acpToolCallOutput';

export type NormalizedToolStatus = 'pending' | 'running' | 'completed' | 'error' | 'canceled';
export type ToolDisplayStatus = NormalizedToolStatus | 'incomplete';
export type ToolAction =
  | 'read'
  | 'edit'
  | 'write'
  | 'execute'
  | 'output'
  | 'search'
  | 'list'
  | 'fetch'
  | 'delete'
  | 'wait';

export type NormalizedToolDiff = {
  path: string;
  old_text?: string | null;
  new_text?: string | null;
};

export type NormalizedToolCall = {
  key: string;
  name: string;
  status: NormalizedToolStatus;
  description?: string;
  action?: ToolAction;
  input?: string;
  output?: string;
  truncated?: boolean;
  messageId?: string;
  conversationId?: string;
  imagePath?: string;
  diffs?: NormalizedToolDiff[];
};

const stringField = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() ? value.trim() : undefined;

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;

const TOOL_ACTIONS: Record<string, ToolAction> = {
  read: 'read',
  readfile: 'read',
  fileread: 'read',
  edit: 'edit',
  editfile: 'edit',
  fileedit: 'edit',
  replace: 'edit',
  applypatch: 'edit',
  write: 'write',
  writefile: 'write',
  filewrite: 'write',
  createfile: 'write',
  execute: 'execute',
  exec: 'execute',
  execcommand: 'execute',
  executecommand: 'execute',
  runcommand: 'execute',
  shell: 'execute',
  shellcommand: 'execute',
  runshellcommand: 'execute',
  bash: 'execute',
  writestdin: 'output',
  terminaloutput: 'output',
  readcommandoutput: 'output',
  search: 'search',
  searchfiles: 'search',
  grep: 'search',
  glob: 'search',
  rg: 'search',
  list: 'list',
  listdirectory: 'list',
  fetch: 'fetch',
  webfetch: 'fetch',
  delete: 'delete',
  deletefile: 'delete',
  wait: 'wait',
  waitforresult: 'wait',
};

const actionForName = (name: string): ToolAction | undefined => {
  const key = name
    .replace(/^functions\./, '')
    .replace(/[\s_-]/g, '')
    .toLowerCase();
  return Object.hasOwn(TOOL_ACTIONS, key) ? TOOL_ACTIONS[key] : undefined;
};

const summarizeTool = (
  name: string,
  input: unknown,
  description?: string,
  kind?: string
): Pick<NormalizedToolCall, 'action' | 'description'> => {
  const fields = asRecord(input);
  const command = stringField(fields?.command) ?? stringField(fields?.cmd);
  const action =
    actionForName(name) ??
    // ACP execute also covers custom tools such as image generation. Only call it
    // a shell command when the payload or tool name establishes that meaning.
    (kind === 'execute' && !command ? undefined : actionForName(kind ?? ''));
  const purpose = stringField(fields?.description) ?? stringField(description);
  const path = stringField(fields?.file_path) ?? stringField(fields?.path) ?? stringField(fields?.file_name);
  const fileName = path?.split(/[/\\]/).findLast((part) => part.length > 0);
  const customTitle = action && !actionForName(name) && name !== command && name !== path ? name : undefined;
  const query = stringField(fields?.pattern) ?? stringField(fields?.query);

  return {
    action,
    description:
      (purpose !== command && purpose !== name ? purpose : undefined) ??
      customTitle ??
      (['read', 'edit', 'write', 'delete', 'list'].includes(action ?? '') ? fileName : undefined) ??
      (action === 'search' && query ? `"${query}"` : undefined) ??
      (action === 'fetch' ? stringField(fields?.url) : undefined),
  };
};

/** Preserve known outcomes; an ended turn does not prove unfinished tools succeeded. */
export const getToolDisplayStatus = (status: NormalizedToolStatus, isProcessing: boolean): ToolDisplayStatus =>
  !isProcessing && (status === 'pending' || status === 'running') ? 'incomplete' : status;

const formatValue = (value: unknown): string => {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};

// ===== tool_group → NormalizedToolCall[] =====

function normalizeToolGroupStatus(status: string): NormalizedToolStatus {
  switch (status) {
    case 'Success':
      return 'completed';
    case 'Error':
      return 'error';
    case 'Canceled':
      return 'canceled';
    case 'Pending':
      return 'pending';
    case 'Executing':
    case 'Confirming':
    default:
      return 'running';
  }
}

const getResultDisplayText = (
  result_display: IMessageToolGroup['content'][0]['result_display']
): string | undefined => {
  if (!result_display) return undefined;
  if (typeof result_display === 'string') return result_display;
  if ('file_diff' in result_display) return result_display.file_diff;
  if ('img_url' in result_display) return result_display.relative_path || result_display.img_url;
  return undefined;
};

/** Normalize legacy tool groups without replacing the supplied purpose with raw arguments. */
export function normalizeToolGroup(message: IMessageToolGroup): NormalizedToolCall[] {
  if (!Array.isArray(message.content)) return [];
  return message.content.map(({ name, call_id, description, confirmationDetails, status, result_display }) => {
    const type = confirmationDetails?.type;

    let input: string | undefined;
    if (confirmationDetails) {
      const { title: _title, type: _type, ...rest } = confirmationDetails;
      if (Object.keys(rest).length) input = formatValue(rest);
    } else if (description) {
      input = description;
    }

    return {
      key: call_id,
      name,
      status: normalizeToolGroupStatus(status),
      ...summarizeTool(name, confirmationDetails, description, type === 'exec' ? 'execute' : type),
      input,
      output: getResultDisplayText(result_display),
    };
  });
}

// ===== acp_tool_call → NormalizedToolCall =====

function normalizeAcpStatus(status: string): NormalizedToolStatus {
  switch (status) {
    case 'completed':
      return 'completed';
    case 'failed':
      return 'error';
    case 'canceled':
    case 'cancelled':
      return 'canceled';
    case 'in_progress':
      return 'running';
    case 'pending':
    default:
      return 'pending';
  }
}

type AcpToolCallUpdateCompat = IMessageAcpToolCall['content']['update'] & {
  session_update?: string;
  raw_input?: Record<string, unknown>;
};

type AcpToolCallContentCompat = IMessageAcpToolCall['content'] & {
  _compact?: {
    truncated?: boolean;
    original_size?: number;
    preview_chars?: number;
  };
  update?: AcpToolCallUpdateCompat;
};

/** Normalize live and persisted ACP tool updates while preserving complete details. */
export function normalizeAcpToolCall(message: IMessageAcpToolCall): NormalizedToolCall | undefined {
  const content = message.content as AcpToolCallContentCompat | undefined;
  const update = content?.update;
  if (!update) return undefined;

  const rawInput = update.rawInput ?? update.raw_input;
  const input = rawInput ? formatValue(rawInput) : undefined;

  const diffs: NormalizedToolDiff[] = Array.isArray(update.content)
    ? update.content.flatMap((item) => {
        if (typeof item !== 'object' || item === null || item.type !== 'diff' || typeof item.path !== 'string')
          return [];
        const hasOldText = typeof item.old_text === 'string';
        const hasNewText = typeof item.new_text === 'string';
        if (!hasOldText && !hasNewText) return [];
        return [
          {
            path: item.path,
            old_text: hasOldText ? item.old_text : undefined,
            new_text: hasNewText ? item.new_text : undefined,
          },
        ];
      })
    : [];

  let output: string | undefined;
  if (Array.isArray(update.content) && update.content.length) {
    output =
      update.content
        .map((item) => {
          if (typeof item !== 'object' || item === null) return '';
          if (item.type === 'content' && item.content?.text) return item.content.text;
          return '';
        })
        .filter(Boolean)
        .join('\n') || undefined;
  }

  const name = stringField(update.title) ?? update.kind ?? 'Tool';

  return {
    key: update.tool_call_id,
    name,
    status: normalizeAcpStatus(update.status),
    ...summarizeTool(name, rawInput, undefined, update.kind),
    input,
    output,
    truncated: content?._compact?.truncated === true,
    messageId: message.id,
    conversationId: message.conversation_id,
    imagePath: getAcpImagePath(update),
    diffs: diffs.length > 0 && !content?._compact?.truncated ? diffs : undefined,
  };
}

// ===== tool_call → NormalizedToolCall =====

function normalizeToolCallStatus(status?: string): NormalizedToolStatus {
  switch (status) {
    case 'completed':
      return 'completed';
    case 'error':
      return 'error';
    case 'running':
      return 'running';
    case 'canceled':
      return 'canceled';
    default:
      return 'pending';
  }
}

/** Normalize native tool calls into the same presentation used for ACP steps. */
export function normalizeToolCall(message: IMessageToolCall): NormalizedToolCall | undefined {
  const { call_id, name, status, input, output, args, description } = message.content;
  if (!call_id) return undefined;
  const fields = { ...asRecord(input), ...asRecord(args) };
  const path = stringField(fields.file_path) ?? stringField(fields.path) ?? stringField(fields.file_name);
  const before = fields.old_string ?? fields.old_text;
  const after = fields.new_string ?? fields.new_text ?? fields.content;
  const action = actionForName(name);
  const diffs: NormalizedToolDiff[] | undefined =
    (action === 'edit' || action === 'write') && path && typeof after === 'string'
      ? [{ path, old_text: typeof before === 'string' ? before : undefined, new_text: after }]
      : undefined;

  const displayInput = Object.keys(fields).length > 0 ? formatValue(fields) : input ? formatValue(input) : undefined;

  return {
    key: call_id,
    name,
    status: normalizeToolCallStatus(status),
    ...summarizeTool(name, fields, description),
    input: displayInput,
    output: output ?? stringField(message.content.error),
    diffs,
  };
}

// ===== Unified entry =====

export type ToolMessage = IMessageToolGroup | IMessageAcpToolCall | IMessageToolCall;

export function normalizeToolMessages(messages: ToolMessage[]): NormalizedToolCall[] {
  return messages
    .flatMap((m) => {
      if (m.type === 'tool_group') return normalizeToolGroup(m);
      if (m.type === 'acp_tool_call') return normalizeAcpToolCall(m);
      if (m.type === 'tool_call') return normalizeToolCall(m);
      return undefined;
    })
    .filter((item): item is NormalizedToolCall => item !== undefined);
}

export function hasRunningToolMessages(messages: ToolMessage[]): boolean {
  return messages.some((m) => {
    if (m.type === 'tool_group') {
      return Array.isArray(m.content) && m.content.some((t) => normalizeToolGroupStatus(t.status) === 'running');
    }
    if (m.type === 'acp_tool_call') {
      return m.content?.update && normalizeAcpStatus(m.content.update.status) === 'running';
    }
    if (m.type === 'tool_call') {
      return normalizeToolCallStatus(m.content?.status) === 'running';
    }
    return false;
  });
}
