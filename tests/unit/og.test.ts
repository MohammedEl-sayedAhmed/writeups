import { describe, expect, it } from 'vitest';
import { Resvg } from '@resvg/resvg-js';
import { OG_HEIGHT, OG_PADDING, OG_WIDTH, renderOgSvg } from '../../src/lib/og';

const LONG_TITLE =
	'Building Clipman — a clipboard manager for Wayland that respects you and keeps every secret out of the history';
const MANY_TAGS = ['linux', 'opensource', 'python', 'gnome', 'wayland', 'dbus', 'ci-cd', 'packaging'];

/** Every box satori lays out is written as a mask <rect>; collect them all. */
function boxes(svg: string) {
	return [...svg.matchAll(/<mask id="satori_om-[^"]*"><rect x="(-?[\d.]+)" y="(-?[\d.]+)" width="([\d.]+)" height="([\d.]+)"/g)].map(
		(m) => ({ x: +m[1], y: +m[2], w: +m[3], h: +m[4] }),
	);
}

describe('OG image layout', () => {
	it('renders a 1200x630 PNG', async () => {
		const svg = await renderOgSvg({ title: 'Short title', tags: ['a'], dateLabel: 'May 22, 2026' });
		const img = new Resvg(svg, { fitTo: { mode: 'width', value: OG_WIDTH } }).render();
		expect(img.width).toBe(OG_WIDTH);
		expect(img.height).toBe(OG_HEIGHT);
		expect(img.asPng().length).toBeGreaterThan(1000);
	});

	it.each([
		['long title, many tags', LONG_TITLE, MANY_TAGS],
		['short title, no tags', 'Short title', []],
	])('keeps every box inside the canvas margins (%s)', async (_name, title, tags) => {
		const svg = await renderOgSvg({ title, tags, dateLabel: 'May 22, 2026' });
		const all = boxes(svg);
		expect(all.length).toBeGreaterThan(5);

		// The root box is exactly the canvas. A content-box root grows by its padding.
		expect(all[0]).toMatchObject({ x: 0, y: 0, w: OG_WIDTH, h: OG_HEIGHT });

		for (const b of all.slice(1)) {
			expect(b.x).toBeGreaterThanOrEqual(OG_PADDING);
			expect(b.y).toBeGreaterThanOrEqual(OG_PADDING);
			expect(b.x + b.w).toBeLessThanOrEqual(OG_WIDTH - OG_PADDING + 0.5);
			expect(b.y + b.h).toBeLessThanOrEqual(OG_HEIGHT - OG_PADDING + 0.5);
		}
	});

	it('keeps the site label clear of the tags', async () => {
		const svg = await renderOgSvg({ title: LONG_TITLE, tags: MANY_TAGS, dateLabel: 'May 22, 2026' });
		const all = boxes(svg);
		// Last two boxes in the meta row: the tags, then the site label.
		const site = all[all.length - 1];
		const tags = all[all.length - 2];
		expect(tags.w).toBeGreaterThan(300);
		expect(tags.x + tags.w).toBeLessThan(site.x);
	});
});
