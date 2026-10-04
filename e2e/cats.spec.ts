import { existsSync } from 'node:fs';

import { expect, test } from '@playwright/test';

const CATZ = existsSync('oracle/build/catz-drive-c/CATZ.DOG/PTZFILES/CAT/RESOURCE/CAT.BHD');

/** How many of the canvas's pixels are not its background. */
function drawnPixels() {
  const canvas = document.querySelector('canvas')!;
  const { data } = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height);
  let drawn = 0;

  for (let at = 3; at < data.length; at += 4) {
    drawn += data[at] ? 1 : 0;
  }

  return drawn;
}

test('asks for the Catz demo’s files where it is not installed', async ({ page }) => {
  test.skip(CATZ, 'the Catz demo is installed here');
  await page.goto('/cats.html');

  await expect(page.locator('#choose')).toBeVisible();
});

test('draws a cat from the Catz demo’s files, as kitten or grown', async ({ page }) => {
  test.skip(!CATZ, 'needs the Catz demo: scripts/oracle/install-catz.mjs');
  await page.goto('/cats.html');

  await expect(page.locator('#status')).toHaveText(
    /\d+ breeds, (98|275) animations and \d+ of 805 scripts/,
    /* The CD-ROM's 275 animations take a while to read. */
    { timeout: 30_000 }
  );
  await expect.poll(() => page.evaluate(drawnPixels)).toBeGreaterThan(5000);

  await page.selectOption('#breed', 'HUNTER');
  await page.locator('#kitten').fill('0');
  await expect(page.locator('#kitten-value')).toHaveText('0%');
  await page.locator('#frame').fill('5');
  await expect(page.locator('#frame-number')).toHaveText('5');
  await page.screenshot({ path: 'oracle/build/cats-viewer.png' });
});

test('plays a Catz script out as its frames', async ({ page }) => {
  test.skip(!CATZ, 'needs the Catz demo: scripts/oracle/install-catz.mjs');
  await page.goto('/cats.html');

  await expect(page.locator('#status')).toHaveText(/scripts/, { timeout: 30_000 });
  /* Script 7 plays frames 430 to 441. */
  await page.selectOption('#script', '7');
  await expect(page.locator('#frame-number')).toHaveText('430');
  await page.locator('#frame').fill('11');
  await expect(page.locator('#frame-number')).toHaveText('441');
});
