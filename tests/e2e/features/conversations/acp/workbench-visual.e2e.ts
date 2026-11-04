import fs from 'fs';
import os from 'os';
import path from 'path';
import { test, expect } from '../../../fixtures';
import { goToGuid } from '../../../helpers';
import { httpDelete, httpGet, httpPost } from '../../../helpers/httpBridge';

const ENABLED_CONVERSATION_KEY = 'aionui:e2e-message-stream-conversation-id';

async function ensureRendererReady(page: import('@playwright/test').Page): Promise<void> {
  await page.waitForFunction(
    () =>
      window.location.href !== 'about:blank' &&
      ((window as unknown as { __backendPort?: number }).__backendPort ?? 0) > 0,
    undefined,
    { timeout: 90_000 }
  );
}

async function createProjectConversation(page: import('@playwright/test').Page, workspace: string): Promise<string> {
  const created = await httpPost<{ id: string }>(page, '/api/conversations', {
    type: 'acp',
    name: 'E2E Kimi-style Workbench',
    extra: { workspace, custom_workspace: true },
  });
  const conversationId = created?.id;
  if (!conversationId) throw new Error('Conversation creation returned no id');
  await page.route(`**/api/conversations/${conversationId}`, async (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    const response = await route.fetch();
    const payload = (await response.json()) as { data?: Record<string, unknown> } & Record<string, unknown>;
    const conversation = payload.data ?? payload;
    conversation.runtime = {
      state: 'running',
      can_send_message: false,
      has_task: true,
      is_processing: true,
      pending_confirmations: 0,
      turn_id: 'e2e-plan-turn',
      supports_midturn_delivery: false,
    };
    await route.fulfill({ response, json: payload });
  });
  await httpGet(page, `/api/conversations/${conversationId}`);

  await page.evaluate(
    ({ id, key }) => {
      window.sessionStorage.setItem(key, id);
      window.location.assign(`#/conversation/${id}`);
    },
    { id: conversationId, key: ENABLED_CONVERSATION_KEY }
  );
  await expect(page.getByTestId('sendbox-input')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.workspace-tree').first()).toBeVisible({ timeout: 30_000 });
  await page.waitForFunction(
    (id) =>
      Boolean(
        (window as unknown as { __AIONUI_E2E_MESSAGE_STREAM__?: { controllers: Record<string, unknown> } })
          .__AIONUI_E2E_MESSAGE_STREAM__?.controllers[id]
      ),
    conversationId,
    { timeout: 15_000 }
  );
  return conversationId;
}

async function invokeStream(
  page: import('@playwright/test').Page,
  conversationId: string,
  method: string,
  args: unknown[] = []
): Promise<void> {
  await page.evaluate(
    async ({ id, action, params }) => {
      const registry = (
        window as unknown as {
          __AIONUI_E2E_MESSAGE_STREAM__?: {
            controllers: Record<string, Record<string, (...args: unknown[]) => Promise<void>>>;
          };
        }
      ).__AIONUI_E2E_MESSAGE_STREAM__;
      const controller = registry?.controllers[id];
      if (!controller?.[action]) throw new Error(`Missing E2E stream controller ${action} for ${id}`);
      await controller[action](...params);
    },
    { id: conversationId, action: method, params: args }
  );
}

test.describe('Kimi-style conversation and Workbench', () => {
  let workspace: string;
  let conversationId: string | null = null;

  test.beforeAll(() => {
    workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'catfish-workbench-visual-'));
    fs.writeFileSync(path.join(workspace, 'README.md'), '# Catfish Workbench\n');
    fs.mkdirSync(path.join(workspace, 'src'));
    fs.writeFileSync(path.join(workspace, 'src', 'App.tsx'), 'export const App = () => null;\n');
  });

  test.afterAll(() => {
    fs.rmSync(workspace, { recursive: true, force: true });
  });

  test.afterEach(async ({ page }) => {
    if (conversationId) {
      await page.unroute(`**/api/conversations/${conversationId}`);
      await httpDelete(page, `/api/conversations/${encodeURIComponent(conversationId)}`).catch(() => {});
    }
    conversationId = null;
  });

  test('keeps real interactions across desktop themes and mobile', async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await goToGuid(page);
    await ensureRendererReady(page);
    conversationId = await createProjectConversation(page, workspace);
    const id = conversationId;

    await invokeStream(page, id, 'runScenario', [{ historyPairs: 8, lines: 0 }]);
    await invokeStream(page, id, 'emitWorkbenchActivity');
    await invokeStream(page, id, 'emitPlan', [
      [
        { content: 'Inspect the existing workspace', status: 'completed' },
        { content: 'Verify the unified Workbench', status: 'in_progress' },
      ],
    ]);
    await expect(page.locator('[data-plan-card-slot] button')).toBeVisible();
    await expect(page.locator('.tool-group-summary__header').first()).toBeVisible();

    const workbench = page.locator('[data-workbench]');
    const panelHost = page.locator('[data-project-panel-host]');
    const planTrigger = page.locator('[data-plan-card-slot] button');
    await planTrigger.click();
    await expect(page.getByTestId('conversation-plan-popup')).toBeVisible();
    await page.locator('#workbench-tab-files').click();
    await expect(page.getByTestId('conversation-plan-popup')).toHaveCount(0);
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('aionui-workspace-toggle', { cancelable: true })));
    await expect(panelHost).toHaveAttribute('data-collapsed', 'true');
    await invokeStream(page, id, 'emitPlan', [
      [
        { content: 'Inspect the existing workspace', status: 'completed' },
        { content: 'Verify the unified Workbench', status: 'in_progress' },
      ],
    ]);
    await planTrigger.click();
    await expect(panelHost).toHaveAttribute('data-collapsed', 'false');
    await expect(workbench).toHaveAttribute('data-active-section', 'plan');
    await expect(workbench.getByTestId('conversation-plan-bar')).toHaveAttribute('data-variant', 'panel');
    await expect(page.getByTestId('conversation-plan-popup')).toHaveCount(0);
    await planTrigger.click();
    await expect(workbench).toHaveAttribute('data-active-section', 'files');

    const scroller = page.getByTestId('message-list-scroller');
    await scroller.evaluate((element) => {
      element.scrollTop = 0;
      element.dispatchEvent(new Event('scroll', { bubbles: true }));
    });
    await expect(page.locator('.message-scroll-bottom')).toBeVisible();
    await page.locator('.message-scroll-bottom').click({ force: true });
    await expect
      .poll(() =>
        scroller.evaluate((element) => Math.abs(element.scrollHeight - element.clientHeight - element.scrollTop))
      )
      .toBeLessThan(110);

    await page.locator('.tool-group-summary__header').first().click();
    await page.locator('.tool-row__button').filter({ hasText: 'Task' }).first().click();
    await expect(workbench).toHaveAttribute('data-active-section', 'agents');
    await expect(workbench.locator('.workbench-agent-card').first()).toContainText('Task');
    const agentsBodyWidth = await workbench.locator('.workbench-body').evaluate((element) => element.clientWidth);
    const agentsPanelWidth = await workbench
      .locator('#workbench-panel-agents')
      .evaluate((element) => element.clientWidth);
    expect(agentsPanelWidth).toBeCloseTo(agentsBodyWidth, 0);
    const agentsHostWidth = await panelHost.evaluate((element) => element.getBoundingClientRect().width);
    for (const section of ['files', 'changes', 'preview', 'terminal', 'agents']) {
      await expect(page.locator(`#workbench-tab-${section}`)).toBeVisible();
    }
    await workbench.locator('.workbench-agent-card__header').first().click();
    await expect(workbench.locator('.workbench-agent-card__detail')).toContainText('Inspect the project structure');

    await page.locator('#workbench-tab-terminal').click();
    await expect(workbench).toHaveAttribute('data-active-section', 'terminal');
    await expect(workbench.getByTestId('terminal-card-output')).toHaveCount(0);
    await workbench.getByTestId('terminal-card-toggle').first().click();
    await expect(workbench.getByTestId('terminal-card-output')).toContainText('67 tests passed');
    const terminalBodyWidth = await workbench.locator('.workbench-body').evaluate((element) => element.clientWidth);
    const terminalPanelWidth = await workbench
      .locator('#workbench-panel-terminal')
      .evaluate((element) => element.clientWidth);
    expect(terminalPanelWidth).toBeCloseTo(terminalBodyWidth, 0);
    expect(await panelHost.evaluate((element) => element.getBoundingClientRect().width)).toBeCloseTo(
      agentsHostWidth,
      0
    );

    await page.locator('#workbench-tab-files').click();
    await expect(page.locator('.workspace-tree').first()).toBeVisible();
    const filesHostWidth = await panelHost.evaluate((element) => element.getBoundingClientRect().width);
    expect(filesHostWidth).toBeCloseTo(agentsHostWidth, 0);
    await page.locator('#workbench-tab-changes').click();
    await expect(workbench).toHaveAttribute('data-active-section', 'changes');
    await page.locator('#workbench-tab-preview').click();
    await expect(workbench).toHaveAttribute('data-active-section', 'preview');
    await expect(page.locator('[data-project-preview-region]')).toBeVisible();
    await expect(page.locator('.workspace-tree').first()).toBeVisible();
    await page.getByText('README.md', { exact: true }).first().click();
    await page.getByTestId('preview-collapse-panel').click();
    await page.locator('#workbench-tab-agents').click();

    await page.getByTestId('sendbox-input').fill('Queue a follow-up review');
    await page.getByTestId('sendbox-input').press('Enter');
    await expect(page.locator('[data-command-queue-list]')).toContainText('Queue a follow-up review');
    await expect(page.getByTestId('message-list-scroller').locator('[data-command-queue-list]')).toHaveCount(0);
    await page.locator('.chat-layout-header').click({ position: { x: 20, y: 20 } });
    await page.waitForTimeout(300);
    await page.mouse.move(0, 0);
    await page.evaluate(() => document.fonts.ready);
    expect(
      await workbench.evaluate((element) => element.parentElement?.getBoundingClientRect().width ?? 0)
    ).toBeCloseTo(filesHostWidth, 0);

    await expect(page).toHaveScreenshot('workbench-light.png', {
      animations: 'disabled',
      caret: 'hide',
      maxDiffPixelRatio: 0.02,
    });

    await page.evaluate(() => {
      document.documentElement.dataset.theme = 'dark';
      document.body.setAttribute('arco-theme', 'dark');
    });
    await expect(page).toHaveScreenshot('workbench-dark.png', {
      animations: 'disabled',
      caret: 'hide',
      maxDiffPixelRatio: 0.02,
    });

    await page.evaluate(() => {
      document.documentElement.dataset.theme = 'light';
      document.body.removeAttribute('arco-theme');
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByTestId('sendbox-input')).toBeVisible();
    await expect(page.locator('#workbench-tab-preview')).toHaveCount(0);
    await expect(page).toHaveScreenshot('conversation-mobile.png', {
      animations: 'disabled',
      caret: 'hide',
      maxDiffPixelRatio: 0.02,
    });

    await page.evaluate(() => window.dispatchEvent(new CustomEvent('aionui-workspace-toggle')));
    await expect(page.locator('[data-explorer-mobile-overlay][data-collapsed="false"]')).toBeVisible();
    await expect(page).toHaveScreenshot('workbench-mobile.png', {
      animations: 'disabled',
      caret: 'hide',
      maxDiffPixelRatio: 0.02,
    });
  });
});
