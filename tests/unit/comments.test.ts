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
});
