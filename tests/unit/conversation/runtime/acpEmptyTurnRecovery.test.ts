import { describe, expect, it } from 'vitest';
import type { IResponseMessage } from '@/common/adapter/ipcBridge';
import type { TMessage } from '@/common/chat/chatLib';
import {
  isRecoverableEmptyTurnTip,
  latestUserText,
} from '@/renderer/pages/conversation/runtime/useAcpEmptyTurnRecovery';

const tip = (code: string): IResponseMessage =>
  ({ type: 'tips', data: { code }, conversation_id: 'c1', msg_id: 'm1' }) as IResponseMessage;

describe('ACP empty-turn recovery', () => {
  it('only retries the transient empty-turn code', () => {
    expect(isRecoverableEmptyTurnTip(tip('ACP_EMPTY_TURN_NEEDS_AUTH'))).toBe(true);
    expect(isRecoverableEmptyTurnTip(tip('ACP_EMPTY_TURN_TOKEN_LIMIT'))).toBe(false);
    expect(isRecoverableEmptyTurnTip({ ...tip('ACP_EMPTY_TURN_NEEDS_AUTH'), type: 'error' })).toBe(false);
  });

  it('reuses the latest non-empty user text and skips assistant messages', () => {
    const messages = [
      { id: 'u1', type: 'text', position: 'right', content: { content: ' first ' } },
      { id: 'a1', type: 'text', position: 'left', content: { content: 'answer' } },
      { id: 'u2', type: 'text', position: 'right', content: { content: ' investigate the restart ' } },
      { id: 'tip', type: 'tips', position: 'left', content: { content: 'empty' } },
    ] as unknown as TMessage[];
    expect(latestUserText(messages)).toEqual({ id: 'u2', text: 'investigate the restart' });
    expect(latestUserText(messages.slice(0, 2))).toEqual({ id: 'u1', text: 'first' });
    expect(latestUserText(messages.slice(1, 2))).toBeNull();
  });
});
