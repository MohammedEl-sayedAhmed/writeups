import { describe, expect, it } from 'vitest';
import { findRelated, type RelatedPost } from '../../src/lib/related';

function p(
	id: string,
	tags: string[],
	pubDate: Date,
	title = `post ${id}`,
): RelatedPost {
	return {
		id,
		title,
		description: `description for ${id}`,
		pubDate,
		tags,
	};
}

const D = (year: number, month = 1, day = 1) => new Date(year, month - 1, day);

describe('findRelated', () => {
	it('excludes the current post from results', () => {
		const a = p('a', ['linux'], D(2026, 5, 1));
		const b = p('b', ['linux'], D(2026, 4, 1));
		const out = findRelated(a, [a, b]);
		expect(out.map((r) => r.id)).toEqual(['b']);
	});

	it('ranks posts with more tag overlap higher', () => {
		const current = p('current', ['linux', 'python'], D(2026, 5, 1));
		const two = p('two', ['linux', 'python'], D(2026, 1, 1));
		const one = p('one', ['linux'], D(2026, 4, 1));
		const zero = p('zero', ['rust'], D(2026, 4, 15));
		const out = findRelated(current, [current, two, one, zero]);
		expect(out.map((r) => r.id)).toEqual(['two', 'one', 'zero']);
	});

	it('breaks ties on recency (newer first)', () => {
		const current = p('current', ['linux'], D(2026, 5, 1));
		const newer = p('newer', ['linux'], D(2026, 4, 1));
		const older = p('older', ['linux'], D(2026, 1, 1));
		const out = findRelated(current, [current, older, newer]);
		expect(out.slice(0, 2).map((r) => r.id)).toEqual(['newer', 'older']);
	});

	it('matches tags case-insensitively and trims whitespace', () => {
		const current = p('current', [' Linux', 'PYTHON '], D(2026, 5, 1));
		const match = p('match', ['linux'], D(2026, 4, 1));
		const out = findRelated(current, [current, match]);
		expect(out.map((r) => r.id)).toEqual(['match']);
	});

	it('tops up with the most recent posts when overlap is sparse', () => {
		const current = p('current', ['linux'], D(2026, 5, 1));
		const overlap = p('overlap', ['linux'], D(2026, 4, 1));
		const recent = p('recent', ['rust'], D(2026, 4, 15));
		const old = p('old', ['rust'], D(2025, 1, 1));
		const out = findRelated(current, [current, overlap, recent, old]);
		expect(out.map((r) => r.id)).toEqual(['overlap', 'recent', 'old']);
	});

	it('returns at most `limit` results', () => {
		const current = p('current', ['x'], D(2026, 5, 1));
		const others = Array.from({ length: 10 }, (_, i) =>
			p(`o${i}`, ['x'], D(2026, 1, i + 1)),
		);
		const out = findRelated(current, [current, ...others], 3);
		expect(out).toHaveLength(3);
	});

	it('returns empty when no other posts exist', () => {
		const a = p('a', ['linux'], D(2026, 5, 1));
		expect(findRelated(a, [a])).toEqual([]);
	});

	it('falls back entirely to recency when current has no tags', () => {
		const current = p('current', [], D(2026, 5, 1));
		const newer = p('newer', ['linux'], D(2026, 4, 1));
		const older = p('older', ['python'], D(2026, 1, 1));
		const out = findRelated(current, [current, older, newer]);
		expect(out.map((r) => r.id)).toEqual(['newer', 'older']);
	});
});
