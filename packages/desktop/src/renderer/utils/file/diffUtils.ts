/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TMessage } from '@/common/chat/chatLib';
import { createTwoFilesPatch } from 'diff';

/**
 * 从 diff 内容中解析文件路径
 * Parse file path from diff content
 *
 * 支持多种 diff 格式：
 * - Index: path/to/file.tsx
 * - --- a/path/to/file.tsx
 * - +++ b/path/to/file.tsx
 *
 * @param diffContent diff 内容
 * @returns 文件相对路径，如果无法解析则返回 null
 */
export function parseFilePathFromDiff(diffContent: string): string | null {
  const lines = diffContent.split('\n');

  // 尝试 Index: 格式（SVN 风格）
  for (const line of lines) {
    if (line.startsWith('Index: ')) {
      return line.substring(7).trim();
    }
  }

  // 尝试 git diff 格式 (+++ b/ 优先，因为它指向新文件)
  for (const line of lines) {
    if (line.startsWith('+++ b/')) {
      return line.substring(6).trim();
    }
  }

  // 回退到 --- a/ 格式
  for (const line of lines) {
    if (line.startsWith('--- a/')) {
      return line.substring(6).trim();
    }
  }

  return null;
}

/**
 * 从 diff 中提取实际文件内容（去除元数据）
 * Extract actual file content from diff (remove metadata)
 *
 * @param diffContent diff 内容
 * @returns 提取后的纯净文件内容
 */
export function extractContentFromDiff(diffContent: string): string {
  const lines = diffContent.split('\n');
  const contentLines: string[] = [];
  let inDiffBlock = false;

  for (const line of lines) {
    // 跳过 diff 元数据行 / Skip diff metadata lines
    if (
      line.startsWith('Index:') ||
      line.match(/^={3,}/) ||
      line.startsWith('diff --git') ||
      line.startsWith('---') ||
      line.startsWith('+++') ||
      line.startsWith('@@')
    ) {
      inDiffBlock = true;
      continue;
    }

    if (inDiffBlock) {
      // 提取新增行（去掉开头的 + 号）/ Extract added lines (remove leading +)
      if (line.startsWith('+')) {
        contentLines.push(line.substring(1));
      }
      // 跳过删除行和上下文标记 / Skip deleted lines and context markers
      else if (line.startsWith('-') || line.startsWith('\\')) {
        continue;
      }
      // 空行也保留 / Keep empty lines too
      else {
        contentLines.push(line);
      }
    }
  }

  return contentLines.join('\n').trim();
}

/**
 * File change info including diff content
 */
export type FileChangeInfo = {
  /** File name */
  file_name: string;
  /** Full path */
  fullPath: string;
  /** Number of insertions */
  insertions: number;
  /** Number of deletions */
  deletions: number;
  /** Raw diff content */
  diff: string;
  beforeText?: string;
  afterText?: string;
};

/**
 * Parse unified diff format, extract file info and change statistics
 *
 * @param diff Unified diff string
 * @param file_nameHint Optional filename hint when diff header is missing
 * @returns Parsed file change info
 */
export const parseDiff = (diff: string, file_nameHint?: string): FileChangeInfo => {
  const lines = diff.split('\n');

  // Extract filename
  const gitLine = lines.find((line) => line.startsWith('diff --git'));
  let file_name = file_nameHint || 'Unknown file';
  let fullPath = file_nameHint || 'Unknown file';

  if (gitLine) {
    const match = gitLine.match(/diff --git a\/(.+) b\/(.+)/);
    if (match) {
      fullPath = match[2];
      file_name = fullPath.split('/').pop() || fullPath;
    }
  } else {
    const parsedPath = parseFilePathFromDiff(diff);
    if (parsedPath) {
      fullPath = parsedPath;
      file_name = parsedPath.split(/[\\/]/).pop() || parsedPath;
    } else if (file_nameHint) {
      file_name = file_nameHint.split(/[\\/]/).pop() || file_nameHint;
      fullPath = file_nameHint;
    }
  }

  // Calculate insertions and deletions
  let insertions = 0;
  let deletions = 0;
  let inHunk = false;

  for (const line of lines) {
    if (line.startsWith('diff --git') || line.startsWith('Index:')) {
      inHunk = false;
      continue;
    }
    if (line.startsWith('@@')) {
      inHunk = true;
      continue;
    }
    // Skip diff header lines
    if (
      line.startsWith('index ') ||
      (!inHunk && (/^---(?:\s|$)/.test(line) || /^\+\+\+(?:\s|$)/.test(line))) ||
      line.startsWith('\\')
    ) {
      continue;
    }

    if (line.startsWith('+')) {
      insertions++;
    } else if (line.startsWith('-')) {
      deletions++;
    }
  }

  return {
    file_name,
    fullPath,
    insertions,
    deletions,
    diff,
  };
};

