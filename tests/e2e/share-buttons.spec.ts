import { expect, test } from '@playwright/test';

const POST_PATH = '/blog/vdu-controls-philips-evnia-brightness-slider-fix/';

test.describe('post share', () => {
	test('renders share buttons on a post', async ({ page }) => {
		await page.goto(POST_PATH);
		const aside = page.locator('.post-share');
		await expect(aside).toBeVisible();
		await expect(aside.getByRole('link', { name: 'X' })).toBeVisible();
		await expect(aside.getByRole('link', { name: 'LinkedIn' })).toBeVisible();
		await expect(aside.getByRole('link', { name: 'Hacker News' })).toBeVisible();
		await expect(aside.getByRole('button', { name: 'Copy link' })).toBeVisible();
	});

	test('shows the dev.to discuss CTA when the article has a dev.to id', async ({ page }) => {
		await page.goto(POST_PATH);
		const cta = page.getByRole('link', { name: /Discuss on dev\.to/ });
		await expect(cta).toBeVisible();
		const href = await cta.getAttribute('href');
		expect(href).toMatch(/^https:\/\/dev\.to\/mammar\//);
	});

	test('copy-link button writes canonical url to the clipboard', async ({ page }) => {
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
		const copyBtn = page.getByRole('button', { name: 'Copy link' });
		await copyBtn.click();
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
});
