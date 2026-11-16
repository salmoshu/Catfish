/** @license Copyright 2026 AionUi (aionui.com) SPDX-License-Identifier: Apache-2.0 */

import type { IMessageAcpToolCall } from '@/common/chat/chatLib';
import React from 'react';
import MessageToolGroupSummary from '../components/MessageToolGroupSummary';

const MessageAcpToolCall: React.FC<{ message: IMessageAcpToolCall; isProcessing?: boolean }> = ({
  message,
  isProcessing,
}) => <MessageToolGroupSummary messages={[message]} isProcessing={isProcessing} variant='step' />;

export default MessageAcpToolCall;
