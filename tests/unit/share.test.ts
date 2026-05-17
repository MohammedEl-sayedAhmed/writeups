import { describe, expect, it } from 'vitest';
import { shareUrls } from '../../src/lib/share';

const fixture = {
	title: 'How I fixed the slider & broke the regex',
	url: 'https://mammar.pages.dev/blog/example/',
	description: 'A one-line cause and a 21-line patch.',
};

describe('shareUrls', () => {
	it('encodes special characters in the X share intent', () => {
		const u = shareUrls(fixture).x;
		expect(u).toContain('twitter.com/intent/tweet');
		expect(u).toContain(encodeURIComponent(fixture.title));
		expect(u).toContain(encodeURIComponent(fixture.url));
		expect(u).not.toContain('&broke'); // raw ampersand must be encoded
	});

	it('points LinkedIn at share-offsite with the canonical url', () => {
		const u = shareUrls(fixture).linkedin;
		expect(u).toBe(
			`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(fixture.url)}`,
		);
	});

	it('composes title and url into a single Bluesky compose text', () => {
		const u = shareUrls(fixture).bluesky;
		expect(u).toContain('bsky.app/intent/compose');
		expect(u).toContain(encodeURIComponent(`${fixture.title} ${fixture.url}`));
	});

	it('puts url and title on the Hacker News submitlink', () => {
		const u = shareUrls(fixture).hackernews;
		expect(u).toContain('news.ycombinator.com/submitlink');
		expect(u).toContain(`u=${encodeURIComponent(fixture.url)}`);
		expect(u).toContain(`t=${encodeURIComponent(fixture.title)}`);
	});

	it('builds a Reddit submit url', () => {
		const u = shareUrls(fixture).reddit;
		expect(u).toContain('reddit.com/submit');
		expect(u).toContain(`url=${encodeURIComponent(fixture.url)}`);
		expect(u).toContain(`title=${encodeURIComponent(fixture.title)}`);
	});

	it('builds a mailto with description and url in the body', () => {
		const u = shareUrls(fixture).email;
		expect(u.startsWith('mailto:?')).toBe(true);
		expect(u).toContain(`subject=${encodeURIComponent(fixture.title)}`);
		expect(u).toContain(
			`body=${encodeURIComponent(`${fixture.description}\n\n${fixture.url}`)}`,
		);
	});
});
