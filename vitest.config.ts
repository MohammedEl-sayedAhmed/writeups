/// <reference types="vitest/config" />
import { getViteConfig } from 'astro/config';

export default getViteConfig({
	test: {
		environment: 'node',
		include: ['tests/unit/**/*.test.ts'],
		globals: false,
		coverage: {
			provider: 'v8',
			reporter: ['text-summary', 'text'],
			include: ['src/**/*.{ts,js}'],
			exclude: ['tests/**', '**/*.test.ts', '**/*.config.*', 'src/env.d.ts'],
		},
	},
});
