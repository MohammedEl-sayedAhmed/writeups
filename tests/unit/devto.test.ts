import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
	DEVTO_FALLBACK_URL,
	_resetDevtoCache,
	resolveDevtoUrl,
} from '../../src/lib/devto';

const REAL_URL =
	'https://dev.to/mammar/how-i-fixed-a-01-brightness-slider-in-vducontrols-philips-evnia-ddcci-bug-4fdg';

function mockFetch(response: { ok: boolean; json: () => Promise<unknown> }) {
	return vi.fn().mockResolvedValue(response);
}

beforeEach(() => {
	_resetDevtoCache();
});

describe('resolveDevtoUrl', () => {
	it('returns the canonical dev.to article url on success', async () => {
		const fetchFn = mockFetch({
			ok: true,
			json: async () => ({ url: REAL_URL }),
		});
		const url = await resolveDevtoUrl(3685159, fetchFn);
		expect(url).toBe(REAL_URL);
		expect(fetchFn).toHaveBeenCalledWith(
			'https://dev.to/api/articles/3685159',
			expect.objectContaining({ signal: expect.any(AbortSignal) }),
		);
	});

	it('falls back to the profile url on non-2xx', async () => {
		const fetchFn = mockFetch({ ok: false, json: async () => ({}) });
		const url = await resolveDevtoUrl(42, fetchFn);
		expect(url).toBe(DEVTO_FALLBACK_URL);
	});

	it('falls back when fetch throws', async () => {
		const fetchFn = vi.fn().mockRejectedValue(new Error('network down'));
		const url = await resolveDevtoUrl(7, fetchFn);
		expect(url).toBe(DEVTO_FALLBACK_URL);
	});

	it('caches resolved urls per id', async () => {
		const fetchFn = mockFetch({
			ok: true,
			json: async () => ({ url: REAL_URL }),
		});
		await resolveDevtoUrl(99, fetchFn);
		await resolveDevtoUrl(99, fetchFn);
		expect(fetchFn).toHaveBeenCalledTimes(1);
	});

	it('falls back when the response body lacks a url field', async () => {
		const fetchFn = mockFetch({ ok: true, json: async () => ({}) });
		const url = await resolveDevtoUrl(123, fetchFn);
		expect(url).toBe(DEVTO_FALLBACK_URL);
	});
});
