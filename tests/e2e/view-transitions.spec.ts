import { expect, test } from '@playwright/test';

const POST_URL_REGEX = /\/blog\/vdu-controls/;

test.describe('view transitions', () => {
	test('navigation does not fully reload the page', async ({ page }) => {
		await page.goto('/');
		await page.evaluate(() => {
			(window as unknown as { __navMarker?: number }).__navMarker = Date.now();
		});
		const before = await page.evaluate(
			() => (window as unknown as { __navMarker?: number }).__navMarker,
		);

		await page.getByRole('link', { name: 'Blog', exact: true }).click();
		await page.waitForURL(/\/blog\/?$/);

		const after = await page.evaluate(
			() => (window as unknown as { __navMarker?: number }).__navMarker,
		);
		expect(after).toBe(before);
	});

	test('theme persists and remains togglable after soft nav', async ({ page }) => {
		await page.goto('/');
		await page.click('#theme-toggle');
		const themeOnHome = await page.evaluate(() =>
			document.documentElement.getAttribute('data-theme'),
		);
		expect(themeOnHome).toBeTruthy();

		await page.getByRole('link', { name: 'Blog', exact: true }).click();
		await page.waitForURL(/\/blog\/?$/);
		const themeOnBlog = await page.evaluate(() =>
			document.documentElement.getAttribute('data-theme'),
		);
		expect(themeOnBlog).toBe(themeOnHome);

		await page.click('#theme-toggle');
		const themeAfterToggle = await page.evaluate(() =>
			document.documentElement.getAttribute('data-theme'),
		);
		expect(themeAfterToggle).not.toBe(themeOnHome);
	});

	test('reading progress bar wires up after soft nav into a post', async ({ page }) => {
		await page.goto('/blog/');
		await page.locator('a[href^="/blog/vdu"]').first().click();
		await page.waitForURL(POST_URL_REGEX);

		// setupBlogPost runs on astro:page-load and initializes --progress to 0%.
		await expect
			.poll(
				async () =>
					await page.evaluate(() =>
						document.getElementById('reading-progress')?.style.getPropertyValue('--progress'),
					),
				{ timeout: 5000 },
			)
			.toBe('0%');

		await page.evaluate(() =>
			window.scrollTo(0, document.documentElement.scrollHeight * 0.5),
		);

		await expect
			.poll(
				async () =>
					await page.evaluate(() => {
						const v = document
							.getElementById('reading-progress')
							?.style.getPropertyValue('--progress');
						return parseFloat(v ?? '0');
					}),
				{ timeout: 2000 },
			)
			.toBeGreaterThan(10);
	});

	test('post-page script rewires after soft nav (copy-code buttons appear)', async ({
		page,
	}) => {
		// The setupBlogPost handler dynamically inserts .copy-code buttons inside
		// every <pre>. Their presence after a soft navigation directly proves the
		// `astro:page-load` lifecycle hook fired and re-ran post-page setup. If
		// view transitions broke the per-page script, these buttons would never
		// be created.
		await page.goto('/blog/');
		await page.locator('a[href^="/blog/vdu"]').first().click();
		await page.waitForURL(POST_URL_REGEX);

		await expect(page.locator('.copy-code').first()).toBeAttached();
		// Confirm at least one fenced code block exists in the post so the count
		// is meaningful.
		const preCount = await page.locator('.prose pre').count();
		expect(preCount).toBeGreaterThan(0);
		const copyCount = await page.locator('.copy-code').count();
		expect(copyCount).toBe(preCount);
	});
});
