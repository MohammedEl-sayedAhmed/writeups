import { expect, test } from '@playwright/test';

test('home page renders', async ({ page }) => {
	await page.goto('/');
	await expect(page).toHaveTitle(/writeups/i);
	await expect(page.getByRole('link', { name: 'Blog', exact: true })).toBeVisible();
});

test('blog index lists the existing post', async ({ page }) => {
	await page.goto('/blog/');
	await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
	await expect(
		page.getByRole('link', { name: /vdu.controls/i }).first(),
	).toBeVisible();
});
