// Build-time webmention fetcher. Calls the public webmention.io API for a
// given target URL and groups responses by `wm-property` so the rendering
// component can split likes/reposts from replies/mentions.

export type WebmentionAuthor = {
	name?: string;
	photo?: string;
	url?: string;
};

export type Webmention = {
	type: 'entry';
	author?: WebmentionAuthor;
	url: string;
	published?: string;
	content?: { text?: string; html?: string };
	'wm-id'?: number;
	'wm-property':
		| 'like-of'
		| 'repost-of'
		| 'bookmark-of'
		| 'in-reply-to'
		| 'mention-of';
};

export type GroupedMentions = {
	likes: Webmention[];
	reposts: Webmention[];
	replies: Webmention[];
	mentions: Webmention[];
};

export type FetchLike = (
	input: string,
	init?: { signal?: AbortSignal },
) => Promise<{ ok: boolean; json: () => Promise<unknown> }>;

const API_BASE = 'https://webmention.io/api/mentions.jf2';

export async function fetchWebmentions(
	target: string,
	options: { token?: string; fetchFn?: FetchLike } = {},
): Promise<Webmention[]> {
	const { token, fetchFn = globalThis.fetch as unknown as FetchLike } = options;
	const tokenParam = token ? `&token=${encodeURIComponent(token)}` : '';
	const url = `${API_BASE}?target=${encodeURIComponent(target)}&per-page=100${tokenParam}`;
	try {
		const res = await fetchFn(url, { signal: AbortSignal.timeout(10_000) });
		if (!res.ok) return [];
		const data = (await res.json()) as { children?: Webmention[] };
		return Array.isArray(data.children) ? data.children : [];
	} catch {
		return [];
	}
}

export function groupMentions(mentions: Webmention[]): GroupedMentions {
	const result: GroupedMentions = {
		likes: [],
		reposts: [],
		replies: [],
		mentions: [],
	};
	for (const m of mentions) {
		switch (m['wm-property']) {
			case 'like-of':
			case 'bookmark-of':
				result.likes.push(m);
				break;
			case 'repost-of':
				result.reposts.push(m);
				break;
			case 'in-reply-to':
				result.replies.push(m);
				break;
			case 'mention-of':
				result.mentions.push(m);
				break;
		}
	}
	return result;
}
