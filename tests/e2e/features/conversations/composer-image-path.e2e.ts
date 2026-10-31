import { expect, test } from '../../fixtures';
import { findAssistantIdForBackend, goToGuid } from '../../helpers';

test('paste an image inserts its path at the caret and keeps the preview', async ({ page }, testInfo) => {
  await goToGuid(page);
  await page.waitForFunction(
    () => ((window as unknown as { __backendPort?: number }).__backendPort ?? 0) > 0,
    undefined,
    { timeout: 30_000 }
  );
  let assistantId = await findAssistantIdForBackend(page, 'kimi');
  let createdAssistant = false;
  if (!assistantId) {
    assistantId = await page.evaluate(async () => {
      const port = (window as unknown as { __backendPort?: number }).__backendPort;
      const agentsResponse = await fetch(`http://127.0.0.1:${port}/api/agents/management`);
      const agentsPayload = (await agentsResponse.json()) as
        | Array<{ id: string; backend?: string; agent_type?: string }>
        | { data?: Array<{ id: string; backend?: string; agent_type?: string }> };
      const agents = Array.isArray(agentsPayload) ? agentsPayload : (agentsPayload.data ?? []);
      const agentId = agents.find((agent) => (agent.agent_type ?? agent.backend) === 'kimi')?.id;
      if (!agentId) throw new Error('No local ACP agent available for test');
      const response = await fetch(`http://127.0.0.1:${port}/api/assistants`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'E2E Kimi', preset_agent_type: 'kimi', agent_id: agentId }),
      });
      if (!response.ok) throw new Error(`Create test assistant failed: ${response.status} ${await response.text()}`);
      const payload = (await response.json()) as { data?: { id?: string }; id?: string };
      const id = payload.data?.id ?? payload.id;
      if (!id) throw new Error('Create test assistant returned no id');
      return id;
    });
    createdAssistant = true;
  }

  const conversationId = `e2e-composer-image-${Date.now()}`;
  try {
    await page.evaluate(
      async ({ id, assistant, workspace }) => {
        const port = (window as unknown as { __backendPort?: number }).__backendPort;
        const response = await fetch(`http://127.0.0.1:${port}/api/conversations`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id,
            name: id,
            type: 'acp',
            assistant: { id: assistant },
            extra: { workspace, custom_workspace: true, session_mode: 'default' },
          }),
        });
        if (!response.ok) throw new Error(`Create conversation failed: ${response.status}`);
      },
      { id: conversationId, assistant: assistantId, workspace: process.cwd() }
    );

    await page.getByText(conversationId, { exact: true }).click();
    const textarea = page.getByTestId('sendbox-input');
    try {
      await expect(textarea).toBeVisible({ timeout: 30_000 });
    } catch (error) {
      await page.screenshot({ path: testInfo.outputPath('composer-unavailable.png') });
      console.log('Composer URL', page.url());
      throw error;
    }
    await textarea.fill('First last');
    await textarea.evaluate((element) => {
      const input = element as HTMLTextAreaElement;
      input.setSelectionRange(5, 5);
      const bytes = Uint8Array.from(
        atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='),
        (character) => character.charCodeAt(0)
      );
      const data = new DataTransfer();
      data.items.add(new File([bytes], 'reference image.png', { type: 'image/png' }));
      input.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
    });

    await expect(textarea).toHaveValue(/^First \[[^\]]+\] last$/, { timeout: 20_000 });
    const value = await textarea.inputValue();
    const path = value.match(/\[([^\]]+)\]/)?.[1];
    expect(path).toBeTruthy();
    expect(path).toContain('reference image.png');
    expect(path).toMatch(/^([A-Za-z]:[\\/]|\/|\\\\)/);
    await expect(page.getByRole('img', { name: 'reference image.png', exact: true })).toBeVisible();
  } finally {
    await page.evaluate(async (id) => {
      const port = (window as unknown as { __backendPort?: number }).__backendPort;
      if (!port) return;
      await fetch(`http://127.0.0.1:${port}/api/conversations/${encodeURIComponent(id)}`, { method: 'DELETE' }).catch(
        () => {}
      );
    }, conversationId);
    if (createdAssistant) {
      await page.evaluate(async (id) => {
        const port = (window as unknown as { __backendPort?: number }).__backendPort;
        if (!port) return;
        await fetch(`http://127.0.0.1:${port}/api/assistants/${encodeURIComponent(id)}`, { method: 'DELETE' }).catch(
          () => {}
        );
      }, assistantId);
    }
  }
});
