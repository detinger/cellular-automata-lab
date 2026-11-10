// Editing: pattern stamps with transforms, seeded random fill, region selection, RLE import/export.
import { expect, test, type Page } from '@playwright/test';

const alive = (page: Page) => page.locator('.kpi').first().locator('.kpi-value');

async function newLifeModel(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'New 2D Life-like model' }).click();
  await expect(page.getByRole('button', { name: 'Play' })).toBeEnabled();
  await expect(alive(page)).toHaveText('0');
}

test('stamp a pattern at the keyboard cursor, rotate it, undo', async ({ page }) => {
  await newLifeModel(page);
  await page.getByLabel('Pattern', { exact: true }).selectOption('blinker');
  await expect(page.getByRole('button', { name: 'Stamping' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('application', { name: /^Lattice/ }).focus();
  await page.keyboard.press('Enter');
  await expect(alive(page)).toHaveText('3');
  await page.keyboard.press('r'); // rotate the stamp: a vertical blinker
  await expect(page.getByRole('img', { name: /^Blinker: 1 by 3/ })).toBeVisible();
  await page.keyboard.press('ControlOrMeta+z');
  await expect(alive(page)).toHaveText('0');
});

test('seeded random fill is reproducible, and a selection can be cleared', async ({ page }) => {
  await newLifeModel(page);
  await page.getByLabel('Alive (%)').fill('30');
  await page.getByLabel('Seed', { exact: true }).fill('12345');
  await page.getByRole('button', { name: 'Fill lattice randomly' }).click();
  await expect(alive(page)).not.toHaveText('0');
  const first = await alive(page).textContent();
  await page.keyboard.press('ControlOrMeta+z');
  await expect(alive(page)).toHaveText('0');
  await page.getByRole('button', { name: 'Fill lattice randomly' }).click();
  await expect(alive(page)).toHaveText(first!);

  // Drag a selection across (and beyond) the whole lattice; it clips to the lattice. Delete clears it.
  await page.keyboard.press('s');
  const box = (await page.locator('.canvas-frame canvas').boundingBox())!;
  await page.mouse.move(box.x + 2, box.y + 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 2, box.y + box.height - 2, { steps: 5 });
  await page.mouse.up();
  await expect(page.locator('.ws-panel.left')).toContainText('64 × 64 cells');
  await expect(page.getByRole('button', { name: 'Fill selection randomly' })).toBeVisible();
  await page.keyboard.press('Delete');
  await expect(alive(page)).toHaveText('0');
});

test('RLE without a rule asks for one, then imports centered', async ({ page }) => {
  await page.goto('/');
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Import model' }).click();
  await (await chooser).setFiles({ name: 'row.rle', mimeType: 'text/plain', buffer: Buffer.from('#N Row\nx = 3, y = 1\n3o!\n') });
  await expect(page.getByText('does not declare a rule')).toBeVisible();
  await page.getByRole('button', { name: 'Import with B3/S23' }).click();
  await expect(page.getByRole('button', { name: 'Play' })).toBeEnabled();
  await expect(alive(page)).toHaveText('3');
  await expect(page.getByLabel('Model name')).toHaveValue('Row');

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'RLE', exact: true }).click();
  const text = await (await (await download).createReadStream()).toArray().then((c) => Buffer.concat(c).toString());
  expect(text).toContain('x = 64, y = 64, rule = B3/S23');
});

test('malformed RLE is rejected with its line number', async ({ page }) => {
  await page.goto('/');
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Import model' }).click();
  await (await chooser).setFiles({ name: 'bad.rle', mimeType: 'text/plain', buffer: Buffer.from('x = 3, y = 1\n3o\n') });
  await expect(page.locator('.callout-error')).toContainText('terminator');
});

test('the lattice box height can be dragged, is remembered, and resets on double-click', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await newLifeModel(page);
  const frame = page.locator('.canvas-frame').first();
  const handle = page.getByRole('separator', { name: 'Resize lattice height' });
  const h0 = (await frame.boundingBox())!.height;
  const width0 = (await frame.boundingBox())!.width;
  const hb = (await handle.boundingBox())!;
  await page.mouse.move(hb.x + hb.width - 8, hb.y + hb.height / 2);
  await page.mouse.down();
  await page.mouse.move(hb.x + hb.width - 8, hb.y + hb.height / 2 + 150, { steps: 6 });
  await page.mouse.up();
  await expect.poll(async () => Math.round((await frame.boundingBox())!.height - h0)).toBeGreaterThan(140);
  expect((await frame.boundingBox())!.width).toBe(width0); // width is unchanged
  const dragged = (await frame.boundingBox())!.height;

  await page.reload();
  await expect(page.getByRole('button', { name: 'Play' })).toBeEnabled();
  await expect.poll(async () => Math.round((await frame.boundingBox())!.height)).toBe(Math.round(dragged));

  await handle.focus();
  await page.keyboard.press('ArrowUp');
  await expect.poll(async () => Math.round((await frame.boundingBox())!.height)).toBe(Math.round(dragged - 20));

  await handle.dblclick();
  await expect.poll(async () => Math.round((await frame.boundingBox())!.height)).toBe(Math.round(h0));
});
