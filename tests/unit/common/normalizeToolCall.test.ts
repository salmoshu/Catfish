import { describe, expect, it } from 'vitest';
import type { IMessageAcpToolCall, IMessageToolCall, IMessageToolGroup } from '@/common/chat/chatLib';
import {
  getToolDisplayStatus,
  normalizeAcpToolCall,
  normalizeToolCall,
  normalizeToolGroup,
} from '@/common/chat/normalizeToolCall';

const acpMessage = (update: Record<string, unknown>): IMessageAcpToolCall =>
  ({
    id: 'message-1',
    conversation_id: 'conversation-1',
    type: 'acp_tool_call',
    content: { update: { tool_call_id: 'tool-1', status: 'completed', ...update } },
  }) as unknown as IMessageAcpToolCall;

describe('normalizeToolCall', () => {
  it('normalizes compact snake_case acp tool calls from history responses', () => {
    const result = normalizeAcpToolCall({
      id: 'message-1',
      conversation_id: 'conversation-1',
      type: 'acp_tool_call',
      content: {
        _compact: {
          truncated: true,
          original_size: 90000,
          preview_chars: 4096,
        },
        update: {
          session_update: 'tool_call',
          tool_call_id: 'tool-1',
          status: 'completed',
          title: 'rg',
          kind: 'search',
          raw_input: { pattern: 'needle', path: '.' },
          content: [{ type: 'content', content: { type: 'text', text: 'preview' } }],
        },
      },
    } as unknown as IMessageAcpToolCall);

    expect(result).toMatchObject({
      key: 'tool-1',
      name: 'rg',
      status: 'completed',
      description: '"needle"',
      output: 'preview',
      truncated: true,
      messageId: 'message-1',
      conversationId: 'conversation-1',
    });
  });

  it('uses the command purpose in the summary and retains the full command in details', () => {
    const result = normalizeAcpToolCall(
      acpMessage({
        kind: 'execute',
        title: 'Shell',
        raw_input: { command: 'bun run test -- --workers=1', description: '单线程复测滑块双击交互' },
      })
    );

    expect(result).toMatchObject({ action: 'execute', description: '单线程复测滑块双击交互' });
    expect(result?.input).toContain('bun run test -- --workers=1');
  });

  it('uses a descriptive agent title when no separate purpose is supplied', () => {
    const result = normalizeAcpToolCall(
      acpMessage({
        kind: 'execute',
        title: '验证轨迹与视图修复',
        rawInput: { command: 'bun run test' },
      })
    );
    expect(result).toMatchObject({ action: 'execute', description: '验证轨迹与视图修复' });
  });

  it('does not invent a command purpose or use the raw command as a summary', () => {
    const result = normalizeAcpToolCall(
      acpMessage({ kind: 'execute', title: 'Bash', rawInput: { command: 'bun run test' } })
    );
    expect(result?.action).toBe('execute');
    expect(result?.description).toBeUndefined();
  });

  it.each(['Shell Command', 'Run command', 'ExecuteCommand'])(
    'recognizes the generic backend caption %s without repeating it as the purpose',
    (title) => {
      const result = normalizeAcpToolCall(
        acpMessage({ kind: 'execute', title, raw_input: { command: 'bun run test' } })
      );
      expect(result?.action).toBe('execute');
      expect(result?.description).toBeUndefined();
    }
  );

  it.each(['/workspace/tests/track.spec.ts', 'C:\\workspace\\tests\\track.spec.ts'])(
    'summarizes file operations by file name while retaining %s in details',
    (path) => {
      const result = normalizeAcpToolCall(
        acpMessage({ kind: 'read', title: 'ReadFile', rawInput: { file_path: path } })
      );
      expect(result?.description).toBe('track.spec.ts');
      expect(JSON.parse(result?.input ?? '{}').file_path).toBe(path);
    }
  );

  it('does not relabel a custom execute tool as a shell command', () => {
    const result = normalizeAcpToolCall(
      acpMessage({ kind: 'execute', title: 'Image generation', rawInput: { prompt: 'a cat' } })
    );
    expect(result?.name).toBe('Image generation');
    expect(result?.action).toBeUndefined();
  });

  it('ignores malformed summary fields without exposing object string coercions', () => {
    const result = normalizeAcpToolCall(
      acpMessage({
        kind: 'read',
        title: 'ReadFile',
        rawInput: { file_path: { invalid: true }, description: ['invalid'] },
      })
    );
    expect(result?.description).toBeUndefined();
    expect(result?.input).toContain('invalid');
  });

  it('preserves an execution purpose in legacy tool groups instead of replacing it with the command', () => {
    const result = normalizeToolGroup({
      content: [
        {
          call_id: 'legacy-1',
          name: 'Shell',
          status: 'Success',
          description: 'Run focused tests',
          confirmationDetails: { type: 'exec', title: 'Command', command: 'bun run test' },
        },
      ],
    } as unknown as IMessageToolGroup);
    expect(result[0]).toMatchObject({ action: 'execute', description: 'Run focused tests' });
  });

  it('retains edit diffs and command purposes for native tool calls', () => {
    const result = normalizeToolCall({
      content: {
        call_id: 'native-1',
        name: 'Edit',
        args: { file_path: '/workspace/file.ts', old_string: 'before', new_string: 'after' },
      },
    } as unknown as IMessageToolCall);
    expect(result?.diffs).toEqual([{ path: '/workspace/file.ts', old_text: 'before', new_text: 'after' }]);
    expect(result?.description).toBe('file.ts');
  });

  it('keeps unknown tool names intact', () => {
    const result = normalizeAcpToolCall(acpMessage({ kind: 'other', title: 'constructor' }));
    expect(result?.name).toBe('constructor');
    expect(result?.action).toBeUndefined();
  });

  it('does not calculate a diff from truncated history previews', () => {
    const message = acpMessage({
      kind: 'edit',
      title: 'Edit',
      content: [{ type: 'diff', path: '/workspace/file.ts', old_text: 'partial', new_text: 'preview' }],
    });
    const result = normalizeAcpToolCall({
      ...message,
      content: { ...message.content, _compact: { truncated: true } },
    } as unknown as IMessageAcpToolCall);
    expect(result?.truncated).toBe(true);
    expect(result?.diffs).toBeUndefined();
  });

  it.each(['error', 'canceled', 'completed'] as const)('preserves a known %s outcome when a turn ends', (status) => {
    expect(getToolDisplayStatus(status, false)).toBe(status);
  });

  it.each(['pending', 'running'] as const)('marks an unfinished %s tool as incomplete after a turn ends', (status) => {
    expect(getToolDisplayStatus(status, false)).toBe('incomplete');
  });

  it('ignores malformed ACP content items while retaining valid diff data', () => {
    const result = normalizeAcpToolCall({
      id: 'message-2',
      conversation_id: 'conversation-1',
      type: 'acp_tool_call',
      content: {
        update: {
          session_update: 'tool_call',
          tool_call_id: 'tool-2',
          status: 'completed',
          title: 'Edit file',
          kind: 'edit',
          content: [null, 'invalid', { type: 'diff', path: '/workspace/file.ts', old_text: 'old', new_text: 'new' }],
        },
      },
    } as unknown as IMessageAcpToolCall);

    expect(result?.output).toBeUndefined();
    expect(result?.diffs).toEqual([{ path: '/workspace/file.ts', old_text: 'old', new_text: 'new' }]);
  });
});
