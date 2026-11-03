/**
 * Guid Assistant Selection — compact assistant-only selector coverage.
 */
import { test, expect } from '../fixtures';
import { goToGuid, AGENT_PILL, GUID_INPUT } from '../helpers';

test.describe('Guid Assistant Selection', () => {
  test('guid renders the compact assistant selector and no direct agent pills', async ({ page }) => {
    await goToGuid(page);

    const selector = page.locator('[data-testid="assistant-selector"]');
    await expect(selector).toBeVisible({ timeout: 12_000 });
    await selector.click();
    const options = page.locator('[data-testid^="assistant-option-"]');
    await expect(options.first()).toBeVisible();
    expect(await options.count()).toBeGreaterThanOrEqual(1);
    await expect(page.locator(AGENT_PILL)).toHaveCount(0);
  });

  test('selecting an assistant keeps guid input usable', async ({ page }) => {
    await goToGuid(page);

    await page.locator('[data-testid="assistant-selector"]').click();
    const options = page.locator('[data-testid^="assistant-option-"]');
    await expect(options.first()).toBeVisible({ timeout: 12_000 });
    const firstLabel = (await options.first().textContent())?.trim();
    expect(firstLabel).toBeTruthy();

    await options.first().click();
    await expect(page.locator(GUID_INPUT)).toBeVisible();
    await expect(page.locator('[data-testid="assistant-selector"]')).toContainText(firstLabel!);
    await expect(page.locator(AGENT_PILL)).toHaveCount(0);
  });

  test('the compact menu lists assistants only', async ({ page }) => {
    await goToGuid(page);

    await page.locator('[data-testid="assistant-selector"]').click();
    const options = page.locator('[data-testid^="assistant-option-"]');
    await expect(options.first()).toBeVisible({ timeout: 8_000 });
    expect(await options.count()).toBeGreaterThanOrEqual(1);
    await expect(page.locator(AGENT_PILL)).toHaveCount(0);
  });
});
