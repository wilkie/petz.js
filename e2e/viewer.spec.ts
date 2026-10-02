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

  await expect(page.locator('#status')).toHaveText(/5 breeds, 36 animations and 330 scripts/);
  await expect.poll(() => page.evaluate(drawnPixels)).toBeGreaterThan(5000);

  await page.selectOption('#animation', '8');
  await expect(page.locator('#frame-number')).toHaveText(/^1 of 140, frame/);
});

test('leaves a dog to itself, live', async ({ page }) => {
  test.skip(!ORACLE, 'needs the oracle: pnpm oracle');
  await page.goto('/viewer.html');

  await expect(page.locator('#status')).toHaveText(/5 breeds/);
  await page.check('#live');

  await expect(page.locator('#mood')).toHaveText(/^e[A-Za-z]+, excitement \d+$/);

  /* Live, drawn at the game's size: a quarter of the pixels. */
  await expect.poll(() => page.evaluate(drawnPixels)).toBeGreaterThan(1250);
});

test('begs for a treat held up', async ({ page }) => {
  test.skip(!ORACLE, 'needs the oracle: pnpm oracle');
  await page.goto('/viewer.html');

  await expect(page.locator('#status')).toHaveText(/5 breeds/);
  await page.check('#live');

  const box = (await page.locator('canvas').boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 3);
  await page.click('#food-red');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 3);

  await expect(page.locator('#mood')).toHaveText(/^eBegging/, { timeout: 20000 });

  /* Once it has begged, its brain wants the red treat, and chooses its tricks. */
  await expect(page.locator('#mood')).toHaveText(/wants TrickRed$/, { timeout: 40000 });
});

test('fetches a ball thrown', async ({ page }) => {
  test.skip(!ORACLE, 'needs the oracle: pnpm oracle');
  await page.goto('/viewer.html');

  await expect(page.locator('#status')).toHaveText(/5 breeds/);
  await page.check('#live');

  const box = (await page.locator('canvas').boundingBox())!;
  const at = (x: number, y: number) =>
    page.mouse.move(box.x + box.width * x, box.y + box.height * y);
  await at(0.3, 0.3);
  await page.click('#ball-out');
  await at(0.3, 0.3);
  await page.waitForTimeout(3000);

  /* Dragged to the right and let go. */
  await page.mouse.down();
  for (let n = 1; n <= 4; n++) {
    await at(0.3 + 0.05 * n, 0.3);
    await page.waitForTimeout(45);
  }
  await page.mouse.up();

  await expect(page.locator('#mood')).toHaveText(/^eReturningBall/, { timeout: 30000 });
});

test('flinches when sprayed', async ({ page }) => {
  test.skip(!ORACLE, 'needs the oracle: pnpm oracle');
  await page.goto('/viewer.html');

  await expect(page.locator('#status')).toHaveText(/5 breeds/);
  await page.check('#live');
  await page.waitForTimeout(1000);

  const box = (await page.locator('canvas').boundingBox())!;
  await page.click('#spray-out');

  /* The middle of what is drawn: the dog. */
  const dog = await page.evaluate(() => {
    const canvas = document.querySelector('canvas')!;
    const { data } = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height);
    let [x, y, n] = [0, 0, 0];

    for (let at = 3; at < data.length; at += 4) {
      if (data[at]) {
        x += ((at - 3) / 4) % canvas.width;
        y += Math.floor((at - 3) / 4 / canvas.width);
        n++;
      }
    }

    return { x: x / n, y: y / n, width: canvas.width };
  });
  const scale = box.width / dog.width;

  await page.mouse.move(box.x + dog.x * scale, box.y + dog.y * scale);
  await page.mouse.down();
  await page.mouse.up();

  await expect(page.locator('#mood')).toHaveText(/^eSprayReact/, { timeout: 5000 });
});

test('goes for a shoe it is teased with', async ({ page }) => {
  test.skip(!ORACLE, 'needs the oracle: pnpm oracle');
  await page.goto('/viewer.html');

  await expect(page.locator('#status')).toHaveText(/5 breeds/);
  await page.check('#live');

  const box = (await page.locator('canvas').boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 3);
  await page.click('#shoe-out');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 3);

  await expect(page.locator('#mood')).toHaveText(/^e[A-Za-z]+Cursor/, { timeout: 5000 });
});

test('offers the paint colours for the brush, as the game’s menu does', async ({ page }) => {
  test.skip(!ORACLE, 'needs the oracle: pnpm oracle');
  await page.goto('/viewer.html');

  await expect(page.locator('#status')).toHaveText(/5 breeds/);
  await expect(page.locator('#brush-colours .swatch')).toHaveCount(20);
  await page.selectOption('#colours', '16');
  await expect(page.locator('#brush-colours .swatch')).toHaveCount(16);
});
