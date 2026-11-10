// PLAN.md §9.3 E2E-02: finish a lesson and a challenge with the keyboard; feedback is meaningful and progress persists.
import { expect, test } from '@playwright/test';

test('E2E-02: lesson and challenge completed with the keyboard only', async ({ page }) => {
  await page.goto('/#/lesson/L01-cells-states');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Cells, states and generations');

  // Demo controls are locked until the prediction is made.
  await expect(page.getByRole('button', { name: 'Step', exact: true })).toBeDisabled();
  const first = page.getByRole('radio', { name: '0', exact: true });
  await first.focus();
  await page.keyboard.press('ArrowDown'); // '2' (wrong)
  await expect(page.getByText('Not quite.')).toBeVisible();
  await page.keyboard.press('ArrowDown'); // '3' (right)
  await expect(page.getByRole('status').filter({ hasText: 'Correct.' }).first()).toBeVisible();

  const step = page.getByRole('button', { name: 'Step', exact: true });
  await expect(step).toBeEnabled();
  await step.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByText('Generation 1. 22 Dead, 3 Alive.')).toBeVisible();

  await page.getByRole('radio', { name: 'The initial condition you set' }).focus();
  await page.keyboard.press('Space');
  await page.getByRole('radio', { name: 'How quickly generations are shown' }).focus();
  await page.keyboard.press('Space');
  await page.getByLabel('Reflection').focus();
  await page.keyboard.type('A generation is a model step; a frame is only a picture on the screen.');
  await page.keyboard.press('Tab');
  await expect(page.getByText('Lesson complete', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.locator('h1 .badge')).toHaveText('Completed');

  // Challenge CA-02: build a block with the keyboard cursor.
  await page.goto('/#/challenge/CA-02');
  const start = page.getByRole('button', { name: 'Start a new attempt' });
  await start.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Play' })).toBeEnabled();
  await page.getByRole('application', { name: /^Lattice/ }).focus();
  for (const k of ['Enter', 'ArrowRight', 'Enter', 'ArrowDown', 'Enter', 'ArrowLeft', 'Enter']) await page.keyboard.press(k);
  await expect(page.locator('.kpi').first().locator('.kpi-value')).toHaveText('4');
  const save = page.getByRole('button', { name: 'Save', exact: true });
  await save.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.toolbar [role=status]')).toContainText('Saved');

  await page.goto('/#/challenge/CA-02');
  const check = page.getByRole('button', { name: 'Check my work' });
  await expect(check).toBeEnabled();
  await check.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('td .pass')).toHaveCount(3);
  await expect(page.locator('h1 .badge')).toHaveText('Passed');
  await page.reload();
  await expect(page.locator('h1 .badge')).toHaveText('Passed');
  await expect(page.locator('td .pass')).toHaveCount(3); // last assessment is shown again

  await page.goto('/#/learn');
  await expect(page.getByText('1 of 12 lessons and 1 of 10 challenges completed')).toBeVisible();
});
