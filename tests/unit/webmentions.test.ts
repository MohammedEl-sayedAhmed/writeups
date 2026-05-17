import { describe, expect, it, vi } from 'vitest';
import {
	fetchWebmentions,
	groupMentions,
	type Webmention,
} from '../../src/lib/webmentions';

function mockFetch(response: { ok: boolean; json: () => Promise<unknown> }) {
	return vi.fn().mockResolvedValue(response);
}

const fixture = (
	prop: Webmention['wm-property'],
	id: number,
	author = 'someone',
): Webmention => ({
	type: 'entry',
	author: { name: author, photo: `https://example.com/${id}.png`, url: `https://example.com/${author}` },
	url: `https://example.com/post/${id}`,
	'wm-id': id,
	'wm-property': prop,
});

describe('fetchWebmentions', () => {
	it('returns the children array on a 200 response', async () => {
		const mentions = [fixture('like-of', 1), fixture('in-reply-to', 2)];
		const fetchFn = mockFetch({
			ok: true,
			json: async () => ({ children: mentions }),
		});
		const out = await fetchWebmentions('https://mammar.pages.dev/blog/x/', {
			fetchFn,
		});
		expect(out).toEqual(mentions);
		expect(fetchFn).toHaveBeenCalledOnce();
		const calledWith = fetchFn.mock.calls[0][0] as string;
		expect(calledWith).toContain('webmention.io');
		expect(calledWith).toContain(
			encodeURIComponent('https://mammar.pages.dev/blog/x/'),
		);
	});

	it('returns empty on non-2xx', async () => {
		const fetchFn = mockFetch({ ok: false, json: async () => ({}) });
		const out = await fetchWebmentions('https://x/', { fetchFn });
		expect(out).toEqual([]);
	});

	it('returns empty when fetch throws (webmention.io unreachable)', async () => {
		const fetchFn = vi.fn().mockRejectedValue(new Error('network'));
		const out = await fetchWebmentions('https://x/', { fetchFn });
		expect(out).toEqual([]);
	});

	it('returns empty when response shape is unexpected', async () => {
		const fetchFn = mockFetch({ ok: true, json: async () => ({}) });
		const out = await fetchWebmentions('https://x/', { fetchFn });
		expect(out).toEqual([]);
	});

	it('appends the API token when supplied', async () => {
		const fetchFn = mockFetch({
			ok: true,
			json: async () => ({ children: [] }),
		});
		await fetchWebmentions('https://x/', { fetchFn, token: 'abc123' });
		expect(fetchFn.mock.calls[0][0] as string).toContain('token=abc123');
	});
});

describe('groupMentions', () => {
	it('splits mentions across four buckets by wm-property', () => {
		const mentions = [
			fixture('like-of', 1),
			fixture('bookmark-of', 2),
			fixture('repost-of', 3),
			fixture('in-reply-to', 4),
			fixture('mention-of', 5),
		];
		const grouped = groupMentions(mentions);
		expect(grouped.likes.map((m) => m['wm-id'])).toEqual([1, 2]); // bookmarks fold into likes
		expect(grouped.reposts.map((m) => m['wm-id'])).toEqual([3]);
		expect(grouped.replies.map((m) => m['wm-id'])).toEqual([4]);
		expect(grouped.mentions.map((m) => m['wm-id'])).toEqual([5]);
	});

	it('returns empty buckets when given no mentions', () => {
		const grouped = groupMentions([]);
		expect(grouped.likes).toEqual([]);
		expect(grouped.reposts).toEqual([]);
		expect(grouped.replies).toEqual([]);
		expect(grouped.mentions).toEqual([]);
	});

	it('ignores unknown wm-property values', () => {
		const mentions = [
			{ ...fixture('like-of', 1), 'wm-property': 'unknown-thing' as unknown as Webmention['wm-property'] },
		];
		const grouped = groupMentions(mentions);
		expect(grouped.likes).toEqual([]);
		expect(grouped.reposts).toEqual([]);
		expect(grouped.replies).toEqual([]);
		expect(grouped.mentions).toEqual([]);
	});
});
