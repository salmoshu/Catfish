import { describe, expect, it } from 'vitest';
import type { IMessageAcpToolCall, IMessageText, TMessage } from '@/common/chat/chatLib';
import {
  collectCompletedTurnFileChanges,
  collectMessageFileChanges,
  mergeFileChanges,
  parseDiff,
  parseFileChange,
  parseFileDiffs,
} from '@/renderer/utils/file/diffUtils';

const edit = (id: string, path = '/repo/file.ts', oldText = 'old\n', newText = 'new\n'): IMessageAcpToolCall => ({
  id,
  msg_id: id,
  conversation_id: 'conversation',
  type: 'acp_tool_call',
  position: 'left',
  content: {
    session_id: 'session',
    update: {
      sessionUpdate: 'tool_call_update',
      tool_call_id: id,
      title: 'Edit',
      kind: 'edit',
      status: 'completed',
      content: [{ type: 'diff', path, old_text: oldText, new_text: newText }],
    },
  },
});
const user = (id: string): IMessageText => ({
  id,
  msg_id: id,
  conversation_id: 'conversation',
  type: 'text',
  position: 'right',
  content: { content: 'Change files' },
});

describe('file change statistics', () => {
  it('counts Codex unified hunks without treating context and headers as inserted text', () => {
    const unified = '--- a/file.ts\n+++ b/file.ts\n@@ -1,2 +1,3 @@\n kept\n-old\n+new\n+extra\n';
    const change = parseFileChange('/repo/file.ts', null, unified);
    expect(change).toMatchObject({ fullPath: '/repo/file.ts', insertions: 2, deletions: 1, diff: unified });
  });

  it('counts newly created file contents when there is no old text', () => {
    expect(parseFileChange('new.ts', undefined, 'one\ntwo\n')).toMatchObject({ insertions: 2, deletions: 0 });
  });

  it('does not discard added or removed lines that begin with repeated signs', () => {
    expect(parseDiff('@@ -1 +1 @@\n---removed\n+++added\n')).toMatchObject({ insertions: 1, deletions: 1 });
  });

  it('counts hunk contents that look like file headers and skips actual headers in the next patch', () => {
    const diff =
      'diff --git a/a.txt b/a.txt\n--- a/a.txt\n+++ b/a.txt\n@@ -1 +1 @@\n--- removed\n+++ added\n' +
      'diff --git a/b.txt b/b.txt\n--- a/b.txt\n+++ b/b.txt\n@@ -1 +1 @@\n-before\n+after\n';
    expect(parseDiff(diff)).toMatchObject({ insertions: 2, deletions: 2 });
  });

  it('separates a patch touching multiple files', () => {
    const changes = parseFileDiffs(
      'diff --git a/a.ts b/a.ts\n-old\n+new\ndiff --git a/b.ts b/b.ts\n+one\n+two\n',
      'a.ts'
    );
    expect(changes.map(({ fullPath, insertions, deletions }) => ({ fullPath, insertions, deletions }))).toEqual([
      { fullPath: 'a.ts', insertions: 1, deletions: 1 },
      { fullPath: 'b.ts', insertions: 2, deletions: 0 },
    ]);
  });

  it('preserves an absolute path supplied by a structured tool result', () => {
    expect(parseFileDiffs('diff --git a/a.ts b/a.ts\n+one\n', 'E:\\repo\\a.ts')[0].fullPath).toBe('E:\\repo\\a.ts');
  });

  it('combines sequential edits to a Windows path into the final net change', () => {
    const changes = mergeFileChanges([
      parseFileChange('E:\\repo\\a.ts', 'old\n', 'middle\n'),
      parseFileChange('e:/repo/a.ts', 'middle\n', 'new\nextra\n'),
    ]);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ insertions: 2, deletions: 1, beforeText: 'old\n', afterText: 'new\nextra\n' });
  });

  it('omits an edit that was fully reverted before the turn ended', () => {
    expect(mergeFileChanges([parseFileChange('a.ts', 'old', 'new'), parseFileChange('a.ts', 'new', 'old')])).toEqual(
      []
    );
  });

  it('adds separate unified edits to the same file rather than losing earlier changes', () => {
    expect(
      mergeFileChanges([
        parseFileChange('a.ts', null, '@@ -1 +1 @@\n-old\n+new'),
        parseFileChange('a.ts', null, '@@ -2 +2,2 @@\n-two\n+three\n+four'),
      ])[0]
    ).toMatchObject({ insertions: 3, deletions: 2 });
  });
});

describe('completed-turn file summaries', () => {
  it('keeps earlier turns separate and leaves the running turn without a summary', () => {
    const summaries = collectCompletedTurnFileChanges(
      [user('q1'), edit('edit1'), user('q2'), edit('edit2', '/repo/b.ts')],
      true
    );
    expect(summaries).toHaveLength(1);
    expect(summaries[0].files.map((file) => file.fullPath)).toEqual(['/repo/file.ts']);
  });

  it('reports completed edits when the turn ends without a final text message', () => {
    expect(collectCompletedTurnFileChanges([user('q1'), edit('edit1')], false)[0].files).toHaveLength(1);
  });

  it('does not double-count repeated snapshots of one tool message', () => {
    const message = edit('edit1');
    expect(collectCompletedTurnFileChanges([message, message], false)[0].files[0].insertions).toBe(1);
  });

  it.each(['pending', 'in_progress', 'failed'] as const)('excludes %s edits from the completed summary', (status) => {
    const message = edit('edit1');
    message.content.update.status = status;
    expect(collectCompletedTurnFileChanges([message], false)).toEqual([]);
  });

  it('does not calculate statistics from compacted or hidden content', () => {
    const compact = edit('compact');
    Object.assign(compact.content, { _compact: { truncated: true } });
    expect(collectMessageFileChanges(compact, true)).toEqual([]);
    expect(collectMessageFileChanges({ ...edit('hidden'), hidden: true }, true)).toEqual([]);
  });

  it('includes successful legacy edits and ignores failed tools', () => {
    const messages: TMessage[] = [
      {
        id: 'legacy',
        msg_id: 'legacy',
        conversation_id: 'conversation',
        type: 'tool_call',
        position: 'left',
        content: {
          call_id: 'call',
          name: 'Edit',
          status: 'completed',
          args: { file_path: '/repo/a.ts', old_string: 'old', new_string: 'new' },
        },
      },
    ];
    expect(collectCompletedTurnFileChanges(messages, false)[0].files[0].fullPath).toBe('/repo/a.ts');
    const failed = { ...messages[0], content: { ...messages[0].content, error: 'denied' } } as TMessage;
    expect(collectCompletedTurnFileChanges([failed], false)).toEqual([]);
  });

  it('ignores non-file tool results and empty conversations', () => {
    expect(collectCompletedTurnFileChanges([], false)).toEqual([]);
    expect(collectMessageFileChanges(user('q'))).toEqual([]);
  });
});
