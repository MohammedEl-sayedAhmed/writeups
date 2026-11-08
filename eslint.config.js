import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';
import astro from 'eslint-plugin-astro';
import globals from 'globals';

export default defineConfig(
	{
		// `.*/` skips top-level dot directories, such as local worktree copies.
		ignores: ['dist/', '.astro/', 'node_modules/', 'coverage/', 'playwright-report/', 'test-results/', 'public/', '.*/'],
	},
	js.configs.recommended,
	tseslint.configs.recommended,
	astro.configs.recommended,
	{
		languageOptions: { globals: { ...globals.node, ...globals.browser } },
	},
);
