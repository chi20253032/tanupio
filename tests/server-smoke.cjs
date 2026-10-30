const assert = require('node:assert/strict');
function queuedSafeMode(a, b) { return a.gameMode === 'coop' && b.gameMode === 'coop'; }
const { spawn } = require('node:child_process');
const { setTimeout: delay } = require('node:timers/promises');
const WebSocket = require('ws');

(async () => {
  const port = 18765;
  const child = spawn(process.execPath, ['server/matchmaking.cjs'], {
    env: { ...process.env, PORT: String(port), ALLOWED_ORIGIN: '*' },
    stdio: 'ignore'
  });
  const open = url => new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.once('open', () => resolve(ws));
    ws.once('error', reject);
  });
  const next = ws => new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timed out waiting for matchmaking message')), 5000);
    ws.once('message', data => { clearTimeout(timer); resolve(JSON.parse(data.toString())); });
  });
  try {
    let health;
    for (let i = 0; i < 40; i++) {
      try { health = await fetch('http://127.0.0.1:' + port + '/health').then(r => r.json()); break; }
      catch { await delay(100); }
    }
    assert.equal(health?.ok, true);
    const a = await open('ws://127.0.0.1:' + port);
    const b = await open('ws://127.0.0.1:' + port);
    a.send(JSON.stringify({ type: 'join' }));
    assert.equal((await next(a)).type, 'queued');
    b.send(JSON.stringify({ type: 'join' }));
    assert.equal((await next(b)).type, 'queued');
    const [ma, mb] = await Promise.all([next(a), next(b)]);
    assert.equal(ma.type, 'matched');
    assert.equal(mb.type, 'matched');
    assert.equal(ma.role, 'host');
    assert.equal(mb.role, 'guest');
    assert.ok(ma.room && ma.room === mb.room, 'quick-match pair does not share a relay room');
    const quickToGuest = next(b);
    a.send(JSON.stringify({ type: 'game-data', data: { type: 'state', hp: 91, player: 'host' } }));
    assert.deepEqual(await quickToGuest, { type: 'game-data', data: { type: 'state', hp: 91, player: 'host' } });
    const quickToHost = next(a);
    b.send(JSON.stringify({ type: 'game-data', data: { type: 'input', x: 1, fire: true } }));
    assert.deepEqual(await quickToHost, { type: 'game-data', data: { type: 'input', x: 1, fire: true } });
    const coopA = await open('ws://127.0.0.1:' + port);
    const coopB = await open('ws://127.0.0.1:' + port);
    coopA.send(JSON.stringify({ type: 'join', gameMode: 'coop' }));
    assert.equal((await next(coopA)).type, 'queued');
    const duelWait = await open('ws://127.0.0.1:' + port);
    duelWait.send(JSON.stringify({ type: 'join', gameMode: 'duel' }));
    assert.equal((await next(duelWait)).type, 'queued');
    coopB.send(JSON.stringify({ type: 'join', gameMode: 'coop' }));
    assert.equal((await next(coopB)).type, 'queued');
    const [ca, cb] = await Promise.all([next(coopA), next(coopB)]);
    assert.equal(ca.type, 'matched');
    assert.equal(cb.type, 'matched');
    assert.equal(ca.gameMode, 'coop');
    assert.equal(cb.gameMode, 'coop');
    assert.equal(ca.room, cb.room);
    assert.equal(queuedSafeMode(ca, cb), true);
    coopA.close(); coopB.close(); duelWait.close();
    const host = await open('ws://127.0.0.1:' + port);
    const guest = await open('ws://127.0.0.1:' + port);
    host.send(JSON.stringify({ type: 'create-room', name: 'Test Room', gameMode: 'coop' }));
    const created = await next(host);
    assert.equal(created.type, 'room-created');
    assert.equal(created.code.length, 6);
    assert.equal(created.gameMode, 'coop');
    host.send(JSON.stringify({ type: 'list-rooms' }));
    const roomList = await next(host);
    assert.equal(roomList.type, 'room-list');
    assert.equal(roomList.rooms.length, 1);
    const hostNotice = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Timed out waiting for host room notification')), 5000);
      host.once('message', data => { clearTimeout(timer); resolve(JSON.parse(data.toString())); });
    });
    guest.send(JSON.stringify({ type: 'join-room', code: created.code.toLowerCase() }));
    const joined = await next(guest);
    assert.equal(joined.type, 'room-joined');
    assert.equal(joined.gameMode, 'coop');
    const hostJoined = await hostNotice;
    assert.equal(hostJoined.type, 'room-player-joined');
    const relayToHost = next(host);
    guest.send(JSON.stringify({ type: 'game-data', data: { type: 'input', x: -1, fire: true } }));
    const relayedInput = await relayToHost; assert.equal(relayedInput.type, 'game-data'); assert.equal(relayedInput.data.type, 'input'); assert.equal(relayedInput.data.x, -1); assert.ok(relayedInput.from, 'relay sender ID is missing');
    const relayToGuest = next(guest);
    host.send(JSON.stringify({ type: 'game-data', data: { type: 'state', hp: 87, enemies: [{ x: 0.5, y: 0.5 }] } }));
    const relayedState = await relayToGuest; assert.equal(relayedState.type, 'game-data'); assert.equal(relayedState.data.hp, 87); assert.ok(relayedState.from, 'state sender ID is missing');
    guest.send(JSON.stringify({ type: 'join-room', code: created.code }));
    assert.equal((await next(guest)).type, 'room-error');
    // Fill the invite room to its advertised ten-player limit.
    const extraPlayers = [];
    for (let i = 0; i < 8; i++) {
      const member = await open('ws://127.0.0.1:' + port);
      extraPlayers.push(member);
      member.send(JSON.stringify({ type: 'join-room', code: created.code, playerName: 'PLAYER ' + (i + 3) }));
      const result = await next(member);
      assert.equal(result.type, 'room-joined');
      assert.equal(result.maxPlayers, 10);
      assert.equal(result.players.length, i + 3);
    }
    for (let i = 0; i < 8; i++) assert.equal((await next(host)).type, 'room-player-joined');
    const fullRoom = await open('ws://127.0.0.1:' + port);
    fullRoom.send(JSON.stringify({ type: 'join-room', code: created.code }));
    assert.equal((await next(fullRoom)).type, 'room-error', '11th player was allowed into a full room');
    host.send(JSON.stringify({ type: 'list-rooms' }));
    const roomListAfterFull = await next(host);
    assert.equal(roomListAfterFull.rooms.length, 0, 'full room is still listed as joinable');
    fullRoom.close();
    for (const member of extraPlayers) member.close();
    guest.close(); host.close();
    a.close(); b.close();
    process.stdout.write('PASS: duel/coop queue separation, room mode metadata, and bidirectional game relay\n');
  } finally {
    child.kill('SIGTERM');
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
