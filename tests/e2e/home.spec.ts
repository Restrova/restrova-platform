import { expect, test } from '@playwright/test';

test('shows the application foundation', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
});

test('supports registration and authenticated session state', async ({ page }) => {
  await page.route('**/auth/register', async (route) => route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ data: { userId: 'user-1' } }) }));
  await page.goto('/');
  await page.getByRole('button', { name: 'Create an account' }).click();
  await page.getByLabel('Email').fill('owner@example.com');
  await page.getByLabel('Password').fill('correct horse battery staple');
  await page.getByLabel('Your name').fill('Owner');
  await page.getByLabel('Organization').fill('Test Organization');
  await page.getByLabel('Restaurant').fill('Test Restaurant');
  await page.getByRole('button', { name: 'Register' }).click();
  await expect(page.getByText('Your tenant workspace is ready.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Decision workspace' })).toBeVisible();
  await expect(page.getByText('Choose sales export')).toBeVisible();
});
