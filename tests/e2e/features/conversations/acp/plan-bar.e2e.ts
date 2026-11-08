import fs from 'fs';
import os from 'os';
import path from 'path';
import type { Page } from '@playwright/test';
import { test, expect } from '../../../fixtures';
import { findAssistantIdForBackend, goToGuid } from '../../../helpers';
import { httpDelete, httpPost } from '../../../helpers/httpBridge';

const ENABLED_CONVERSATION_KEY = 'aionui:e2e-message-stream-conversation-id';

type PlanEntry = { content: string; status: 'pending' | 'in_progress' | 'completed' };

type PlanController = {
  emitPlan: (entries: PlanEntry[], options?: { msgId?: string; turnId?: string }) => Promise<void>;
  endPlanTurn: (options?: { turnId?: string }) => Promise<void>;
};

type StreamRegistry = {
  controllers: Record<string, PlanController>;
};

const ENTRIES: PlanEntry[] = [
  { content: 'E2E read the readme', status: 'pending' },
  { content: 'E2E count the files', status: 'pending' },
  { content: 'E2E summarize', status: 'pending' },
];

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
  // No `requireAvailable`: this test never talks to the agent — it drives the UI
  // through the E2E stream injector — so a detected CLI binary is not a
  // precondition, and requiring one would silently skip the whole guard.
  const assistantId = await findAssistantIdForBackend(page, 'codex');
  test.skip(!assistantId, 'No Codex assistant registered for the plan bar test');
  if (!assistantId) return '';

  const conversation = await httpPost<{ id: string }>(page, '/api/conversations', {
    name: `E2E plan bar ${Date.now()}`,
    assistant: { id: assistantId },
    extra: { workspace, custom_workspace: true, session_mode: 'full-access' },
  });
  if (!conversation?.id) {
    throw new Error('POST /api/conversations succeeded but did not return a conversation id');
  }
  return conversation.id;
}

async function openConversationPage(page: Page, conversationId: string): Promise<void> {
  await ensureRendererReady(page);
  await goToGuid(page);
  await page.evaluate(
    ({ currentConversationId, storageKey }) => {
      window.sessionStorage.setItem(storageKey, currentConversationId);
    },
    { currentConversationId: conversationId, storageKey: ENABLED_CONVERSATION_KEY }
  );

  const baseUrl = page.url().split('#')[0];
  await page.goto(`${baseUrl}#/conversation/${conversationId}`);
  await page.waitForLoadState('domcontentloaded');
  // A brand-new conversation renders the empty state, NOT the message scroller,
  // so wait on the send box: it is present in both states and is the anchor the
  // plan bar sits directly above.
  await page.waitForSelector('[data-testid="sendbox-input"]', { timeout: 30_000 });
}

async function waitForController(page: Page, conversationId: string): Promise<void> {
  await page.waitForFunction(
    (id) => {
      const registry = (window as typeof window & { __AIONUI_E2E_MESSAGE_STREAM__?: StreamRegistry })
        .__AIONUI_E2E_MESSAGE_STREAM__;
      return Boolean(registry?.controllers[id]);
    },
    conversationId,
    { timeout: 15_000 }
  );
}

async function emitPlan(page: Page, conversationId: string, entries: PlanEntry[]): Promise<void> {
  await page.evaluate(
    async ({ id, injected }) => {
      const registry = (window as typeof window & { __AIONUI_E2E_MESSAGE_STREAM__?: StreamRegistry })
        .__AIONUI_E2E_MESSAGE_STREAM__;
      const controller = registry?.controllers[id];
      if (!controller) throw new Error(`No E2E stream controller registered for conversation ${id}`);
      await controller.emitPlan(injected);
    },
    { id: conversationId, injected: entries }
  );
}

async function endPlanTurn(page: Page, conversationId: string): Promise<void> {
  await page.evaluate(async (id) => {
    const registry = (window as typeof window & { __AIONUI_E2E_MESSAGE_STREAM__?: StreamRegistry })
      .__AIONUI_E2E_MESSAGE_STREAM__;
    const controller = registry?.controllers[id];
    if (!controller) throw new Error(`No E2E stream controller registered for conversation ${id}`);
    await controller.endPlanTurn();
  }, conversationId);
}

