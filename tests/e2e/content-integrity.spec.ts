import { expect, test } from '@playwright/test';

// Guards the content-output behaviors most at risk from an Astro major upgrade:
// the markdown rehype pipeline (heading ids + autolink anchors), the satori/resvg
// OG image endpoint, and the RSS feed. A successful `astro build` does NOT prove
// any of these still work — the rehype plugins in particular can silently no-op
// while the build stays green — so these assert against the real rendered output.

test.describe('content output integrity', () => {
	test('markdown headings get ids (rehype-slug) and append anchors (rehype-autolink-headings)', async ({
		page,
	}) => {
		await page.goto('/blog/');
		await page.locator('a[href^="/blog/vdu"]').first().click();
		await page.waitForURL(/\/blog\/vdu-controls/);

		// rehype-slug: content headings carry a non-empty id.
		const headings = page.locator('.prose :is(h2, h3, h4)[id]');
		expect(
			await headings.count(),
			'expected at least one content heading with an id (rehype-slug)',
		).toBeGreaterThan(0);

		// rehype-autolink-headings (behavior: 'append', className 'heading-anchor'):
		// each such heading ends with an <a class="heading-anchor" href="#<id>">.
		// This anchor is the signature that the rehype pipeline still runs — it is
		// exactly what silently disappears if the markdown config stops applying.
		const first = headings.first();
		const id = await first.getAttribute('id');
		expect(id, 'heading id should be non-empty').toBeTruthy();
		const anchor = first.locator('a.heading-anchor');
		await expect(
			anchor,
			'rehype-autolink-headings anchor missing — the markdown rehype pipeline may have silently stopped',
		).toBeAttached();
		expect(await anchor.getAttribute('href')).toBe(`#${id}`);
	});

	test('OG image endpoint returns a real PNG', async ({ page }) => {
		// Derive a real post slug from the blog index rather than hardcoding one.
		await page.goto('/blog/');
		const href = await page.locator('a[href^="/blog/"]').first().getAttribute('href');
		const slug = (href ?? '').replace(/^\/blog\//, '').replace(/\/$/, '');
		expect(slug, 'could not derive a post slug from the blog index').toBeTruthy();

		const res = await page.request.get(`/og/${slug}.png`);
		expect(res.status(), `GET /og/${slug}.png`).toBe(200);

		const body = await res.body();
		expect(body.length, 'OG PNG should be non-trivial in size').toBeGreaterThan(1000);
		// PNG magic number: 89 50 4E 47 — the true proof the satori/resvg pipeline
		// emitted an image and not an error page.
		expect([body[0], body[1], body[2], body[3]]).toEqual([0x89, 0x50, 0x4e, 0x47]);
	});

	test('RSS feed is served and lists posts', async ({ page }) => {
		const res = await page.request.get('/rss.xml');
		expect(res.status(), 'GET /rss.xml').toBe(200);
		expect(res.headers()['content-type'] ?? '').toMatch(/xml/);

		const xml = await res.text();
		expect(xml).toContain('<rss');
		expect(xml).toContain('<channel>');
		expect(xml, 'RSS feed should contain at least one <item>').toMatch(/<item>/);
	});
});
