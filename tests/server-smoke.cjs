const assert = require('node:assert/strict');
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
    a.send(JSON.stringify({ type: 'join', peerId: 'peer-a' }));
    assert.equal((await next(a)).type, 'queued');
    b.send(JSON.stringify({ type: 'join', peerId: 'peer-b' }));
    const [ma, mb] = await Promise.all([next(a), next(b)]);
    assert.equal(ma.type, 'matched');
    assert.equal(mb.type, 'matched');
    assert.equal(ma.role, 'host');
    assert.equal(mb.role, 'guest');
    assert.equal(ma.peerId, 'peer-b');
    assert.equal(mb.peerId, 'peer-a');
    a.close(); b.close();
    process.stdout.write('PASS: matchmaking health, queue and two-player pairing\n');
  } finally {
    child.kill('SIGTERM');
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
