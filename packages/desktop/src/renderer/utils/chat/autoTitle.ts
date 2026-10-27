import type { TMessage } from '@/common/chat/chatLib';
import { readMessageContent } from '@/renderer/utils/chat/conversationExport';
import { hasThinkTags, stripThinkTags } from '@/renderer/utils/chat/thinkTagFilter';

/** Returns true when content starts with an Assistant Rules marker. */
export const hasAssistantRulesPrefix = (content: string): boolean => /^\s*\[Assistant Rules](?=\s|$)/i.test(content);

export const buildAutoTitleFromContent = (content: string): string | null => {
  if (hasAssistantRulesPrefix(content) && !/\[\/Assistant Rules]/i.test(content)) {
    return null;
  }
  const withoutAssistantRules = content.replace(/^\s*\[Assistant Rules\][\s\S]*?\[\/Assistant Rules\]\s*/i, '');
  const withoutThinkTags = hasThinkTags(withoutAssistantRules)
    ? stripThinkTags(withoutAssistantRules)
    : withoutAssistantRules;
  const lines = withoutThinkTags
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && line !== '```');

  const firstLine = lines[0] ?? '';
  const normalized = firstLine
    .replace(/^[#>*\-\d.\s]+/u, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 50);

  return normalized || null;
};

/**
 * Pick the very first user prompt from conversation history.
 * Falls back to the current send-box content when history has no user prompt yet.
 */
export const deriveAutoTitleFromMessages = (messages: TMessage[], fallbackContent?: string): string | null => {
  for (const message of messages) {
    if (message.type !== 'text' || message.position !== 'right') {
      continue;
    }

    const title = buildAutoTitleFromContent(readMessageContent(message));
    if (title) {
      return title;
    }
  }

  if (fallbackContent) {
    return buildAutoTitleFromContent(fallbackContent);
  }

  return null;
};
