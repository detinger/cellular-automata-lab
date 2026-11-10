// Accessibility: every interactive control has an accessible name, on every main page. This is an
// automated floor, not a replacement for the manual review recorded in docs/acceptance.
import { expect, test, type Page } from '@playwright/test';

async function unnamedControls(page: Page) {
  return page.evaluate(() => {
    const bad: string[] = [];
    for (const el of Array.from(document.querySelectorAll<HTMLElement>('button, a[href], input, select, textarea, [role="application"], [tabindex="0"]'))) {
      if (el.closest('[hidden]') || (el as HTMLInputElement).type === 'hidden' || el.offsetParent === null) continue;
      const labelled = el
        .getAttribute('aria-labelledby')
        ?.split(' ')
        .map((id) => document.getElementById(id)?.textContent?.trim())
        .join('');
      const labels = (el as HTMLInputElement).labels
        ? Array.from((el as HTMLInputElement).labels!)
            .map((l) => l.textContent?.trim())
            .join('')
        : '';
      const name = el.getAttribute('aria-label') || labelled || labels || el.textContent?.trim() || el.getAttribute('title') || el.getAttribute('placeholder');
      if (!name) bad.push(el.outerHTML.slice(0, 120));
    }
    return bad;
  });
}

test('all controls on the main pages have accessible names', async ({ page }) => {
  test.setTimeout(90_000);
  const check = async (where: string) => expect(await unnamedControls(page), where).toEqual([]);
  await page.goto('/');
  await check('library');
  for (const preset of ['Blinker', 'Rule 30', 'Isolated SIR infection', 'Majority vote (count table)', 'Cyclic CA from noise']) {
    await page.goto('/');
    await page
      .locator('article', { has: page.getByRole('heading', { name: preset, exact: true }) })
      .getByRole('button', { name: 'Open as new project' })
      .click();
    await expect(page.getByRole('button', { name: 'Play' })).toBeEnabled();
    await check(`workspace: ${preset}`);
    if (preset === 'Isolated SIR infection') {
      await page.getByRole('button', { name: 'Experiment', exact: true }).click();
      await expect(page.getByLabel('Research question')).toBeVisible();
      await check('experiment designer');
    }
  }
  for (const path of ['/#/learn', '/#/lesson/L06-elementary', '/#/challenge/CA-04', '/#/experiments', '/#/capabilities']) {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    await check(path);
  }
});

test('reduced motion: lessons never autoplay', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/#/lesson/L05-patterns');
  await expect(page.locator('.lesson-demo p.tabular')).toHaveText(/^Generation 0\./);
  await page.waitForTimeout(500);
  await expect(page.locator('.lesson-demo p.tabular')).toHaveText(/^Generation 0\./);
});

test('no horizontal page scroll at 390 px wide', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const noScroll = async (where: string) =>
    expect(await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]), where).toEqual(
      await page.evaluate(() => [document.documentElement.clientWidth, document.documentElement.clientWidth]),
    );
  await page.goto('/');
  await noScroll('library');
  await page
    .locator('article', { has: page.getByRole('heading', { name: 'Isolated SIR infection', exact: true }) })
    .getByRole('button', { name: 'Open as new project' })
    .click();
  await expect(page.getByRole('button', { name: 'Play' })).toBeEnabled();
  await noScroll('workspace');
  for (const path of ['/#/learn', '/#/lesson/L03-neighborhoods', '/#/challenge/CA-07', '/#/experiments', '/#/capabilities']) {
    await page.goto(path);
    await noScroll(path);
  }
});

test('the left menu collapses to an icon rail, remembers it, and expands again', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');
  const nav = page.getByRole('navigation', { name: 'Main' });
  expect((await nav.boundingBox())!.width).toBeGreaterThan(200);
  await page.getByRole('button', { name: 'Collapse menu' }).click();
  await expect.poll(async () => (await nav.boundingBox())!.width).toBeLessThan(70);
  await expect(nav.getByText('Experiments')).toBeHidden();
  await expect(nav.getByRole('link', { name: 'Experiments' })).toHaveAttribute('title', 'Experiments');
  await page.reload();
  await expect(page.getByRole('button', { name: 'Expand menu' })).toHaveAttribute('aria-expanded', 'false');
  await page.getByRole('button', { name: 'Expand menu' }).click();
  await expect.poll(async () => (await nav.boundingBox())!.width).toBeGreaterThan(200);
});
