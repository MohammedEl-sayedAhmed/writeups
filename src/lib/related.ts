export type RelatedPost = {
	id: string;
	title: string;
	description: string;
	pubDate: Date;
	tags: string[];
};

const normalize = (tag: string): string => tag.toLowerCase().trim();

function tagOverlap(a: string[], b: string[]): number {
	if (a.length === 0 || b.length === 0) return 0;
	const setA = new Set(a.map(normalize).filter(Boolean));
	let count = 0;
	for (const tag of b) {
		if (setA.has(normalize(tag))) count += 1;
	}
	return count;
}

// Pick up to `limit` posts related to `current`. Primary signal is tag
// overlap (intersection size); ties break on recency. If fewer than `limit`
// posts share any tag, the remainder is topped up with the most recent
// other posts so the section is uniform once the corpus grows.
export function findRelated(
	current: RelatedPost,
	all: RelatedPost[],
	limit = 3,
): RelatedPost[] {
	const others = all.filter((p) => p.id !== current.id);
	if (others.length === 0) return [];

	const scored = others.map((p) => ({
		post: p,
		score: tagOverlap(current.tags, p.tags),
	}));
	scored.sort((a, b) => {
		if (b.score !== a.score) return b.score - a.score;
		return b.post.pubDate.valueOf() - a.post.pubDate.valueOf();
	});

	const overlapping = scored
		.filter((s) => s.score > 0)
		.slice(0, limit)
		.map((s) => s.post);

	if (overlapping.length >= limit) return overlapping;

	const usedIds = new Set(overlapping.map((p) => p.id));
	const recent = others
		.filter((p) => !usedIds.has(p.id))
		.sort((a, b) => b.pubDate.valueOf() - a.pubDate.valueOf())
		.slice(0, limit - overlapping.length);

	return [...overlapping, ...recent];
}
