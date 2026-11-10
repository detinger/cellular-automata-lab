// INT-05 (migration), INT-06 (storage full), E2E-07 (offline after caching).
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

const fixture = JSON.parse(readFileSync(new URL('../fixtures/blinker-5x5.ca.json', import.meta.url), 'utf8'));

test('INT-05: a version-1 database migrates; projects open and gain the default seed', async ({ page }) => {
  await page.goto('/healthz'); // same origin, app not loaded
  await page.evaluate(async (spec) => {
    await new Promise<void>((res) => {
      const r = indexedDB.deleteDatabase('ca-studio');
      r.onsuccess = r.onerror = r.onblocked = () => res();
    });
    // Exactly what Dexie created for schema version 1 (IndexedDB version 10).
    const db = await new Promise<IDBDatabase>((res, rej) => {
      const r = indexedDB.open('ca-studio', 10);
      r.onupgradeneeded = () => {
        const p = r.result.createObjectStore('projects', { keyPath: 'id' });
        p.createIndex('updatedAt', 'updatedAt');
        const v = r.result.createObjectStore('revisions', { keyPath: 'id' });
        v.createIndex('projectId', 'projectId');
        v.createIndex('hash', 'hash');
      };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    const t = '2026-01-01T00:00:00.000Z';
    await new Promise<void>((res, rej) => {
      const tx = db.transaction(['projects', 'revisions'], 'readwrite');
      tx.objectStore('revisions').put({
        id: 'rev-old',
        projectId: 'prj-old',
        parentRevisionId: null,
        hash: 'x',
        createdAt: t,
        reason: 'created',
        spec: { ...spec, projectId: 'prj-old', revisionId: 'rev-old' },
      });
      tx.objectStore('projects').put({
        id: 'prj-old',
        name: 'Old blinker',
        createdAt: t,
        updatedAt: t,
        activeRevisionId: 'rev-old',
        revisionIds: ['rev-old'],
        view: null,
        origin: 'import:old.ca.json',
      });
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
    db.close();
  }, fixture);

  await page.goto('/');
  await page.getByRole('link', { name: 'Old blinker' }).click();
  await expect(page.getByRole('button', { name: 'Play' })).toBeEnabled();
  await expect(page.locator('.kpi').first().locator('.kpi-value')).toHaveText('3');
  const seed = await page.evaluate(
    () =>
      new Promise((res) => {
        const r = indexedDB.open('ca-studio');
        r.onsuccess = () => {
          const g = r.result.transaction('projects').objectStore('projects').get('prj-old');
          g.onsuccess = () => res([r.result.version, g.result.seed]);
        };
      }),
  );
  expect(seed).toEqual([30, '1']);
});

test('INT-05: data from a newer app version is refused, not modified', async ({ page }) => {
  await page.goto('/healthz');
  await page.evaluate(async () => {
    await new Promise<void>((res) => {
      const r = indexedDB.deleteDatabase('ca-studio');
      r.onsuccess = r.onerror = r.onblocked = () => res();
    });
    await new Promise<void>((res) => {
      const r = indexedDB.open('ca-studio', 990);
      r.onupgradeneeded = () => r.result.createObjectStore('future', { keyPath: 'id' });
      r.onsuccess = () => {
        r.result.close();
        res();
      };
    });
  });
  await page.goto('/');
  await expect(page.getByText(/data from a newer version of Cellular Automata Lab/)).toBeVisible();
  const stores = await page.evaluate(
    () =>
      new Promise((res) => {
        const r = indexedDB.open('ca-studio');
        r.onsuccess = () => res([r.result.version, [...r.result.objectStoreNames]]);
      }),
  );
  expect(stores).toEqual([990, ['future']]);
});

test('INT-06: when storage is full the model stays usable, the failure is shown and export works', async ({ page }) => {
  await page.addInitScript(() => {
    for (const m of ['put', 'add'] as const) {
      const orig = IDBObjectStore.prototype[m];
      IDBObjectStore.prototype[m] = function (this: IDBObjectStore, ...args: unknown[]) {
        if ((window as unknown as { __quota?: boolean }).__quota) throw new DOMException('Quota exceeded', 'QuotaExceededError');
        return (orig as (...a: unknown[]) => IDBRequest).apply(this, args);
      } as never;
    }
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'New 2D Life-like model' }).click();
  await expect(page.getByRole('button', { name: 'Play' })).toBeEnabled();
  await page.evaluate(() => {
    (window as unknown as { __quota: boolean }).__quota = true;
  });
  await page.getByRole('application', { name: /^Lattice/ }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByText('Not saved')).toBeVisible();
  await expect(page.getByText(/Browser storage is full/)).toBeVisible();
  await expect(page.locator('.toolbar [role=status]')).toHaveText('Save failed');
  // Still usable in memory.
  await page.getByRole('button', { name: 'Step', exact: true }).click();
  await expect(page.locator('.canvas-status')).toContainText('Generation 1');
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export this model now' }).click()]);
  const json = JSON.parse(Buffer.concat(await (await download.createReadStream()).toArray()).toString());
  expect(json.format).toBe('ca-studio-model');
  expect(Buffer.from(json.initial.data, 'base64').reduce((a: number, b: number) => a + b, 0)).toBe(1);
});

test('E2E-07: after one online visit the app, lessons and local projects work offline', async ({ page, context, browserName }) => {
  test.skip(browserName === 'webkit', 'Playwright WebKit does not support service workers with setOffline reliably.');
  await page.goto('/');
  await page.getByRole('button', { name: 'New 2D Life-like model' }).click();
  await expect(page.getByRole('button', { name: 'Play' })).toBeEnabled();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.waitForFunction(
    async () =>
      (await caches.keys()).some((k) => k.startsWith('ca-studio-app-')) &&
      !!(await (await caches.open((await caches.keys()).find((k) => k.startsWith('ca-studio-app-'))!)).keys()).length,
  );
  await page.reload(); // now controlled by the service worker
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  const url = page.url();

  await context.setOffline(true);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Models' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Untitled model' })).toBeVisible();
  await page.goto(url);
  await expect(page.getByRole('button', { name: 'Play' })).toBeEnabled();
  await page.getByRole('button', { name: 'Step', exact: true }).click();
  await expect(page.locator('.canvas-status')).toContainText('Generation 1');
  await page.goto('/#/lesson/L01-cells-states');
  await expect(page.getByRole('heading', { name: 'Cells, states and generations' })).toBeVisible();
  await context.setOffline(false);
});
