import { defineConfig, devices } from '@playwright/test';

const CI = !!process.env.CI;

export default defineConfig({
	testDir: 'tests/e2e',
	fullyParallel: true,
	forbidOnly: CI,
	retries: CI ? 2 : 0,
	workers: CI ? 1 : undefined,
	reporter: CI ? [['github'], ['html', { open: 'never' }]] : 'list',
	use: {
		baseURL: 'http://localhost:4321',
		trace: 'on-first-retry',
	},
	webServer: {
		command: 'npm run preview',
		url: 'http://localhost:4321',
		reuseExistingServer: !CI,
		timeout: 120_000,
	},
	projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
