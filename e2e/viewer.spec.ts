import { existsSync } from 'node:fs';

import { expect, test } from '@playwright/test';

const ORACLE = existsSync('oracle/build/drive-c/DOGZ.DOG/DATA/ALL_PTZ.BHD');

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

test('asks for the game’s files where the oracle is not built', async ({ page }) => {
  test.skip(ORACLE, 'the oracle is built here');
  await page.goto('/viewer.html');

  await expect(page.locator('#choose')).toBeVisible();
});

test('draws a dog from the oracle’s files', async ({ page }) => {
  test.skip(!ORACLE, 'needs the oracle: pnpm oracle');
  await page.goto('/viewer.html');

  await expect(page.locator('#status')).toHaveText(/5 breeds and 36 animations/);
  await expect.poll(() => page.evaluate(drawnPixels)).toBeGreaterThan(5000);

  await page.selectOption('#animation', '8');
  await expect(page.locator('#frame-number')).toHaveText('0 of 140');
});
