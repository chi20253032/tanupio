const http = require('node:http');
const { WebSocketServer, WebSocket } = require('ws');

const PORT = Number(process.env.PORT || 10000);
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*';
const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    res.end(JSON.stringify({ ok: true, service: 'tanupio-matchmaking', waiting: waiting.length }));
    return;
  }
  res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
  res.end('TANUPIO matchmaking service');
});
const wss = new WebSocketServer({ server, maxPayload: 1024 });
const waiting = [];
const queued = new Set();
const rooms = new Map();
const roomChars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function makeRoomCode() {
  let code;
  do { code = Array.from({ length: 6 }, () => roomChars[Math.floor(Math.random() * roomChars.length)]).join(''); }
  while (rooms.has(code));
  return code;
}
function removeRoom(socket) {
  if (!socket.roomCode) return;
  const room = rooms.get(socket.roomCode);
  if (room && room.host === socket) {
    rooms.delete(socket.roomCode);
    if (room.guest) send(room.guest, { type: 'room-error', message: 'ホストがルームを退出しました' });
  } else if (room && room.guest === socket) {
    room.guest = null;
    send(room.host, { type: 'room-player-left' });
  }
  socket.roomCode = null;
}

function send(socket, value) {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(value));
}
function removeFromQueue(socket) {
  const i = waiting.indexOf(socket);
  if (i >= 0) waiting.splice(i, 1);
  queued.delete(socket);
}
function pairPlayers() {
  while (waiting.length >= 2) {
    const a = waiting.shift();
    const b = waiting.shift();
    queued.delete(a); queued.delete(b);
    if (a.readyState !== WebSocket.OPEN || b.readyState !== WebSocket.OPEN) continue;
    const room = crypto.randomUUID();
    a.room = room; b.room = room;
    a.opponent = b; b.opponent = a;
    send(a, { type: 'matched', role: 'host', peerId: b.peerId, room });
    send(b, { type: 'matched', role: 'guest', peerId: a.peerId, room });
  }
}
wss.on('connection', (socket, req) => {
  const origin = req.headers.origin || '';
  if (ALLOWED_ORIGIN !== '*' && origin !== ALLOWED_ORIGIN) { socket.close(1008, 'Origin not allowed'); return; }
  socket.on('message', raw => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { socket.close(1003, 'Invalid JSON'); return; }
    if (!msg || typeof msg !== 'object') return;
    if (msg.type === 'list-rooms') {
      send(socket, { type: 'room-list', rooms: [...rooms.entries()].filter(([, room]) => room.host.readyState === WebSocket.OPEN && !room.guest).map(([code, room]) => ({ code, name: room.name })) });
    } else if (msg.type === 'create-room') {
      const peerId = typeof msg.peerId === 'string' ? msg.peerId.slice(0, 128) : '';
      if (!peerId || socket.roomCode || socket.peerId) { send(socket, { type: 'room-error', message: 'ルームを作成できません' }); return; }
      const code = makeRoomCode();
      socket.peerId = peerId; socket.roomCode = code;
      rooms.set(code, { host: socket, guest: null, peerId, name: typeof msg.name === 'string' ? msg.name.slice(0, 40) : 'NEON ARENA ROOM' });
      send(socket, { type: 'room-created', code });
    } else if (msg.type === 'join-room') {
      const code = typeof msg.code === 'string' ? msg.code.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6) : '';
      const peerId = typeof msg.peerId === 'string' ? msg.peerId.slice(0, 128) : '';
      const room = rooms.get(code);
      if (!peerId || !room || room.guest || room.host.readyState !== WebSocket.OPEN) { send(socket, { type: 'room-error', message: 'ルームが見つからないか、満員です' }); return; }
      if (room.host === socket) { send(socket, { type: 'room-error', message: '自分のルームには参加できません' }); return; }
      room.guest = socket; socket.peerId = peerId; socket.roomCode = code;
      send(room.host, { type: 'room-player-joined', guestPeerId: peerId });
      send(socket, { type: 'room-joined', hostPeerId: room.peerId, code });
    } else if (msg.type === 'join') {
      const peerId = typeof msg.peerId === 'string' ? msg.peerId.slice(0, 128) : '';
      if (!peerId || socket.peerId || socket.room || socket.roomCode) { send(socket, { type: 'error', message: 'Invalid matchmaking request' }); return; }
      socket.peerId = peerId;
      if (!queued.has(socket)) { waiting.push(socket); queued.add(socket); }
      send(socket, { type: 'queued', position: waiting.length });
      pairPlayers();
    } else if (msg.type === 'cancel') {
      removeFromQueue(socket);
      send(socket, { type: 'cancelled' });
    } else if (msg.type === 'leave') {
      removeFromQueue(socket);
      removeRoom(socket);
      if (socket.opponent) {
        send(socket.opponent, { type: 'opponent-left' });
        socket.opponent.opponent = null;
      }
      socket.opponent = null; socket.room = null;
    }
  });
  socket.on('close', () => {
    removeFromQueue(socket);
    removeRoom(socket);
    if (socket.opponent) {
      send(socket.opponent, { type: 'opponent-left' });
      socket.opponent.opponent = null;
    }
  });
  socket.on('error', () => {});
});
const crypto = require('node:crypto');
server.listen(PORT, '0.0.0.0', () => process.stdout.write('Matchmaking listening on ' + PORT + '\n'));
