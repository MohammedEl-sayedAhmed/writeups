// Build-time resolver for dev.to article URLs. Given the article `id` written
// back to frontmatter by the cross-post action, look up the canonical dev.to
// URL so the "Discuss on dev.to" link points at the real article instead of
// the author profile.

export const DEVTO_FALLBACK_URL = 'https://dev.to/mammar';

const cache = new Map<number, string>();

export type FetchLike = (
	input: string,
	init?: { signal?: AbortSignal },
) => Promise<{ ok: boolean; json: () => Promise<unknown> }>;

export async function resolveDevtoUrl(
	id: number,
	fetchFn: FetchLike = globalThis.fetch as unknown as FetchLike,
): Promise<string> {
	const cached = cache.get(id);
	if (cached) return cached;
	try {
		const res = await fetchFn(`https://dev.to/api/articles/${id}`, {
			signal: AbortSignal.timeout(5000),
		});
		if (!res.ok) return DEVTO_FALLBACK_URL;
		const data = (await res.json()) as { url?: unknown };
		const url = typeof data.url === 'string' && data.url ? data.url : DEVTO_FALLBACK_URL;
		cache.set(id, url);
		return url;
	} catch {
		return DEVTO_FALLBACK_URL;
	}
}

// Test-only escape hatch so unit tests start from a clean cache.
export function _resetDevtoCache(): void {
	cache.clear();
}
