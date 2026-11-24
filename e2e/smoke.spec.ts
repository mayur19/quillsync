import { expect, test } from '@playwright/test';

const PASSWORD = 'quillsync-demo-1';

test('owner signs in, opens a seeded document and types', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill('ada@northwind.test');
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Documents' })).toBeVisible();
  await expect(page.getByText('Planned').first()).toBeVisible();

  await page.getByRole('link', { name: /Style guide/ }).click();
  await expect(page.getByRole('status')).toHaveText('Live');
  const editor = page.getByLabel('Document text');
  await expect(editor).toHaveValue(/House style/);
  await editor.press('End');
  await editor.type(' (checked)');
  await expect(editor).toHaveValue(/\(checked\)/);
});
