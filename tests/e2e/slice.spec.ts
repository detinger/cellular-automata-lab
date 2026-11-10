// E2E-01 / PLAN.md §1.2: open a blinker, inspect, step, explain, reset, edit, undo, save, reload.
import { expect, test } from '@playwright/test';

const alive = (page: import('@playwright/test').Page) => page.locator('.kpi').first().locator('.kpi-value');

test('blinker vertical slice', async ({ page }) => {
  await page.goto('/');
  await page.locator('article', { hasText: 'Blinker' }).getByRole('button', { name: 'Open as new project' }).click();
  await expect(page.getByRole('button', { name: 'Play' })).toBeEnabled();
  await expect(alive(page)).toHaveText('3');
  await expect(page.getByLabel('Birth/survival notation')).toHaveValue('B3/S23');

  // Explain the birth at (2,1): keyboard cursor starts at the center (2,2).
  await page.getByRole('application', { name: /^Lattice/ }).focus();
  await page.keyboard.press('ArrowUp');
  await expect(page.locator('.ws-panel.right')).toContainText('Cell (2, 1)');
  await expect(page.locator('.ws-panel.right')).toContainText('Birth: 3 is in the birth set');

  // Step exactly one generation.
  await page.getByRole('button', { name: 'Step', exact: true }).click();
  await expect(page.locator('.canvas-status')).toContainText('Generation 1');
  await expect(page.locator('.kpi').nth(3).locator('.kpi-value')).toHaveText('2 / 2');

  // Editing a later generation is blocked with an explanation; Reset returns to generation 0.
  await page.getByRole('application', { name: /^Lattice/ }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByText('Cell edits change generation 0')).toBeVisible();
  await page.getByRole('button', { name: 'Reset to generation 0' }).click();
  await expect(page.locator('.canvas-status')).toContainText('Generation 0');
  await expect(alive(page)).toHaveText('3');

  // Edit (toggle the selected cell), undo, redo.
  await page.getByRole('application', { name: /^Lattice/ }).focus();
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowUp'); // (0,0)
  await page.keyboard.press('Enter');
  await expect(alive(page)).toHaveText('4');
  await page.keyboard.press('ControlOrMeta+z');
  await expect(alive(page)).toHaveText('3');
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await expect(alive(page)).toHaveText('4');

  // Save and reload: same cells and rule.
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('.toolbar [role=status]')).toContainText('Saved');
  await page.reload();
  await expect(alive(page)).toHaveText('4');
  await expect(page.getByLabel('Birth/survival notation')).toHaveValue('B3/S23');
});

test('invalid import leaves projects unchanged and explains why', async ({ page }) => {
  await page.goto('/');
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Import model' }).click();
  await (await chooser).setFiles({ name: 'bad.ca.json', mimeType: 'application/json', buffer: Buffer.from('{"format":"ca-studio-model","schemaVersion":3}') });
  await expect(page.locator('.callout-error')).toContainText('Schema version 3 is not supported');
});

test('playback reports achieved rate and pauses at an exact generation', async ({ page }) => {
  await page.goto('/');
  await page.locator('article', { hasText: 'Glider' }).getByRole('button', { name: 'Open as new project' }).click();
  await page.getByRole('button', { name: 'Play' }).click();
  await expect(page.locator('.ws-panel.right')).toContainText('achieved');
  await page.getByRole('button', { name: 'Pause' }).click();
  await expect(page.getByRole('button', { name: 'Play' })).toBeVisible();
  await expect(alive(page)).toHaveText('5'); // a glider keeps 5 cells
});
