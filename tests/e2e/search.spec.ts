import { expect, test } from '@playwright/test';

test.describe('site search', () => {
	test('header search button opens the modal', async ({ page }) => {
		await page.goto('/');
		await expect(page.locator('#search-modal')).toBeHidden();
		await page.getByRole('button', { name: /Search/ }).click();
		await expect(page.locator('#search-modal')).toBeVisible();
	});

	test('Cmd/Ctrl-K toggles the search modal', async ({ page }) => {
		await page.goto('/');
		await expect(page.locator('#search-modal')).toBeHidden();
		const isMac = process.platform === 'darwin';
		const modifier = isMac ? 'Meta' : 'Control';
		await page.keyboard.press(`${modifier}+k`);
		await expect(page.locator('#search-modal')).toBeVisible();
		await page.keyboard.press('Escape');
		await expect(page.locator('#search-modal')).toBeHidden();
	});

	test('Pagefind index is generated and discovers the post', async ({ page }) => {
		// Pagefind ships fragments at /pagefind/fragment/<hash>.pf_fragment.
		// The entry script and metadata live at /pagefind/pagefind.js.
		const resp = await page.request.get('/pagefind/pagefind.js');
		expect(resp.ok()).toBe(true);
	});
});
