import { expect, test } from '@playwright/test';

const POST_PATH = '/blog/vdu-controls-philips-evnia-brightness-slider-fix/';

test.describe('comments', () => {
	test('comments section is present in the post markup', async ({ page }) => {
		await page.goto(POST_PATH);
		await expect(page.locator('#comments-heading')).toBeAttached();
		await expect(page.locator('[data-comments-mount]')).toBeAttached();
	});

	test('giscus client script is lazy-loaded after the mount enters view', async ({
		page,
	}) => {
		// Block the actual giscus.app request so the test doesn't depend on
		// external service availability. We only need to verify our code
		// appends the <script src="https://giscus.app/client.js"> tag.
		await page.route('https://giscus.app/**', (route) => route.abort());

		await page.goto(POST_PATH);

		// On a long post, the mount is below the fold; no script yet.
		const initial = await page.locator(
			'script[src="https://giscus.app/client.js"]',
		).count();
		expect(initial).toBe(0);

		// Scroll the mount into view.
		await page
			.locator('[data-comments-mount]')
			.scrollIntoViewIfNeeded({ timeout: 5000 });

		// The IntersectionObserver should now have triggered the lazy load.
		await expect
			.poll(
				async () =>
					await page
						.locator('script[src="https://giscus.app/client.js"]')
						.count(),
				{ timeout: 5000 },
			)
			.toBeGreaterThan(0);

		// And the script tag must carry the configured data attributes.
		const repo = await page
			.locator('script[src="https://giscus.app/client.js"]')
			.first()
			.getAttribute('data-repo');
		expect(repo).toBe('MohammedEl-sayedAhmed/writeups');
	});
});
