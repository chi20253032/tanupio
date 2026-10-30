const http = require('node:http');
const crypto = require('node:crypto');
const { WebSocketServer, WebSocket } = require('ws');

const PORT = Number(process.env.PORT || 10000);
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*';
const MAX_ROOM_PLAYERS = 10;
const MAX_MESSAGE_BYTES = 64 * 1024;
const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    res.end(JSON.stringify({ ok: true, service: 'tanupio-matchmaking', waiting: waiting.length, rooms: rooms.size, players: [...rooms.values()].reduce((n, r) => n + r.players.length, 0), maxRoomPlayers: MAX_ROOM_PLAYERS }));
    return;
  }
  res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
  res.end('TANUPIO matchmaking service');
});
const wss = new WebSocketServer({ server, maxPayload: MAX_MESSAGE_BYTES, perMessageDeflate: { threshold: 1024, serverNoContextTakeover: true, clientNoContextTakeover: true } });
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
function send(socket, value) {
  if (socket?.readyState !== WebSocket.OPEN) return;
  const payload = JSON.stringify(value);
  if (socket.bufferedAmount > 512 * 1024) { socket.close(1013, 'Slow consumer'); return; }
  socket.send(payload, { compress: payload.length > 1024 });
}
function broadcast(room, value, except = null) {
  for (const member of room.players) if (member !== except) send(member, value);
}
function roster(room) {
  return room.players.map((member, index) => ({ id: member.playerId, name: member.playerName || 'PLAYER ' + (index + 1), role: member === room.host ? 'host' : 'guest' }));
}
function publishRoster(room) {
  broadcast(room, { type: 'room-roster', players: roster(room), maxPlayers: MAX_ROOM_PLAYERS });
}
function removeFromQueue(socket) {
  const i = waiting.indexOf(socket);
  if (i >= 0) waiting.splice(i, 1);
  queued.delete(socket);
}
function removeRoom(socket) {
  if (!socket.roomCode) return;
  const code = socket.roomCode;
  const room = rooms.get(code);
  if (room) {
    if (room.host === socket) {
      rooms.delete(code);
      for (const member of room.players) {
        if (member !== socket) {
          member.roomCode = null;
          send(member, { type: 'room-closed', reason: 'host-left' });
        }
      }
    } else {
      room.players = room.players.filter(member => member !== socket);
      for (const member of room.players) send(member, { type: 'room-player-left', playerId: socket.playerId });
      if (!room.players.length) rooms.delete(code);
      else publishRoster(room);
    }
  }
  socket.roomCode = null;
  socket.opponent = null;
}
function pairPlayers() {
  while (waiting.length >= 2) {
    let first = -1, second = -1;
    for (let i = 0; i < waiting.length && first < 0; i++) {
      for (let j = i + 1; j < waiting.length; j++) {
        if ((waiting[i].gameMode || 'duel') === (waiting[j].gameMode || 'duel')) { first = i; second = j; break; }
      }
    }
    if (first < 0) return;
    const a = waiting.splice(first, 1)[0];
    const b = waiting.splice(second - 1, 1)[0];
    queued.delete(a); queued.delete(b);
    if (a.readyState !== WebSocket.OPEN || b.readyState !== WebSocket.OPEN) continue;
    const room = crypto.randomUUID();
    a.quickMatch = room; b.quickMatch = room;
    a.opponent = b; b.opponent = a;
    send(a, { type: 'matched', role: 'host', room, gameMode: a.gameMode || 'duel', playerId: a.playerId, maxPlayers: 2 });
    send(b, { type: 'matched', role: 'guest', room, gameMode: b.gameMode || 'duel', playerId: b.playerId, maxPlayers: 2 });
  }
}
wss.on('connection', (socket, req) => {
  const origin = req.headers.origin || '';
  if (ALLOWED_ORIGIN !== '*' && origin !== ALLOWED_ORIGIN) { socket.close(1008, 'Origin not allowed'); return; }
  socket.playerId = crypto.randomUUID();
  socket.playerName = 'PLAYER';
  socket.isAlive = true;
  socket.messageWindowStart = Date.now();
  socket.messageCount = 0;
  socket.on('pong', () => { socket.isAlive = true; });
  socket.on('message', raw => {
    const now = Date.now();
    if (now - socket.messageWindowStart >= 1000) { socket.messageWindowStart = now; socket.messageCount = 0; }
    if (++socket.messageCount > 80) { socket.close(1008, 'Rate limit'); return; }
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { socket.close(1003, 'Invalid JSON'); return; }
    if (!msg || typeof msg !== 'object' || typeof msg.type !== 'string') return;
    if (msg.type === 'list-rooms') {
      send(socket, { type: 'room-list', rooms: [...rooms.entries()].filter(([, room]) => room.players.length < MAX_ROOM_PLAYERS && room.host.readyState === WebSocket.OPEN).map(([code, room]) => ({ code, name: room.name, gameMode: room.gameMode || 'duel', players: room.players.length, maxPlayers: MAX_ROOM_PLAYERS })) });
    } else if (msg.type === 'create-room') {
      if (socket.roomCode || socket.quickMatch || socket.opponent) { send(socket, { type: 'room-error', message: 'ルームを作成できません' }); return; }
      const code = makeRoomCode();
      socket.roomCode = code;
      socket.playerName = typeof msg.playerName === 'string' ? msg.playerName.slice(0, 24) : 'HOST';
      const gameMode = msg.gameMode === 'coop' ? 'coop' : 'duel';
      const room = { host: socket, players: [socket], gameMode, name: typeof msg.name === 'string' ? msg.name.slice(0, 40) : 'NEON ARENA ROOM' };
      rooms.set(code, room);
      send(socket, { type: 'room-created', code, gameMode, playerId: socket.playerId, players: roster(room), maxPlayers: MAX_ROOM_PLAYERS });
    } else if (msg.type === 'join-room') {
      const code = typeof msg.code === 'string' ? msg.code.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6) : '';
      const room = rooms.get(code);
      if (!room || room.players.length >= MAX_ROOM_PLAYERS || room.host.readyState !== WebSocket.OPEN || socket.roomCode || socket.quickMatch || socket.opponent) { send(socket, { type: 'room-error', message: 'ルームが見つからないか、満員です（最大10人）' }); return; }
      if (room.players.includes(socket)) { send(socket, { type: 'room-error', message: 'すでに参加しています' }); return; }
      socket.roomCode = code;
      socket.gameMode = room.gameMode || 'duel';
      socket.playerName = typeof msg.playerName === 'string' ? msg.playerName.slice(0, 24) : 'PLAYER';
      room.players.push(socket);
      const info = { type: 'room-joined', code, gameMode: room.gameMode || 'duel', playerId: socket.playerId, players: roster(room), maxPlayers: MAX_ROOM_PLAYERS };
      send(socket, info);
      broadcast(room, { type: 'room-player-joined', player: roster(room).find(p => p.id === socket.playerId), players: roster(room), maxPlayers: MAX_ROOM_PLAYERS }, socket);
    } else if (msg.type === 'game-data') {
      const room = socket.roomCode ? rooms.get(socket.roomCode) : null;
      if (room && room.players.includes(socket)) broadcast(room, { type: 'game-data', from: socket.playerId, data: msg.data }, socket);
      else if (socket.opponent?.readyState === WebSocket.OPEN && socket.quickMatch) send(socket.opponent, { type: 'game-data', data: msg.data });
    } else if (msg.type === 'join') {
      if (socket.roomCode || socket.quickMatch || socket.opponent) { send(socket, { type: 'error', message: 'Already queued or in a match' }); return; }
      socket.gameMode = msg.gameMode === 'coop' ? 'coop' : 'duel';
      socket.playerName = typeof msg.playerName === 'string' ? msg.playerName.slice(0, 24) : 'PLAYER';
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
        const opponent = socket.opponent;
        send(opponent, { type: 'opponent-left' });
        opponent.opponent = null;
        opponent.quickMatch = null;
      }
      socket.opponent = null; socket.quickMatch = null;
    } else if (msg.type === 'ping') {
      send(socket, { type: 'pong', at: Number(msg.at) || now });
    }
  });
  socket.on('close', () => {
    removeFromQueue(socket);
    removeRoom(socket);
    if (socket.opponent) {
      const opponent = socket.opponent;
      send(opponent, { type: 'opponent-left' });
      opponent.opponent = null;
      opponent.quickMatch = null;
    }
  });
  socket.on('error', () => {});
});
const heartbeat = setInterval(() => {
  for (const socket of wss.clients) {
    if (socket.isAlive === false) { socket.terminate(); continue; }
    socket.isAlive = false;
    socket.ping();
  }
}, 25000);
wss.on('close', () => clearInterval(heartbeat));
server.listen(PORT, '0.0.0.0', () => process.stdout.write('Matchmaking listening on ' + PORT + '\n'));
