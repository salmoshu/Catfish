import fs from 'fs';
import os from 'os';
import path from 'path';
import type { Page } from '@playwright/test';
import { expect, test } from '../../../fixtures';
import { findAssistantIdForBackend, goToGuid } from '../../../helpers';
import { httpDelete, httpPost } from '../../../helpers/httpBridge';

const ENABLED_CONVERSATION_KEY = 'aionui:e2e-message-stream-conversation-id';

type CreatedConversation = {
  id: string;
};

type FileChangeController = {
  emitFileChange: (path: string, oldText: string, newText: string) => Promise<void>;
};

type StreamRegistry = {
  controllers: Record<string, FileChangeController>;
};

async function ensureRendererReady(page: Page): Promise<void> {
  await page.waitForFunction(
    () =>
      window.location.href !== 'about:blank' &&
      ((window as unknown as { __backendPort?: number }).__backendPort ?? 0) > 0,
    undefined,
    { timeout: 30_000 }
  );
}

async function createAcpConversation(page: Page, workspace: string): Promise<string> {
  await goToGuid(page);
  await ensureRendererReady(page);
  const assistantId = await findAssistantIdForBackend(page, 'codex');

  if (!assistantId) {
    throw new Error('No builtin Codex assistant found for ACP file-change card rendering');
  }

  const conversation = await httpPost<CreatedConversation>(page, '/api/conversations', {
    name: `E2E ACP file change ${Date.now()}`,
    assistant: { id: assistantId },
    extra: {
      workspace,
      custom_workspace: true,
      session_mode: 'full-access',
    },
  });

  if (!conversation?.id) {
    throw new Error('POST /api/conversations succeeded but did not return a conversation id');
  }

  return conversation.id;
}

async function openConversationPage(page: Page, conversationId: string): Promise<void> {
  await goToGuid(page);
  await page.evaluate(
    ({ currentConversationId, storageKey }) => {
      window.sessionStorage.setItem(storageKey, currentConversationId);
    },
    { currentConversationId: conversationId, storageKey: ENABLED_CONVERSATION_KEY }
  );

  const baseUrl = page.url().split('#')[0];
  await page.goto(`${baseUrl}#/conversation/${conversationId}`);
  await page.waitForSelector('[data-testid="sendbox-input"]', { timeout: 30_000 });
}

test('shows edit paths and completed-turn totals with file and diff previews', async ({
  page,
  electronApp,
}, testInfo) => {
  test.setTimeout(90_000);
  let conversationId: string | null = null;
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'catfish-file-change-'));
  const filePath = path.join(workspace, 'research-summary.md');

  try {
    fs.writeFileSync(filePath, 'after\nsecond line');
    conversationId = await createAcpConversation(page, workspace);
    await openConversationPage(page, conversationId);

    await page.waitForFunction(
      (id) => {
        const registry = (window as typeof window & { __AIONUI_E2E_MESSAGE_STREAM__?: StreamRegistry })
          .__AIONUI_E2E_MESSAGE_STREAM__;
        return Boolean(registry?.controllers[id]);
      },
      conversationId,
      { timeout: 15_000 }
    );

    await page.evaluate(
      async ({ id, filePath: changedPath }) => {
        const registry = (window as typeof window & { __AIONUI_E2E_MESSAGE_STREAM__?: StreamRegistry })
          .__AIONUI_E2E_MESSAGE_STREAM__;
        const controller = registry?.controllers[id];
        if (!controller) throw new Error(`No E2E stream controller registered for conversation ${id}`);
        await controller.emitFileChange(changedPath, 'before', 'after\nsecond line');
      },
      { id: conversationId, filePath }
    );

    const fileChange = page.locator('[data-testid="message-acp_tool_call-left"]').last();
    await expect(fileChange).toBeVisible();
    await expect(fileChange).toContainText('research-summary.md');
    await expect(fileChange).toContainText('+2');
    await expect(fileChange.getByText('research-summary.md', { exact: true })).toHaveCount(1);
    await expect(fileChange).not.toContainText('Tool Call ID');
    const summary = page.locator('[data-testid="turn-file-summary"] [data-file-changes="summary"]');
    await expect(summary).toBeVisible();
    await expect(summary).toContainText('research-summary.md');
    await testInfo.attach('file-change-cards', { body: await page.screenshot(), contentType: 'image/png' });

    await fileChange.getByText('+2', { exact: true }).click();
    const previewPanel = page.locator('.preview-panel:visible');
    await expect(previewPanel).toBeVisible({ timeout: 10_000 });
    await expect(previewPanel).toContainText('research-summary.md', { timeout: 10_000 });

    await page.getByTestId('conversation-agent-tab').click();
    await fileChange.getByRole('button', { name: filePath, exact: true }).click();
    await expect(previewPanel).toContainText('after', { timeout: 10_000 });
    await expect(previewPanel).toContainText('second line');
    await page.getByTestId('conversation-agent-tab').click();
  } finally {
    if (conversationId) {
      await httpDelete(page, `/api/conversations/${encodeURIComponent(conversationId)}`).catch(() => {});
    }
    await electronApp.close();
    fs.rmSync(workspace, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
});
