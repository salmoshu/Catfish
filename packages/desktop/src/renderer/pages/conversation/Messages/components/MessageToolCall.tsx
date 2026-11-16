/** @license Copyright 2026 AionUi (aionui.com) SPDX-License-Identifier: Apache-2.0 */

import type { IMessageToolCall } from '@/common/chat/chatLib';
import React from 'react';
import MessageToolGroupSummary from './MessageToolGroupSummary';

const MessageToolCall: React.FC<{ message: IMessageToolCall; isProcessing?: boolean }> = ({
  message,
  isProcessing,
}) => <MessageToolGroupSummary messages={[message]} isProcessing={isProcessing} variant='step' />;

export default MessageToolCall;
