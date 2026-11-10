// Multistate and stochastic families, observed draws, checkpoint replay, family switching.
import { expect, test, type Page } from '@playwright/test';

const openPreset = async (page: Page, name: string) => {
  await page.goto('/');
  await page.locator('article', { hasText: name }).getByRole('button', { name: 'Open as new project' }).click();
  await expect(page.getByRole('button', { name: 'Play' })).toBeEnabled();
};
const gen = (page: Page) => page.locator('.canvas-status');

test('SIR: step, inspect the observed draw, replay back and forth to identical state', async ({ page }) => {
  await openPreset(page, 'Isolated SIR infection');
  await expect(page.getByLabel('Transition seed', { exact: true })).toHaveValue('1');
  await page.getByLabel('Generations to advance').fill('7');
  await page.getByRole('button', { name: 'Step 7' }).click();
  await expect(gen(page)).toContainText('Generation 7');
  const counts = await page.locator('.kpi-grid').textContent();

  // Inspect the center cell (keyboard cursor starts at the center).
  await page.getByRole('application', { name: /^Lattice/ }).focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowLeft');
  const insp = page.locator('.ws-panel.right');
  await expect(insp).toContainText('Cell (32, 32) at generation 7');
  await expect(insp).toContainText('Observed last step');
  await expect(insp).toContainText('Generation 6 → 7');

  // Replay back 3 generations, then forward again: the state must be identical.
  await page.getByLabel('Generation', { exact: true }).fill('4');
  await page.getByRole('button', { name: 'Go' }).click();
  await expect(gen(page)).toContainText('Generation 4');
  await page.getByLabel('Generation', { exact: true }).fill('7');
  await page.getByRole('button', { name: 'Go' }).click();
  await expect(gen(page)).toContainText('Generation 7');
  await expect(page.locator('.kpi-grid')).toHaveText(counts!);
});

test("switching a blank model to Brian's Brain and painting with a chosen state", async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'New 2D Life-like model' }).click();
  await page.getByLabel('Family').selectOption('brians-brain/v1');
  await expect(page.getByLabel('Label of state 2')).toHaveValue('Refractory');
  await page.getByLabel('Paint with Firing').check();
  await page.getByRole('application', { name: /^Lattice/ }).focus();
  await page.keyboard.press('Enter'); // cycles 0 → 1
  await expect(page.locator('.kpi').filter({ hasText: 'Firing' }).locator('.kpi-value')).toHaveText('1');
  await page.getByRole('button', { name: 'Step', exact: true }).click();
  await expect(page.locator('.kpi').filter({ hasText: 'Refractory' }).locator('.kpi-value')).toHaveText('1');
});

test('an overlapping count table is explained and not runnable', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'New 2D Life-like model' }).click();
  await page.getByLabel('Family').selectOption('count-table/v1');
  await expect(page.getByRole('button', { name: 'Play' })).toBeEnabled();
  await page.getByRole('button', { name: 'Add clause' }).click(); // a clause for state 0 with no count conditions overlaps clause 1
  await expect(page.locator('.issue')).toContainText('Clauses 1 and 3 both apply');
  await expect(page.getByRole('button', { name: 'Play' })).toBeDisabled();
});
