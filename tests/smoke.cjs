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
    await page.evaluate(()=>{const t=window.__NEON_TEST__;t.clearEnemies();t.setFire(true);t.step(.03);t.setFire(false)});
    assert.ok((await page.evaluate(()=>window.__NEON_TEST__.snapshot())).bullets>0,'空の戦場で射撃弾が残りません');
    assert.equal(await page.locator('#soundToggle').getAttribute('aria-checked'),'true');
    await page.locator('#soundToggle').click();
    assert.equal(await page.locator('#soundToggle').getAttribute('aria-checked'),'false','効果音をOFFにできません');
    await page.locator('#soundToggle').click();

    assert.equal(await page.locator('#autoAimToggle').getAttribute('role'), 'switch');
    await page.evaluate(() => {
      const t = window.__NEON_TEST__;
      t.setAutoAim(true);
      t.addEnemy(t.snapshot().x, t.snapshot().y - 220);
      t.addEnemy(t.snapshot().x + 360, t.snapshot().y);
    });
    await page.waitForTimeout(500);
    snapshot = await page.evaluate(() => window.__NEON_TEST__.snapshot());
    assert.equal(snapshot.autoAim, true, '初心者向けオートエイムをONにできません');
    assert.ok(snapshot.target && snapshot.target.x > snapshot.x + 100, '前方の敵をターゲットできません');
    assert.equal(snapshot.bullets, 0, 'オートエイムが自動射撃しています');

    // Aim assist must work in every direction and redirect only manually fired shots.
    for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]]) {
      await page.evaluate(([x,y]) => {
        const t=window.__NEON_TEST__,s=t.snapshot();t.clearEnemies();
        const l=Math.hypot(x,y),ux=x/l,uy=y/l;
        t.addEnemy(s.x+ux*210,s.y+uy*210);
        t.addEnemy(s.x-uy*55,s.y+ux*55);
        t.setFacing(x,y);t.step(.02);
      }, [dx,dy]);
      snapshot=await page.evaluate(()=>window.__NEON_TEST__.snapshot());
      const expectedX=snapshot.x+dx/Math.hypot(dx,dy)*210;
      const expectedY=snapshot.y+dy/Math.hypot(dx,dy)*210;
      assert.ok(snapshot.target && Math.hypot(snapshot.target.x-expectedX,snapshot.target.y-expectedY)<2, '照準方向 '+dx+','+dy+' のターゲット選択に失敗');
      await page.evaluate(()=>{const t=window.__NEON_TEST__;t.setFire(true);t.step(.02);t.setFire(false)});
      snapshot=await page.evaluate(()=>window.__NEON_TEST__.snapshot());
      const shot=Math.hypot(snapshot.bulletDirection?.x||0,snapshot.bulletDirection?.y||0)||1;
      const dot=(snapshot.bulletDirection.x*dx+snapshot.bulletDirection.y*dy)/(shot*Math.hypot(dx,dy));
      assert.ok(dot>.995, '射撃方向がターゲットに補正されません');
    }
    await page.evaluate(()=>window.__NEON_TEST__.clearEnemies());
    await page.evaluate(() => { const t = window.__NEON_TEST__; t.addOrb(t.snapshot().x + 35, t.snapshot().y); t.step(0.04); });
    snapshot = await page.evaluate(() => window.__NEON_TEST__.snapshot());
    assert.equal(snapshot.orbAbsorbing, true, '経験値オーブの吸収アニメーションが開始しません');
    await page.evaluate(() => { const t = window.__NEON_TEST__; for (let i = 0; i < 10; i++) t.step(0.04); });
    snapshot = await page.evaluate(() => window.__NEON_TEST__.snapshot());
    assert.equal(snapshot.orbCount, 0, '吸収後もオーブが残っています');
    assert.equal(snapshot.xp, 1, 'オーブ吸収時に経験値が加算されません');
    await page.evaluate(() => document.querySelector('#autoAimToggle').click());
    assert.equal(await page.locator('#autoAimToggle').getAttribute('aria-checked'), 'false');

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
    assert.equal(await page.locator('#storyMap').isVisible(),true,'ストーリーマップが表示されません');
    assert.equal(await page.evaluate(()=>window.__NEON_TEST__.snapshot().storyStageCount),8,'ストーリーが8ステージではありません');
    const storyStages=await page.evaluate(()=>window.__NEON_TEST__.storyStages());
    assert.ok(storyStages[7].bossHp>=8000&&storyStages[7].hp>=5&&storyStages[7].speed>=1.8,'最終ステージの難易度がMAX級ではありません');
    await page.evaluate(()=>{const t=window.__NEON_TEST__;t.forceStoryStage(8);t.setStageKills(23);t.spawnEnemy()});
    assert.equal((await page.evaluate(()=>window.__NEON_TEST__.snapshot())).bossHpCurrent,8200,'最終ボスの実HPが8200ではありません');
    await page.evaluate(()=>{window.__NEON_TEST__.forceStoryStage(1)});
    const upgradeNames=await page.evaluate(()=>window.__NEON_TEST__.upgradeNames());
    for(const name of ['クリティカル回路','エーテル磁石','吸収装甲','重力弾','リアクター過給'])assert.ok(upgradeNames.includes(name),'追加強化がありません: '+name);
    await page.evaluate(()=>{const t=window.__NEON_TEST__;t.setStageKills(18);t.spawnEnemy()});
    snapshot=await page.evaluate(()=>window.__NEON_TEST__.snapshot());
    assert.equal(snapshot.bosses,1,'ストーリーの各ステージでボスが出現しません');
    await page.evaluate(()=>{const t=window.__NEON_TEST__;t.clearEnemies();t.setStageKills(24);t.addEnemy(100,100);t.defeatEnemyAt(0)});
    assert.equal(await page.locator('#upgrade').isVisible(),false,'ボスを倒す前にステージクリアになっています');
    await page.evaluate(()=>{const t=window.__NEON_TEST__;t.addEnemy(100,100,true);t.defeatEnemyAt(0)});
    await page.locator('#upgrade').waitFor({state:'visible'});
    assert.match(await page.locator('#choices').textContent(),/STAGE 1 CLEAR/,'最後のボス撃破でステージクリアになりません');
    await page.goto('http://127.0.0.1:4173/?test=1', { waitUntil: 'domcontentloaded' });
    await page.locator('#story').click();
    for (let stage = 1; stage <= 8; stage++) {
      await page.evaluate(() => window.__NEON_TEST__.forceStageClear());
      await page.locator('#choices button').click();
      if (stage < 8) {
        assert.equal(await page.evaluate(() => window.__NEON_TEST__.snapshot().storyStage), stage + 1);
      }
    }
    assert.match(await page.locator('#overTitle').textContent(), /STORY COMPLETE/);

    await page.reload({ waitUntil: 'networkidle' });
    await page.locator('#demo').click();
    assert.equal(await page.locator('#modeName').textContent(), 'SURVIVAL');
    assert.equal(await page.evaluate(() => window.__NEON_TEST__.snapshot().ai), true);
    await page.evaluate(()=>{const t=window.__NEON_TEST__,p=t.snapshot();t.addEnemy(p.x+190,p.y)});
    await page.waitForTimeout(2600);
    snapshot=await page.evaluate(()=>window.__NEON_TEST__.snapshot());
    assert.ok(snapshot.score>0,'AIが敵を攻撃・撃破できません');

    // AI DEMO is autonomous: keyboard, mouse, and touch-style controls cannot steer or fire.
    await page.evaluate(() => {
      const t=window.__NEON_TEST__;t.clearEnemies();t.clearManualInput();t.setManualInput();
      const before=t.snapshot();t.step(.2);const after=t.snapshot();
      window.__AI_INPUT_TEST__={dx:after.x-before.x,dy:after.y-before.y,bullets:after.bullets};
    });
    const aiInput=await page.evaluate(()=>window.__AI_INPUT_TEST__);
    assert.ok(Math.hypot(aiInput.dx,aiInput.dy)<25,'AI観戦中に人間の移動入力が混入しています');
    assert.equal(aiInput.bullets,0,'AI観戦中に人間の射撃入力が混入しています');

    // AI must select its own upgrade and never open the human choice screen.
    const aiLevelBefore=snapshot.level;
    await page.evaluate(()=>window.__NEON_TEST__.forceLevelUp());
    snapshot=await page.evaluate(()=>window.__NEON_TEST__.snapshot());
    assert.equal(snapshot.level,aiLevelBefore+1,'AIのレベルアップが反映されません');
    assert.equal(snapshot.state,'play','AIのレベルアップ後にゲームが停止しています');
    assert.equal(await page.locator('#upgrade').isVisible(),false,'AIが人間の報酬選択画面で停止しています');

    // The limited-time Halloween raid is playable in test mode and awards its clear reward.
    await page.goto('http://127.0.0.1:4173/?test=1', { waitUntil: 'domcontentloaded' });
    assert.equal(await page.locator('#halloween').isDisabled(),false,'テスト時にハロウィンイベントを起動できません');
    await page.locator('#halloween').click();
    assert.equal(await page.evaluate(()=>window.__NEON_TEST__.snapshot().mode),'halloween');
    await page.evaluate(()=>{const t=window.__NEON_TEST__;t.clearEnemies();t.setStageKills(12);t.spawnEnemy()});
    snapshot=await page.evaluate(()=>window.__NEON_TEST__.snapshot());
    assert.equal(snapshot.bosses,1,'ハロウィンイベントのパンプキンキングが出現しません');
    await page.evaluate(()=>window.__NEON_TEST__.defeatEnemyAt(0));
    snapshot=await page.evaluate(()=>window.__NEON_TEST__.snapshot());
    assert.equal(snapshot.halloweenReward,1,'イベント報酬が付与されません');
    assert.equal(snapshot.state,'over','ボス撃破後にイベントクリアになりません');
    assert.match(await page.locator('#overTitle').textContent(),/HALLOWEEN CLEAR/);

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
    await host.locator('#online').click();
    await host.locator('#showJoinBtn').click();
    await host.locator('#hostBtn').click();
    await host.waitForFunction(() => document.querySelector('#netStatus').textContent.includes('招待コード：'));
    const inviteText = await host.locator('#netStatus').textContent();
    const invite = inviteText.split('招待コード：')[1]?.trim().split(/\s/)[0];
    assert.ok(invite, '招待コードを取得できません: ' + inviteText);
    await guest.goto('http://127.0.0.1:4173/?test=1', { waitUntil: 'domcontentloaded' });
    await guest.locator('#online').click();
    await guest.locator('#showJoinBtn').click();
    await guest.locator('#inviteCode').fill(invite);
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

    // Quick matchmaking must use the same WebSocket relay as invite-code rooms.
    const quickHost = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const quickGuest = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    quickHost.setDefaultTimeout(30000);
    quickGuest.setDefaultTimeout(30000);
    quickHost.on('pageerror', error => errors.push('quick-host: ' + error.message));
    quickGuest.on('pageerror', error => errors.push('quick-guest: ' + error.message));
    await quickHost.goto('http://127.0.0.1:4173/?test=1', { waitUntil: 'domcontentloaded' });
    await quickGuest.goto('http://127.0.0.1:4173/?test=1', { waitUntil: 'domcontentloaded' });
    await quickHost.locator('#online').click();
    await quickHost.locator('#showJoinBtn').click();
    await quickHost.locator('#autoMatchBtn').click();
    await quickHost.waitForFunction(() => document.querySelector('#netStatus').textContent.includes('対戦相手を検索中'));
    await quickGuest.locator('#online').click();
    await quickGuest.locator('#showJoinBtn').click();
    await quickGuest.locator('#autoMatchBtn').click();
    await quickHost.waitForFunction(() => document.querySelector('#netStatus').textContent.includes('接続成功'), null, { timeout: 15000 });
    await quickGuest.waitForFunction(() => document.querySelector('#netStatus').textContent.includes('接続成功'), null, { timeout: 15000 });
    assert.equal(await quickHost.evaluate(() => window.__NEON_TEST__.snapshot().netRole), 'host');
    assert.equal(await quickGuest.evaluate(() => window.__NEON_TEST__.snapshot().netRole), 'guest');
    const quickBefore = await quickHost.evaluate(() => window.__NEON_TEST__.snapshot().remote.x);
    await quickGuest.keyboard.down('ArrowLeft');
    await quickGuest.waitForTimeout(700);
    await quickGuest.keyboard.up('ArrowLeft');
    await quickHost.waitForFunction(v => window.__NEON_TEST__.snapshot().remote.x < v - 10, quickBefore, { timeout: 5000 });
    await quickGuest.mouse.move(640, 400);
    await quickGuest.keyboard.down('Space');
    await quickGuest.waitForTimeout(1200);
    await quickGuest.keyboard.up('Space');
    await quickHost.waitForFunction(() => window.__NEON_TEST__.snapshot().hp < 100, null, { timeout: 5000 });
    // A rematch must reuse the already-open relay without reconnecting.
    await quickGuest.evaluate(() => window.__NEON_TEST__.forceGameOver());
    await quickGuest.locator('#retry').click();
    await quickGuest.waitForFunction(() => window.__NEON_TEST__.snapshot().state === 'play');
    await quickHost.waitForFunction(() => window.__NEON_TEST__.snapshot().state === 'play');
    assert.equal(await quickGuest.evaluate(() => window.__NEON_TEST__.snapshot().netRole), 'guest');
    assert.equal(await quickHost.evaluate(() => window.__NEON_TEST__.snapshot().netRole), 'host');
    await quickHost.close();
    await quickGuest.close();

    // Co-op rooms share a host-authoritative enemy field and accept teammate shots.
    const coopHost = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const coopGuest = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    coopHost.setDefaultTimeout(30000); coopGuest.setDefaultTimeout(30000);
    coopHost.on('pageerror', error => errors.push('coop-host: ' + error.message));
    coopGuest.on('pageerror', error => errors.push('coop-guest: ' + error.message));
    await coopHost.goto('http://127.0.0.1:4173/?test=1', { waitUntil: 'domcontentloaded' });
    await coopGuest.goto('http://127.0.0.1:4173/?test=1', { waitUntil: 'domcontentloaded' });
    await coopHost.locator('#online').click();
    await coopHost.locator('#onlineModeSelect').selectOption('coop');
    await coopHost.locator('#showJoinBtn').click();
    await coopHost.locator('#hostBtn').click();
    await coopHost.waitForFunction(() => document.querySelector('#netStatus').textContent.includes('招待コード：'));
    const coopInvite = (await coopHost.locator('#netStatus').textContent()).split('招待コード：')[1]?.trim().split(' ')[0];
    assert.ok(coopInvite, '協力ルームの招待コードがありません');
    await coopGuest.locator('#online').click();
    await coopGuest.locator('#onlineModeSelect').selectOption('duel'); // Room host setting is authoritative.
    await coopGuest.locator('#showJoinBtn').click();
    await coopGuest.locator('#inviteCode').fill(coopInvite);
    await coopGuest.locator('#joinBtn').click();
    await coopHost.waitForFunction(() => document.querySelector('#netStatus').textContent.includes('接続成功'), null, { timeout: 45000 });
    await coopGuest.waitForFunction(() => document.querySelector('#netStatus').textContent.includes('接続成功'), null, { timeout: 45000 });
    assert.equal(await coopHost.evaluate(() => window.__NEON_TEST__.snapshot().onlineMode), 'coop');
    assert.equal(await coopGuest.evaluate(() => window.__NEON_TEST__.snapshot().onlineMode), 'coop');
    await coopHost.waitForFunction(() => window.__NEON_TEST__.snapshot().enemies > 0, null, { timeout: 10000 });
    await coopGuest.waitForFunction(() => window.__NEON_TEST__.snapshot().enemies > 0, null, { timeout: 10000 });
    await coopHost.evaluate(() => { const t=window.__NEON_TEST__,p=t.snapshot();t.clearEnemies();t.addEnemy(p.remote.x+250,p.remote.y); });
    await coopGuest.evaluate(() => { window.__NEON_TEST__.setFacing(1,0);window.__NEON_TEST__.setFire(true); });
    await coopHost.waitForFunction(() => window.__NEON_TEST__.snapshot().score > 0, null, { timeout: 10000 });
    await coopGuest.evaluate(() => window.__NEON_TEST__.setFire(false));
    await coopGuest.locator('#quitGame').click();
    await coopGuest.locator('#menu').waitFor({ state: 'visible' });
    await coopHost.waitForFunction(() => document.querySelector('#netStatus').textContent.includes('切断'), null, { timeout: 10000 });
    await coopHost.close(); await coopGuest.close();

    assert.deepEqual(errors, [], 'ブラウザ実行時エラーが発生しました');
    process.stdout.write('PASS: desktop survival/story/AI, mobile touch controls, invite rooms, and quick-match online relay\n');
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
