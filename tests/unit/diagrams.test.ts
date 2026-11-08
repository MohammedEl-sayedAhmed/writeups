import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error The generator is plain JavaScript without type declarations.
import { generateDiagrams, OUTPUT_DIR } from '../../scripts/diagrams.mjs';

const generated = generateDiagrams() as Record<string, string>;

describe('architecture diagrams', () => {
	it('generates at least the overview and the publish flow, in light and dark', () => {
		expect(Object.keys(generated)).toEqual(
			expect.arrayContaining([
				'overview.svg',
				'overview-dark.svg',
				'publish-flow.svg',
				'publish-flow-dark.svg',
			]),
		);
	});

	it('generates the same output on every run', () => {
		expect(generateDiagrams()).toEqual(generated);
	});

	for (const [file, svg] of Object.entries(generated)) {
		it(`docs/diagrams/${file} is up to date`, () => {
			const committed = readFileSync(join(OUTPUT_DIR, file), 'utf8');
			expect(
				committed === svg,
				`docs/diagrams/${file} does not match scripts/diagrams.mjs. Run "npm run diagrams" and commit the result.`,
			).toBe(true);
		});
	}
});
