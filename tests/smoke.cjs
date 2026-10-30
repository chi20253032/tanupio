const { chromium } = require('playwright');
const assert = require('node:assert/strict');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const errors = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('http://127.0.0.1:4173', { waitUntil: 'networkidle' });
    await page.locator('#menu').waitFor({ state: 'visible' });
    assert.match(await page.title(), /NEON ARENA/);

    await page.locator('#survival').click();
    await page.locator('#hud').waitFor({ state: 'visible' });
    await page.waitForTimeout(1800);
    assert.equal(await page.locator('#modeName').textContent(), 'SURVIVAL');
    assert.ok(await page.locator('#game').evaluate(c => c.width > 0 && c.height > 0));

    await page.keyboard.down('ArrowRight');
    await page.waitForTimeout(250);
    await page.keyboard.up('ArrowRight');
    await page.keyboard.down('Space');
    await page.waitForTimeout(250);
    await page.keyboard.up('Space');

    await page.reload({ waitUntil: 'networkidle' });
    await page.locator('#story').click();
    assert.equal(await page.locator('#modeName').textContent(), 'STORY');

    await page.reload({ waitUntil: 'networkidle' });
    await page.locator('#demo').click();
    assert.equal(await page.locator('#modeName').textContent(), 'SURVIVAL');
    await page.waitForTimeout(700);

    const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    mobile.on('pageerror', error => errors.push(error.message));
    await mobile.goto('http://127.0.0.1:4173', { waitUntil: 'networkidle' });
    await mobile.locator('#survival').tap();
    assert.ok(await mobile.locator('#movePad').isVisible());
    assert.ok(await mobile.locator('#aimPad').isVisible());
    assert.ok(await mobile.locator('#skillBtn').isVisible());
    await mobile.waitForTimeout(500);
    await mobile.close();

    assert.deepEqual(errors, [], 'ブラウザ実行時エラーが発生しました');
    process.stdout.write('PASS: desktop survival/story/AI smoke tests and mobile HUD/touch controls\n');
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
