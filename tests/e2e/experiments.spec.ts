// E2E-03 (2 × 3 grid, 3 replicates → 18 runs), E2E-04 (cancel, export, reload) and
// E2E-06 (report values reconcile with the metrics CSV and run metadata).
import { expect, test, type Download, type Page } from '@playwright/test';

const openPreset = async (page: Page, name: string) => {
  await page.goto('/');
  await page.locator('article', { hasText: name }).getByRole('button', { name: 'Open as new project' }).click();
  await expect(page.getByRole('button', { name: 'Play' })).toBeEnabled();
};
/** RFC 4180 line splitter: commas inside quoted fields do not split. */
const splitCsv = (line: string) => {
  const out: string[] = [];
  let cur = '',
    q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out;
};
const text = async (d: Promise<Download>) => Buffer.concat(await (await (await d).createReadStream()).toArray()).toString('utf8');

test('E2E-03/06: an 18-run sweep completes with provenance and the report reconciles with the CSV', async ({ page }) => {
  test.setTimeout(90_000);
  await openPreset(page, 'Isolated SIR infection');
  await page.getByRole('button', { name: 'Experiment', exact: true }).click();
  await expect(page.getByRole('heading', { name: /experiment/ })).toBeVisible();
  await page.getByLabel('Research question').fill('How do β and γ change the final recovered share?');
  await page.getByRole('button', { name: 'Add factor' }).click();
  await page.getByLabel('Factor 2', { exact: true }).selectOption('rule.gamma');
  const values = page.getByLabel('Values (comma-separated)');
  await values.nth(0).fill('0.1, 0.2, 0.3');
  await values.nth(0).blur();
  await values.nth(1).fill('0.2, 0.5');
  await values.nth(1).blur();
  await page.getByLabel('Replicates per configuration').fill('3');
  await page.getByLabel('Horizon (generations)').fill('60');
  await expect(page.getByRole('button', { name: 'Run 18 runs' })).toBeEnabled();
  await page.getByRole('button', { name: 'Run 18 runs' }).click();
  await expect(page.locator('h1 .badge')).toHaveText('completed', { timeout: 60_000 });
  const rows = page.locator('section', { hasText: 'Results by configuration' }).locator('tbody tr');
  await expect(rows).toHaveCount(6);
  for (let i = 0; i < 6; i++) await expect(rows.nth(i).locator('td').nth(2)).toHaveText('3/3');
  await expect(page.locator('section', { hasText: 'Runs (18)' })).toBeVisible();

  const csv = await text(Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Metrics CSV' }).click()]).then(([d]) => d));
  const report = await text(Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Report' }).click()]).then(([d]) => d));
  const json = JSON.parse(
    await text(Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Experiment JSON' }).click()]).then(([d]) => d)),
  );

  // Recompute each configuration's mean final recovered fraction from the CSV alone.
  const lines = csv.trim().split('\r\n');
  const head = splitCsv(lines[0]);
  const col = (n: string) => head.indexOf(n);
  const last = new Map<string, string[]>();
  for (const l of lines.slice(1)) {
    const c = splitCsv(l);
    last.set(c[col('run_id')], c);
  }
  expect(last.size).toBe(18);
  const byConfig = new Map<string, number[]>();
  for (const c of last.values()) {
    expect(c[col('generation')]).toBe('60');
    const k = `${c[col('factor:Infection probability β')]}|${c[col('factor:Recovery probability γ')]}`;
    byConfig.set(k, [...(byConfig.get(k) ?? []), Number(c[col('fraction:Recovered')])]);
  }
  const tableRows = report.split('\n').filter((l) => /^\| 0\.\d+ \| 0\.\d+ \|/.test(l));
  expect(tableRows).toHaveLength(6);
  for (const r of tableRows) {
    const cells = r
      .split('|')
      .map((s) => s.trim())
      .filter(Boolean);
    const xs = byConfig.get(`${cells[0]}|${cells[1]}`)!;
    expect(xs).toHaveLength(3);
    const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
    expect(Number(cells[3])).toBeCloseTo(mean, 4);
  }
  // Run metadata: manifest, seeds and versions are all present and consistent.
  expect(json.manifest).toHaveLength(18);
  expect(new Set(json.manifest.map((m: { seeds: { transition: string } }) => m.seeds.transition)).size).toBe(18);
  expect(
    json.runs.every(
      (r: { status: string; engineVersion: string; initialHash: string }) => r.status === 'completed' && r.engineVersion && r.initialHash.length === 64,
    ),
  ).toBe(true);
  expect(report).toContain('Student-t interval');
});

test('E2E-04: cancel a sweep, export, reload — statuses survive and nothing is fabricated', async ({ page }) => {
  test.setTimeout(90_000);
  await openPreset(page, 'Forest-fire regrowth');
  await page.getByRole('button', { name: 'Experiment', exact: true }).click();
  await page.getByLabel('Horizon (generations)').fill('4000');
  await page.getByLabel('Replicates per configuration').fill('6');
  await page.getByLabel('Analysis window from').fill('0');
  await page.getByRole('button', { name: 'Run 6 runs' }).click();
  await expect(page.getByText(/1 of 6 runs complete/)).toBeVisible({ timeout: 60_000 });
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.locator('h1 .badge')).toHaveText('cancelled', { timeout: 20_000 });
  const runs = page.locator('section', { hasText: /^Runs \(/ });
  await expect(runs.locator('tbody tr', { hasText: 'cancelled' })).toHaveCount(1);
  const completed = await runs.locator('tbody tr', { hasText: 'completed' }).count();
  expect(completed).toBeGreaterThanOrEqual(1);
  expect(completed).toBeLessThan(6);

  const report = await text(Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Report' }).click()]).then(([d]) => d));
  expect(report).toContain('status: **cancelled**');
  expect(report).toContain(`| ${completed}/6 |`);
  expect(report).toMatch(/cancelled before every run finished/);

  await page.reload();
  await expect(page.locator('h1 .badge')).toHaveText('cancelled');
  await expect(runs.locator('tbody tr', { hasText: 'cancelled' })).toHaveCount(1);
  await expect(page.locator('section', { hasText: 'Results by configuration' }).locator('tbody td').first()).toHaveText(`${completed}/6`);
  await expect(page.getByRole('button', { name: /Resume remaining/ })).toBeVisible();
});
