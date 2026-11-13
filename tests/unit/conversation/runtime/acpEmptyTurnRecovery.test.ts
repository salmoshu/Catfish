import { describe, expect, it } from 'vitest';
import type { IResponseMessage } from '@/common/adapter/ipcBridge';
import { isRecoverableEmptyTurnTip } from '@/renderer/pages/conversation/runtime/useAcpEmptyTurnRecovery';

const tip = (code: string): IResponseMessage =>
  ({ type: 'tips', data: { code }, conversation_id: 'c1', msg_id: 'm1' }) as IResponseMessage;

describe('ACP empty-turn recovery', () => {
  it('only recovers the transient empty-turn code', () => {
    expect(isRecoverableEmptyTurnTip(tip('ACP_EMPTY_TURN_NEEDS_AUTH'))).toBe(true);
    expect(isRecoverableEmptyTurnTip(tip('ACP_EMPTY_TURN_TOKEN_LIMIT'))).toBe(false);
    expect(isRecoverableEmptyTurnTip({ ...tip('ACP_EMPTY_TURN_NEEDS_AUTH'), type: 'error' })).toBe(false);
  });
});
