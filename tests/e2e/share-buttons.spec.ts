import { expect, test } from '@playwright/test';

const POST_PATH = '/blog/vdu-controls-philips-evnia-brightness-slider-fix/';

test.describe('post share', () => {
	test('share trigger sits in the post header and opens a sheet of targets', async ({ page }) => {
		await page.goto(POST_PATH);
		const trigger = page.getByRole('button', { name: 'Share' });
		await expect(trigger).toBeVisible();

		// The sheet starts hidden; items inside should not be visible yet.
		await expect(page.getByRole('dialog', { name: 'Share this post' })).toBeHidden();

		await trigger.click();
		const sheet = page.getByRole('dialog', { name: 'Share this post' });
		await expect(sheet).toBeVisible();
		await expect(sheet.getByRole('menuitem', { name: 'X' })).toBeVisible();
		await expect(sheet.getByRole('menuitem', { name: 'LinkedIn' })).toBeVisible();
		await expect(sheet.getByRole('menuitem', { name: 'Hacker News' })).toBeVisible();
		await expect(sheet.getByRole('menuitem', { name: 'Copy link' })).toBeVisible();
	});

	test('shows the dev.to discuss CTA inline when the article has a dev.to id', async ({ page }) => {
		await page.goto(POST_PATH);
		const cta = page.getByRole('link', { name: /Discuss on dev\.to/ });
		await expect(cta).toBeVisible();
		const href = await cta.getAttribute('href');
		expect(href).toMatch(/^https:\/\/dev\.to\/mammar\//);
	});

	test('copy-link inside the sheet writes the canonical url to the clipboard', async ({
		page,
	}) => {
		await page.addInitScript(() => {
			(window as unknown as { __copied: string | null }).__copied = null;
			Object.defineProperty(navigator.clipboard, 'writeText', {
				configurable: true,
				value: async (text: string) => {
					(window as unknown as { __copied: string }).__copied = text;
				},
			});
		});
		await page.goto(POST_PATH);
		await page.getByRole('button', { name: 'Share' }).click();
		await page
			.getByRole('dialog', { name: 'Share this post' })
			.getByRole('menuitem', { name: 'Copy link' })
			.click();
		await expect
			.poll(
				async () =>
					await page.evaluate(
						() => (window as unknown as { __copied: string | null }).__copied,
					),
				{ timeout: 3000 },
			)
			.toMatch(/^https?:\/\/.*\/blog\/vdu-controls/);
	});

	test('Escape closes the share sheet', async ({ page }) => {
		await page.goto(POST_PATH);
		await page.getByRole('button', { name: 'Share' }).click();
		const sheet = page.getByRole('dialog', { name: 'Share this post' });
		await expect(sheet).toBeVisible();
		await page.keyboard.press('Escape');
		await expect(sheet).toBeHidden();
	});
});