test.describe('conversation plan bar', () => {
  test('shows live plan progress and keeps the completed plan visible', async ({ page, electronApp }, testInfo) => {
    let conversationId: string | null = null;
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'catfish-plan-'));

    try {
      conversationId = await createAcpConversation(page, workspace);
      await openConversationPage(page, conversationId);
      await waitForController(page, conversationId);

      const bar = page.locator('[data-testid="conversation-plan-bar"]');
      await expect(bar).toHaveCount(0);
      await page.evaluate(() => {
        const workspace =
          document.querySelector('[data-project-panel-host]') ?? document.querySelector('.chat-layout-right-sider');
        if (workspace && workspace.getBoundingClientRect().width > 0) {
          window.dispatchEvent(new CustomEvent('aionui-workspace-toggle', { cancelable: true }));
        }
      });
      const planTrigger = page.locator(`[data-plan-card-slot="${conversationId}"] button`);
      await planTrigger.click();
      const dockedPlan = page.locator(
        `[data-plan-panel-slot="${conversationId}"] [data-testid="conversation-plan-bar"]`
      );
      await expect(dockedPlan).toBeVisible();

      // 1. The plan appears, expanded, with every entry and a 0/3 progress label.
      await emitPlan(page, conversationId, ENTRIES);
      await expect(bar).toBeVisible({ timeout: 15_000 });
      await expect(bar).toContainText('0/3');
      for (const entry of ENTRIES) {
        await expect(bar).toContainText(entry.content);
      }

      // 2. A plan is a full-replacement snapshot: the update must land in the SAME
      //    bar, not stack a second one. This is the end-to-end guard for the
      //    duplicate-card defect this feature was built to fix.
      await emitPlan(page, conversationId, [
        { ...ENTRIES[0], status: 'completed' },
        { ...ENTRIES[1], status: 'in_progress' },
        ENTRIES[2],
      ]);
      await expect(bar).toHaveCount(1);
      await expect(bar).toContainText('1/3');

      // 3. The plan must never render as a message row.
      await expect(page.locator('[data-message-type="plan"]')).toHaveCount(0);

      // 4. The plan persists after the turn ends and the bar has no inner
      //    collapse control; the running step stays identifiable.
      await endPlanTurn(page, conversationId);
      await expect(bar).toBeVisible({ timeout: 15_000 });
      await expect(bar).toContainText('1/3');
      await expect(bar.locator('[data-status="in_progress"][aria-current="step"]')).toHaveCount(1);
      await expect(bar.getByRole('button')).toHaveCount(0);

      // Opening the workspace moves the plan into a floating card without
      // collapsing the workspace. Closing the workspace docks the same plan.
      await page.evaluate(() => window.dispatchEvent(new CustomEvent('aionui-workspace-toggle', { cancelable: true })));
      await expect(page.locator('[data-plan-presentation="floating"]')).toBeVisible();
      await expect(dockedPlan).toHaveCount(0);
      await testInfo.attach('floating-plan', { body: await page.screenshot(), contentType: 'image/png' });
      const inputWidth = await page
        .getByTestId('sendbox-input')
        .evaluate((element) => element.getBoundingClientRect().width);
      await planTrigger.click();
      await expect(page.locator('[data-plan-presentation="floating"]')).toHaveCount(0);
      await expect
        .poll(() => page.getByTestId('sendbox-input').evaluate((element) => element.getBoundingClientRect().width))
        .toBe(inputWidth);
      await page.evaluate(() => window.dispatchEvent(new CustomEvent('aionui-workspace-toggle', { cancelable: true })));
      await planTrigger.click();
      await expect(dockedPlan).toBeVisible();
      await expect(page.locator('[data-plan-presentation="floating"]')).toHaveCount(0);
      await testInfo.attach('docked-plan', { body: await page.screenshot(), contentType: 'image/png' });
    } finally {
      if (conversationId) {
        await httpDelete(page, `/api/conversations/${encodeURIComponent(conversationId)}`).catch(() => {});
      }
      await electronApp.close();
      fs.rmSync(workspace, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    }
  });
});
