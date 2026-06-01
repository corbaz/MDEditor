import { test, expect } from './fixtures';

test('app launches and header is visible', async ({ page }) => {
    await expect(page.locator('[data-testid="app-header"]')).toBeVisible();
});
