// PLAN.md §9.3 E2E-05: baseline/alternative with a changed boundary — the diff lists the change and the
// comparison uses the right normalization; plus a paired replicated SIR comparison.
import { expect, test, type Page } from '@playwright/test';

const openPreset = async (page: Page, name: string) => {
  await page.goto('/');
  await page.locator('article', { hasText: name }).getByRole('button', { name: 'Open as new project' }).click();
  await expect(page.getByRole('button', { name: 'Play' })).toBeEnabled();
};

test('E2E-05: changed boundary is listed; Hamming distance is available for equal sizes', async ({ page }) => {
  await openPreset(page, 'Glider');
  await page.getByRole('button', { name: 'Compare' }).click();
  await expect(page.getByRole('heading', { name: 'Baseline vs. alternative' })).toBeVisible();
  await expect(page.getByText('No differences')).toBeVisible();

  // Change only the alternative's boundary.
  await page.locator('.compare-side', { hasText: 'Alternative' }).locator('.compare-side-head a').click();
  await page.getByLabel('Off-grid neighbors').selectOption('fixed-0');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('.toolbar [role=status]')).toContainText('Saved');
  await page.goBack();
  await expect(page.getByRole('heading', { name: 'Baseline vs. alternative' })).toBeVisible();

  const diff = page.locator('section', { hasText: 'Changed assumptions' }).locator('tbody tr');
  await expect(diff).toHaveCount(1);
  await expect(diff.first()).toContainText('Boundary');
  await expect(diff.first()).toContainText('Periodic (torus)');
  await expect(diff.first()).toContainText('Fixed exterior (Dead)');

  await page.getByLabel('Generations', { exact: true }).fill('120');
  await page.getByRole('button', { name: 'Step both 120' }).click();
  await expect(page.getByText(/Hamming distance at generation 120: [\d.]+% of sites differ/)).toBeVisible();
  // The glider survives on the torus but becomes a block at the corner: the populations differ.
  await expect(
    page.locator('.compare-side', { hasText: 'Baseline' }).locator('.kpi', { hasText: 'Alive' }).locator('.hint, .kpi-detail').first(),
  ).toContainText('5 of 1024');
  await expect(
    page.locator('.compare-side', { hasText: 'Alternative' }).locator('.kpi', { hasText: 'Alive' }).locator('.hint, .kpi-detail').first(),
  ).toContainText('4 of 1024');
});

test('paired SIR comparison runs and keeps its interpretation', async ({ page }) => {
  test.setTimeout(90_000);
  await openPreset(page, 'Isolated SIR infection');
  await page.getByRole('button', { name: 'Compare' }).click();
  await page.locator('.compare-side', { hasText: 'Alternative' }).locator('.compare-side-head a').click();
  await page.getByLabel('Infection probability β (per infected neighbor)').fill('0.5');
  await page.getByLabel('Infection probability β (per infected neighbor)').blur();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('.toolbar [role=status]')).toContainText('Saved');
  await page.goBack();
  await expect(page.locator('section', { hasText: 'Changed assumptions' }).locator('tbody tr')).toHaveCount(1);
  await page.getByLabel('Design').selectOption('paired');
  await page.getByLabel('Runs per side').fill('5');
  await page.getByLabel('Horizon').fill('40');
  await page.getByRole('button', { name: 'Run 5 + 5 runs' }).click();
  await expect(page.getByText('Alternative − baseline:')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText(/Mean of paired differences/)).toBeVisible();
  await page.getByRole('textbox', { name: 'Interpretation' }).fill('Doubling β speeds the outbreak in every pair.');
  await page.getByRole('textbox', { name: 'Interpretation' }).blur();
  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Interpretation' })).toHaveValue('Doubling β speeds the outbreak in every pair.');
  await expect(page.getByText('Alternative − baseline:')).toBeVisible();
});
