import { test, expect } from './fixtures';

// All tests rely on the `page` fixture which already waits for .loadingOverlay hidden.
// Theme and view-mode controls use stable English aria-labels (not locale-dependent).
// Action buttons use data-testid because their aria-label is locale-dependent (default 'es').

test('1 — app launches and structural regions render', async ({ page }) => {
    await expect(page.locator('[data-testid="app-header"]')).toBeVisible();
    await expect(page.locator('[data-testid="workspace"]')).toBeVisible();
});

test('2 — theme Dark to Light applies class', async ({ page }) => {
    // Default launch is dark-theme; switch to light.
    await page.locator('[role="group"][aria-label="Theme"] button:has-text("Light")').click();

    const root = page.locator('[data-testid="app-root"]');
    await expect(root).toHaveClass(/light-theme/);
    await expect(root).not.toHaveClass(/dark-theme/);
});

test('3 — theme Light to Dark applies class', async ({ page }) => {
    // Switch to light first, then back to dark.
    await page.locator('[role="group"][aria-label="Theme"] button:has-text("Light")').click();
    await page.locator('[role="group"][aria-label="Theme"] button:has-text("Dark")').click();

    const root = page.locator('[data-testid="app-root"]');
    await expect(root).toHaveClass(/dark-theme/);
    await expect(root).not.toHaveClass(/light-theme/);
});

test('4 — view-mode .md shows source textarea and hides rich editor', async ({ page }) => {
    await page.locator('[role="group"][aria-label="View mode"] button:has-text(".md")').click();

    await expect(page.locator('[data-testid="source-editor"]')).toBeVisible();
    await expect(page.locator('[data-testid="editor-wrap"]')).toBeHidden();
});

test('5 — view-mode Preview shows preview region', async ({ page }) => {
    await page.locator('[role="group"][aria-label="View mode"] button:has-text("Preview")').click();

    await expect(page.locator('[data-testid="preview-wrap"]')).toBeVisible();
});

test('6 — view-mode Editor shows rich editor and hides source textarea', async ({ page }) => {
    // Switch away from editor first.
    await page.locator('[role="group"][aria-label="View mode"] button:has-text(".md")').click();
    // Switch back to Editor.
    await page.locator('[role="group"][aria-label="View mode"] button:has-text("Editor")').click();

    await expect(page.locator('[data-testid="editor-wrap"]')).toBeVisible();
    await expect(page.locator('[data-testid="source-editor"]')).toBeHidden();
});

test('7 — New document activates filename edit input', async ({ page }) => {
    await page.locator('[data-testid="btn-new"]').click();

    await expect(page.locator('input.fileNameEditor')).toBeVisible();
});
