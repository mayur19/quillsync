import { expect, test, type Page } from '@playwright/test';

async function signIn(page: Page, email: string) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('quillsync-demo-1');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Documents' })).toBeVisible();
}

test('two editors see each other and converge', async ({ browser }) => {
  const ada = await (await browser.newContext()).newPage();
  const grace = await (await browser.newContext()).newPage();
  await signIn(ada, 'ada@northwind.test');
  await signIn(grace, 'grace@northwind.test');
  await ada.getByRole('link', { name: /Interview notes/ }).click();
  await grace.getByRole('link', { name: /Interview notes/ }).click();
  await expect(ada.getByRole('status')).toHaveText('Live');
  await expect(grace.getByRole('status')).toHaveText('Live');

  await ada.getByLabel('Document text').focus();
  await expect(grace.getByLabel('People editing this document')).toContainText('Ada');

  await ada.getByLabel('Document text').press('Control+End');
  await ada.getByLabel('Document text').type('\nFollow-up from Ada');
  await grace.getByLabel('Document text').press('Control+Home');
  await grace.getByLabel('Document text').type('[Grace] ');

  const adaText = ada.getByLabel('Document text');
  const graceText = grace.getByLabel('Document text');
  await expect(adaText).toHaveValue(/Follow-up from Ada/);
  await expect(adaText).toHaveValue(/\[Grace\]/);
  await expect(graceText).toHaveValue(await adaText.inputValue());
});
