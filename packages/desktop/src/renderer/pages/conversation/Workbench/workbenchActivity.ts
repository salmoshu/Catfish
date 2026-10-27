import type { IMessageAcpTerminalOutput, TMessage } from '@/common/chat/chatLib';
import { normalizeToolMessages, type NormalizedToolCall, type ToolMessage } from '@/common/chat/normalizeToolCall';

export type WorkbenchSection = 'files' | 'changes' | 'preview' | 'terminal' | 'agents';

export type WorkbenchActivity = {
  terminals: IMessageAcpTerminalOutput[];
  agents: NormalizedToolCall[];
};

export const EMPTY_WORKBENCH_ACTIVITY: WorkbenchActivity = { terminals: [], agents: [] };

export const isAgentToolName = (name: string): boolean => /^(agent|task|subagent)(?:\b|:)/i.test(name.trim());

export const deriveWorkbenchActivity = (messages: TMessage[]): WorkbenchActivity => {
  const terminals = messages.filter(
    (message): message is IMessageAcpTerminalOutput => message.type === 'acp_terminal_output'
  );
  const toolMessages = messages.filter(
    (message): message is ToolMessage =>
      message.type === 'tool_group' || message.type === 'acp_tool_call' || message.type === 'tool_call'
  );
  const agents = normalizeToolMessages(toolMessages).filter((item) => isAgentToolName(item.name));
  return { terminals, agents };
};
