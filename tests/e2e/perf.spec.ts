// PLAN.md §9.4 budgets measured in a real browser. Opt-in: PERF=1 npm run test:e2e -- perf.spec.ts
// Writes test-results/perf-<browser>.json; docs/performance.md records the numbers with the device used.
import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

test.skip(!process.env.PERF, 'Set PERF=1 to run the performance budget checks.');

const p95 = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.ceil(xs.length * 0.95) - 1];

test('256 × 256 Life at 30 gen/s for 30 s; pause and edit latency', async ({ page, browserName }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.getByRole('button', { name: 'New 2D Life-like model' }).click();
  await page.getByLabel('Width').fill('256');
  await page.getByLabel('Height').fill('256');
  await page.getByRole('button', { name: 'Apply size' }).click();
  await page.getByLabel('Alive (%)').fill('30');
  await page.getByRole('button', { name: 'Fill lattice randomly' }).click();
  await expect(page.getByRole('button', { name: 'Play' })).toBeEnabled();

  // Edit latency, measured on the 256² grid (stricter than the default size): Enter → KPI update.
  const edits: number[] = [];
  await page.getByRole('application', { name: /^Lattice/ }).focus();
  for (let i = 0; i < 20; i++) {
    const before = await page.locator('.kpi').first().locator('.kpi-value').textContent();
    const t0 = Date.now();
    await page.keyboard.press('Enter');
    await expect(page.locator('.kpi').first().locator('.kpi-value')).not.toHaveText(before!);
    edits.push(Date.now() - t0);
  }

  // Count lattice draws while running.
  await page.evaluate(() => {
    const w = window as unknown as { __draws: number };
    w.__draws = 0;
    const orig = CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage = function (this: CanvasRenderingContext2D, ...a: unknown[]) {
      if ((this.canvas as HTMLCanvasElement).closest('.canvas-frame')) w.__draws++;
      return (orig as (...x: unknown[]) => void).apply(this, a);
    } as never;
  });
  await page.getByLabel('Speed').fill('5'); // index 5 = 30 gen/s
  await expect(page.getByText('30 gen/s', { exact: true })).toBeVisible();
  const gen = async () => Number((await page.locator('.canvas-status strong').first().textContent()) ?? 0);
  const g0 = await gen();
  const t0 = Date.now();
  await page.getByRole('button', { name: 'Play' }).click();
  await page.waitForTimeout(30_000);
  const draws = await page.evaluate(() => (window as unknown as { __draws: number }).__draws);
  await page.getByRole('button', { name: 'Pause' }).click();
  await expect(page.getByRole('button', { name: 'Play' })).toBeVisible();
  const elapsed = (Date.now() - t0) / 1000;
  const g1 = await gen();

  const pauses: number[] = [];
  for (let i = 0; i < 20; i++) {
    await page.getByRole('button', { name: 'Play' }).click();
    await page.waitForTimeout(150);
    const t = Date.now();
    await page.getByRole('button', { name: 'Pause' }).click();
    await expect(page.getByRole('button', { name: 'Play' })).toBeVisible();
    pauses.push(Date.now() - t);
  }

  const result = {
    browser: browserName,
    recordedAt: new Date().toISOString(),
    userAgent: await page.evaluate(() => navigator.userAgent),
    grid: '256 × 256',
    rule: 'B3/S23',
    density: 0.3,
    requestedRate: 30,
    achievedRate: (g1 - g0) / elapsed,
    displayedFps: draws / 30,
    pauseAckP95Ms: p95(pauses),
    editP95Ms: p95(edits),
  };
  mkdirSync('test-results', { recursive: true });
  writeFileSync(`test-results/perf-${browserName}.json`, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
  expect(result.achievedRate).toBeGreaterThanOrEqual(28.5);
  expect(result.displayedFps).toBeGreaterThanOrEqual(28.5);
  expect(result.pauseAckP95Ms).toBeLessThan(250);
  expect(result.editP95Ms).toBeLessThan(100);
});
