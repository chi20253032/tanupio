const { chromium } = require('playwright');
const assert = require('node:assert/strict');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const errors = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('http://127.0.0.1:4173/?test=1', { waitUntil: 'domcontentloaded' });
    await page.locator('#menu').waitFor({ state: 'visible' });
    assert.match(await page.title(), /NEON ARENA/);

    await page.locator('#survival').click();
    await page.locator('#hud').waitFor({ state: 'visible' });
    await page.waitForTimeout(1800);
    assert.equal(await page.locator('#modeName').textContent(), 'SURVIVAL');
    assert.ok(await page.locator('#game').evaluate(c => c.width > 0 && c.height > 0));
    let snapshot = await page.evaluate(() => window.__NEON_TEST__.snapshot());
    assert.ok(snapshot.enemies > 0, 'SURVIVALで敵が出現しません');

    const startX = snapshot.x;
    await page.keyboard.down('ArrowRight');
    await page.waitForTimeout(300);
    await page.keyboard.up('ArrowRight');
    snapshot = await page.evaluate(() => window.__NEON_TEST__.snapshot());
    assert.ok(snapshot.x > startX + 10, 'キーボード移動が動作しません');

    await page.keyboard.down('Space');
    await page.waitForTimeout(120);
    await page.keyboard.up('Space');
    snapshot = await page.evaluate(() => window.__NEON_TEST__.snapshot());
    assert.ok(snapshot.bullets > 0, '射撃で弾が生成されません');
    await page.evaluate(() => window.__NEON_TEST__.forceLevelUp());
    await page.locator('#upgrade').waitFor({ state: 'visible' });
    await page.locator('#choices button').first().click();
    snapshot = await page.evaluate(() => window.__NEON_TEST__.snapshot());
    assert.equal(snapshot.level, 2, 'レベルアップが反映されません');

    await page.goto('http://127.0.0.1:4173/?test=1', { waitUntil: 'domcontentloaded' });
    await page.locator('#story').click();
    assert.equal(await page.locator('#modeName').textContent(), 'STORY');
    assert.equal(await page.evaluate(() => window.__NEON_TEST__.snapshot().mode), 'story');
    for (let stage = 1; stage <= 5; stage++) {
      await page.evaluate(() => window.__NEON_TEST__.forceStageClear());
      await page.locator('#choices button').click();
      if (stage < 5) {
        assert.equal(await page.evaluate(() => window.__NEON_TEST__.snapshot().storyStage), stage + 1);
      }
    }
    assert.match(await page.locator('#overTitle').textContent(), /STORY CLEAR/);

    await page.reload({ waitUntil: 'networkidle' });
    await page.locator('#demo').click();
    assert.equal(await page.locator('#modeName').textContent(), 'SURVIVAL');
    assert.equal(await page.evaluate(() => window.__NEON_TEST__.snapshot().ai), true);
    await page.waitForTimeout(700);

    const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    mobile.on('pageerror', error => errors.push(error.message));
    await mobile.goto('http://127.0.0.1:4173/?test=1', { waitUntil: 'domcontentloaded' });
    await mobile.locator('#survival').tap();
    assert.ok(await mobile.locator('#movePad').isVisible());
    assert.ok(await mobile.locator('#aimPad').isVisible());
    assert.ok(await mobile.locator('#skillBtn').isVisible());
    const moveBox = await mobile.locator('#movePad').boundingBox();
    const mobileStartX = await mobile.evaluate(() => window.__NEON_TEST__.snapshot().x);
    await mobile.mouse.move(moveBox.x + moveBox.width / 2, moveBox.y + moveBox.height / 2);
    await mobile.mouse.down();
    await mobile.mouse.move(moveBox.x + moveBox.width / 2 + 36, moveBox.y + moveBox.height / 2, { steps: 5 });
    await mobile.waitForTimeout(250);
    await mobile.mouse.up();
    const mobileMovedX = await mobile.evaluate(() => window.__NEON_TEST__.snapshot().x);
    assert.ok(mobileMovedX > mobileStartX + 5, 'スマホ用移動スティックが動作しません');
    const aimBox = await mobile.locator('#aimPad').boundingBox();
    await mobile.mouse.move(aimBox.x + aimBox.width / 2, aimBox.y + aimBox.height / 2);
    await mobile.mouse.down();
    await mobile.mouse.move(aimBox.x + aimBox.width / 2 - 36, aimBox.y + aimBox.height / 2, { steps: 5 });
    await mobile.waitForTimeout(250);
    await mobile.mouse.up();
    assert.ok((await mobile.evaluate(() => window.__NEON_TEST__.snapshot().bullets)) > 0, 'スマホ照準スティックから射撃できません');
    await mobile.close();

    const host = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const guest = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    host.setDefaultTimeout(30000);
    guest.setDefaultTimeout(30000);
    host.on('pageerror', error => errors.push('host: ' + error.message));
    guest.on('pageerror', error => errors.push('guest: ' + error.message));
    await host.goto('http://127.0.0.1:4173/?test=1', { waitUntil: 'domcontentloaded' });
    await host.waitForFunction(() => !!window.Peer, null, { timeout: 30000 });
    await host.locator('#online').click();
    await host.locator('details summary').click();
    await host.locator('#hostBtn').click();
    await host.waitForFunction(() => document.querySelector('#netStatus').textContent.includes('招待コード:'));
    const inviteText = await host.locator('#netStatus').textContent();
    const invite = inviteText.split('招待コード:')[1]?.trim().split(/\s/)[0];
    assert.ok(invite, '招待コードを取得できません: ' + inviteText);
    await guest.goto('http://127.0.0.1:4173/?test=1', { waitUntil: 'domcontentloaded' });
    await guest.waitForFunction(() => !!window.Peer, null, { timeout: 30000 });
    await guest.locator('#online').click();
    await guest.locator('details summary').click();
    await guest.locator('#peerCode').fill(invite);
    await guest.locator('#joinBtn').click();
    await host.waitForFunction(() => document.querySelector('#netStatus').textContent.includes('接続成功'), null, { timeout: 45000 });
    await guest.waitForFunction(() => document.querySelector('#netStatus').textContent.includes('接続成功'), null, { timeout: 45000 });
    assert.equal(await host.evaluate(() => window.__NEON_TEST__.snapshot().netRole), 'host');
    assert.equal(await guest.evaluate(() => window.__NEON_TEST__.snapshot().netRole), 'guest');
    const before = await host.evaluate(() => window.__NEON_TEST__.snapshot().remote.x);
    await guest.keyboard.down('ArrowLeft');
    await guest.waitForTimeout(700);
    await guest.keyboard.up('ArrowLeft');
    await host.waitForFunction(v => window.__NEON_TEST__.snapshot().remote.x < v - 10, before);
    await guest.mouse.move(640, 400);
    await guest.keyboard.down('Space');
    await guest.waitForTimeout(1300);
    await guest.keyboard.up('Space');
    await host.waitForFunction(() => window.__NEON_TEST__.snapshot().hp < 100, null, { timeout: 10000 });
    await host.mouse.move(1000, 400);
    await host.keyboard.down('Space');
    await host.waitForTimeout(1300);
    await host.keyboard.up('Space');
    await guest.waitForFunction(() => window.__NEON_TEST__.snapshot().hp < 100, null, { timeout: 10000 });
    await host.close();
    await guest.close();

    assert.deepEqual(errors, [], 'ブラウザ実行時エラーが発生しました');
    process.stdout.write('PASS: desktop survival/story/AI smoke tests and mobile HUD/touch controls\n');
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
