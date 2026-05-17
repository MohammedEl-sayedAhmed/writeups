import { describe, expect, it } from 'vitest';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import PostShare from '../../src/components/PostShare.astro';

const baseProps = {
	title: 'Example title',
	url: 'https://mammar.pages.dev/blog/example/',
	description: 'Example description.',
};

async function render(props: Record<string, unknown>) {
	const container = await AstroContainer.create();
	return container.renderToString(PostShare, { props });
}

describe('PostShare', () => {
	it('renders the six share targets and two action buttons', async () => {
		const html = await render(baseProps);
		expect(html).toContain('href="https://twitter.com/intent/tweet');
		expect(html).toContain('href="https://www.linkedin.com/sharing/share-offsite');
		expect(html).toContain('href="https://bsky.app/intent/compose');
		expect(html).toContain('href="https://news.ycombinator.com/submitlink');
		expect(html).toContain('href="https://www.reddit.com/submit');
		expect(html).toContain('href="mailto:');
		expect(html).toContain('data-share="mastodon"');
		expect(html).toContain('data-share="copy"');
	});

	it('omits the dev.to discuss CTA when no devtoUrl is provided', async () => {
		const html = await render(baseProps);
		expect(html).not.toContain('Discuss on dev.to');
	});

	it('renders the discuss CTA when devtoUrl is provided', async () => {
		const html = await render({
			...baseProps,
			devtoUrl: 'https://dev.to/mammar/example-slug-123',
		});
		expect(html).toContain('Discuss on dev.to');
		expect(html).toContain('href="https://dev.to/mammar/example-slug-123"');
	});

	it('exposes share url and title as data attributes on the root', async () => {
		const html = await render(baseProps);
		expect(html).toContain(`data-share-url="${baseProps.url}"`);
		expect(html).toContain(`data-share-title="${baseProps.title}"`);
	});

	it('marks external share links as target=_blank rel=noopener', async () => {
		const html = await render(baseProps);
		// Each external <a> should have rel=noopener
		const occurrences = (html.match(/rel="noopener"/g) ?? []).length;
		expect(occurrences).toBeGreaterThanOrEqual(5);
	});
});
