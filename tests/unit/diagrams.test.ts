import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { generateDiagrams, OUTPUT_DIR } from '../../scripts/diagrams.mjs';

const generated = generateDiagrams();
const hint = 'Run "npm run diagrams" and commit the result.';

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

	it('has no extra SVG in docs/diagrams/ that the script does not generate', () => {
		const onDisk = existsSync(OUTPUT_DIR)
			? readdirSync(OUTPUT_DIR).filter((f) => f.endsWith('.svg'))
			: [];
		const extra = onDisk.filter((f) => !(f in generated));
		expect(extra, `docs/diagrams/ has files the script does not generate: ${extra.join(', ')}. Delete them or add them to scripts/diagrams.mjs. ${hint}`).toEqual([]);
	});

	for (const [file, svg] of Object.entries(generated)) {
		it(`docs/diagrams/${file} is up to date`, () => {
			const path = join(OUTPUT_DIR, file);
			expect(existsSync(path), `docs/diagrams/${file} is missing. ${hint}`).toBe(true);
			expect(
				readFileSync(path, 'utf8') === svg,
				`docs/diagrams/${file} does not match scripts/diagrams.mjs. ${hint}`,
			).toBe(true);
		});
	}
});
