import { describe, expect, it } from 'vitest';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import RelatedPosts from '../../src/components/RelatedPosts.astro';

const sample = [
	{
		id: 'alpha',
		title: 'Alpha post title',
		description: 'Alpha description.',
		pubDate: new Date(2026, 4, 1),
		tags: ['linux', 'python'],
	},
	{
		id: 'beta',
		title: 'Beta post title',
		description: 'Beta description.',
		pubDate: new Date(2026, 3, 1),
		tags: ['rust'],
	},
];

async function render(posts: typeof sample) {
	const container = await AstroContainer.create();
	return container.renderToString(RelatedPosts, { props: { posts } });
}

describe('RelatedPosts', () => {
	it('renders the section heading and a card per post', async () => {
		const html = await render(sample);
		expect(html).toContain('Related writeups');
		expect(html).toContain('Alpha post title');
		expect(html).toContain('Beta post title');
		expect(html).toContain('href="/blog/alpha/"');
		expect(html).toContain('href="/blog/beta/"');
	});

	it('renders each post tag as a chip', async () => {
		const html = await render(sample);
		expect(html).toContain('linux');
		expect(html).toContain('python');
		expect(html).toContain('rust');
	});

	it('renders nothing when posts is empty', async () => {
		const html = await render([]);
		expect(html).not.toContain('Related writeups');
		expect(html).not.toContain('related-list');
	});

	it('renders each post description', async () => {
		const html = await render(sample);
		expect(html).toContain('Alpha description.');
		expect(html).toContain('Beta description.');
	});
});
