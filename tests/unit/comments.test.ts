import { describe, expect, it } from 'vitest';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import Comments from '../../src/components/Comments.astro';
import { GISCUS } from '../../src/consts';

describe('Comments', () => {
	it('renders a labeled section and the giscus mount point', async () => {
		const container = await AstroContainer.create();
		const html = await container.renderToString(Comments);
		expect(html).toContain('id="comments-heading"');
		expect(html).toContain('Comments');
		expect(html).toContain('data-comments-mount');
	});

	it('embeds the configured GISCUS repo + category constants for the client script', async () => {
		const container = await AstroContainer.create();
		const html = await container.renderToString(Comments);
		// `define:vars` inlines the constants into the page-bundled script.
		expect(html).toContain(GISCUS.repo);
		expect(html).toContain(GISCUS.repoId);
		expect(html).toContain(GISCUS.category);
		expect(html).toContain(GISCUS.categoryId);
	});
	describe('giscus initial theme', () => {
		// Runs the rendered inline script against a minimal DOM stub and returns
		// the data-theme value handed to the giscus script tag.
		async function giscusTheme(dataTheme: string | null, prefersDark: boolean) {
			const container = await AstroContainer.create();
			const html = await container.renderToString(Comments);
			const match = html.match(/<script>([\s\S]*?)<\/script>/);
			expect(match).not.toBeNull();
			const listeners: Record<string, () => void> = {};
			const attrs: Record<string, string> = {};
			type FakeScript = { attrs: Record<string, string>; setAttribute: (k: string, v: string) => void };
			const mount = {
				dataset: {} as Record<string, string>,
				appendChild: (el: FakeScript) => Object.assign(attrs, el.attrs),
			};
			const doc = {
				documentElement: { getAttribute: () => dataTheme },
				addEventListener: (name: string, fn: () => void) => {
					listeners[name] = fn;
				},
				querySelector: () => mount,
				createElement: (): FakeScript => {
					const attrs: Record<string, string> = {};
					return {
						attrs,
						setAttribute: (k: string, v: string) => {
							attrs[k] = v;
						},
					};
				},
			};
			class FakeEl {}
			const win = {}; // no IntersectionObserver: giscus loads immediately
			new Function(
				'document',
				'window',
				'matchMedia',
				'HTMLElement',
				'HTMLIFrameElement',
				'IntersectionObserver',
				match![1],
			)(
				doc,
				win,
				() => ({ matches: prefersDark }),
				// instanceof check must accept the mount stub
				{ [Symbol.hasInstance]: () => true },
				FakeEl,
				undefined,
			);
			listeners['astro:page-load']();
			return attrs['data-theme'];
		}

		it('uses dark when data-theme is missing, even if the browser prefers light', async () => {
			expect(await giscusTheme(null, false)).toBe('dark');
		});

		it('uses light when data-theme is "light"', async () => {
			expect(await giscusTheme('light', true)).toBe('light');
		});
	});
});
