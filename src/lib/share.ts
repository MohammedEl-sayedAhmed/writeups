export type ShareTargets = {
	title: string;
	url: string;
	description: string;
};

export type ShareNetwork =
	| 'x'
	| 'linkedin'
	| 'bluesky'
	| 'hackernews'
	| 'reddit'
	| 'email';

export function shareUrls({ title, url, description }: ShareTargets): Record<ShareNetwork, string> {
	const t = encodeURIComponent(title);
	const u = encodeURIComponent(url);
	const composed = encodeURIComponent(`${title} ${url}`);
	const body = encodeURIComponent(`${description}\n\n${url}`);
	return {
		x: `https://twitter.com/intent/tweet?text=${t}&url=${u}`,
		linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${u}`,
		bluesky: `https://bsky.app/intent/compose?text=${composed}`,
		hackernews: `https://news.ycombinator.com/submitlink?u=${u}&t=${t}`,
		reddit: `https://www.reddit.com/submit?url=${u}&title=${t}`,
		email: `mailto:?subject=${t}&body=${body}`,
	};
}
