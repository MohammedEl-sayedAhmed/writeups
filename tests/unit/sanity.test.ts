import { describe, expect, it } from 'vitest';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import Footer from '../../src/components/Footer.astro';
import { AUTHOR_NAME } from '../../src/consts';

describe('test harness', () => {
	it('runs vitest', () => {
		expect(1 + 1).toBe(2);
	});

	it('renders an Astro component via the container API', async () => {
		const container = await AstroContainer.create();
		const html = await container.renderToString(Footer);
		expect(html).toContain(AUTHOR_NAME);
		expect(html).toContain('GitHub');
		expect(html).toContain(String(new Date().getFullYear()));
	});
});