/** Preserve an agent's unified diff, or compare its before/after snapshots. */
export function parseFileChange(path: string, oldText: string | null | undefined, newText: string): FileChangeInfo {
  const unified = oldText == null && /^(?:diff --git |Index: |@@ |--- .+\r?\n\+\+\+ )/m.test(newText);
  const diff = unified ? newText : createTwoFilesPatch(path, path, oldText ?? '', newText, '', '', { context: 3 });
  return {
    ...parseDiff(diff, path),
    fullPath: path,
    file_name: path.split(/[\\/]/).pop() || path,
    ...(!unified ? { beforeText: oldText ?? '', afterText: newText } : {}),
  };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Split a multi-file unified diff without combining unrelated file statistics. */
export function parseFileDiffs(diff: string, path: string): FileChangeInfo[] {
  const parts = diff
    .split(/(?=^diff --git )/m)
    .filter((part) => part.trim() && (!diff.includes('diff --git ') || part.startsWith('diff --git ')));
  return parts.map((part) => {
    const file = parseDiff(part, path);
    return parts.length === 1 && /[\\/]/.test(path)
      ? { ...file, fullPath: path, file_name: path.split(/[\\/]/).pop() || path }
      : file;
  });
}

/** Extract successful edits from all supported message transports. */
export function collectMessageFileChanges(message: TMessage, completedOnly = false): FileChangeInfo[] {
  if (message.hidden) return [];
  if (message.type === 'acp_tool_call') {
    const content = message.content as typeof message.content & { _compact?: { truncated?: boolean } };
    const update = content?.update;
    if (!update || content._compact?.truncated || update.status === 'failed') return [];
    if (completedOnly && update.status !== 'completed') return [];
    if (!Array.isArray(update.content) || !update.content.every(isRecord)) return [];
    const diffs = update.content.filter((item) => item.type === 'diff');
    if (
      diffs.some(
        (item) =>
          typeof item.path !== 'string' ||
          !item.path.trim() ||
          (typeof item.old_text !== 'string' && typeof item.new_text !== 'string')
      )
    )
      return [];
    return diffs.flatMap((item) =>
      item.type === 'diff' && item.path && (typeof item.old_text === 'string' || typeof item.new_text === 'string')
        ? [parseFileChange(item.path, item.old_text, item.new_text ?? '')]
        : []
    );
  }
  if (message.type === 'tool_group') {
    if (!Array.isArray(message.content)) return [];
    return message.content.flatMap((item) => {
      if (item.status === 'Error' || item.status === 'Canceled' || (completedOnly && item.status !== 'Success'))
        return [];
      const result: unknown = item.result_display;
      if (isRecord(result) && typeof result.file_diff === 'string' && typeof result.file_name === 'string') {
        return parseFileDiffs(result.file_diff, result.file_name);
      }
      if (!completedOnly && item.confirmationDetails?.type === 'edit') {
        return parseFileDiffs(item.confirmationDetails.file_diff, item.confirmationDetails.file_name);
      }
      return [];
    });
  }
  if (message.type === 'tool_call') {
    const tool = message.content;
    if (tool.error || tool.status === 'error' || (completedOnly && tool.status === 'running')) return [];
    if (!/^(?:replace|edit|write|write_file|writefile)$/i.test(tool.name)) return [];
    const input: Record<string, unknown> = { ...tool.input, ...tool.args };
    const path = input.file_path ?? input.path ?? input.file_name;
    if (typeof path !== 'string' || !path.trim()) return [];
    const before = input.old_string ?? input.old_text;
    const after = input.new_string ?? input.new_text ?? input.content;
    if (typeof after !== 'string') return [];
    return [parseFileChange(path, typeof before === 'string' ? before : undefined, after)];
  }
  return [];
}

/** Combine repeated edits to each path, retaining a usable diff for preview. */
export function mergeFileChanges(changes: FileChangeInfo[]): FileChangeInfo[] {
  const files = new Map<string, FileChangeInfo>();
  for (const change of changes) {
    let key = change.fullPath.replace(/\\/g, '/');
    if (/^[a-z]:\//i.test(key)) key = key.toLowerCase();
    const previous = files.get(key);
    if (!previous) {
      files.set(key, { ...change });
    } else if (
      previous.beforeText !== undefined &&
      previous.afterText === change.beforeText &&
      change.afterText !== undefined
    ) {
      files.set(key, parseFileChange(previous.fullPath, previous.beforeText, change.afterText));
    } else {
      files.set(key, {
        ...change,
        insertions: previous.insertions + change.insertions,
        deletions: previous.deletions + change.deletions,
        diff: `${previous.diff}\n${change.diff}`,
        beforeText: undefined,
        afterText: undefined,
      });
    }
  }
  return [...files.values()].filter((file) => file.beforeText === undefined || file.beforeText !== file.afterText);
}

/** Summarize completed user turns while leaving the currently running turn alone. */
export function collectCompletedTurnFileChanges(
  messages: TMessage[],
  isProcessing: boolean
): Array<{
  sourceMessageIds: string[];
  files: FileChangeInfo[];
}> {
  const summaries: Array<{ sourceMessageIds: string[]; files: FileChangeInfo[] }> = [];
  let turn: TMessage[] = [];
  const flush = (active: boolean): void => {
    if (!active) {
      const uniqueMessages = [...new Map(turn.map((message) => [message.id, message])).values()];
      const files = mergeFileChanges(uniqueMessages.flatMap((message) => collectMessageFileChanges(message, true)));
      if (files.length > 0) summaries.push({ sourceMessageIds: turn.map((message) => message.id), files });
    }
    turn = [];
  };
  for (const message of messages) {
    if (message.hidden) continue;
    if (message.position === 'right') flush(false);
    else turn.push(message);
  }
  flush(isProcessing);
  return summaries;
}
