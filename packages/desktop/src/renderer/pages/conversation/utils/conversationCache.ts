/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { isBackendHttpError } from '@/common/adapter/httpBridge';
import type { TChatConversation } from '@/common/config/storage';
import type { BackendEnvironment } from '@/common/types/remote';
import {
  backendCacheKey,
  getActiveBackendEnvironment,
  isActiveBackendEnvironment,
} from '@/renderer/utils/workspace/backendCache';
import { mutate } from 'swr';

export class ConversationEnvironmentChangedError extends Error {
  constructor() {
    super('Conversation lookup was superseded by a backend environment change');
    this.name = 'ConversationEnvironmentChangedError';
  }
}

const assertActiveEnvironment = (environment: BackendEnvironment): void => {
  if (!isActiveBackendEnvironment(environment)) throw new ConversationEnvironmentChangedError();
};

export async function getConversationOrNull(
  conversation_id: string,
  environment?: BackendEnvironment
): Promise<(TChatConversation & { name_source?: 'user' | 'agent' | 'auto' }) | null> {
  if (environment) assertActiveEnvironment(environment);
  try {
    const conversation = await ipcBridge.conversation.get.invoke({ id: conversation_id });
    if (environment) assertActiveEnvironment(environment);
    return conversation;
  } catch (error) {
    if (environment && !isActiveBackendEnvironment(environment)) {
      throw new ConversationEnvironmentChangedError();
    }
    if (isBackendHttpError(error) && error.status === 404 && error.code === 'NOT_FOUND') {
      return null;
    }
    throw error;
  }
}

export async function refreshConversationCache(conversation_id: string): Promise<void> {
  const environment = getActiveBackendEnvironment();
  const conversation = await getConversationOrNull(conversation_id, environment);
  if (!conversation) return;

  await mutate<TChatConversation>(backendCacheKey('conversation', conversation_id, environment), conversation, false);
}
