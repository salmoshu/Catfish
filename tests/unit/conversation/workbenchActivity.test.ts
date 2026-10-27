import { describe, expect, it } from 'vitest';
import type { IMessageAcpTerminalOutput, IMessageToolCall, TMessage } from '@/common/chat/chatLib';
import { deriveWorkbenchActivity, isAgentToolName } from '@/renderer/pages/conversation/Workbench/workbenchActivity';

const tool = (name: string): IMessageToolCall => ({
  id: `message-${name}`,
  conversation_id: 'conversation-1',
  type: 'tool_call',
  position: 'left',
  created_at: 1,
  content: { call_id: `call-${name}`, name, status: 'completed', args: {} },
});

const terminal: IMessageAcpTerminalOutput = {
  id: 'terminal-message-1',
  conversation_id: 'conversation-1',
  type: 'acp_terminal_output',
  position: 'left',
  created_at: 2,
  content: { terminal_id: 'terminal-1', command: 'bun test', output: 'ok' },
};

describe('workbench activity', () => {
  it('keeps real ACP terminals and Agent/Task calls while excluding ordinary tools', () => {
    const activity = deriveWorkbenchActivity([
      tool('Read'),
      tool('Task'),
      terminal,
      tool('Agent: explore'),
      {
        type: 'text',
        id: 'text-1',
        conversation_id: 'conversation-1',
        position: 'left',
        content: { content: 'plain' },
      } as TMessage,
    ]);

    expect(activity.terminals).toEqual([terminal]);
    expect(activity.agents.map((agent) => agent.name)).toEqual(['Task', 'Agent: explore']);
  });

  it('does not infer subagents from unrelated tool names', () => {
    expect(isAgentToolName('Tasklist')).toBe(false);
    expect(isAgentToolName('Read')).toBe(false);
    expect(isAgentToolName('Subagent')).toBe(true);
  });
});
