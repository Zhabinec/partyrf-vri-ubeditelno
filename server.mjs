import { createServer } from 'node:http';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { act, limits, newGame, tick, view } from './src/game.mjs';

const rooms = new Map();
const roomLifetime = 6 * 60 * 60 * 1000;
const assets = new Map([
  ['/', ['index.html', 'text/html']],
  ['/styles.css', ['styles.css', 'text/css']],
  ['/src/main.js', ['src/main.js', 'text/javascript']],
  ['/src/ui.js', ['src/ui.js', 'text/javascript']],
]);

function send(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
}

function fail(status, message) {
  throw Object.assign(new Error(message), { status });
}

async function readBody(req) {
  if (!req.headers['content-type']?.startsWith('application/json')) fail(415, 'Ожидается JSON.');
  const chunks = [];
  let length = 0;
  for await (const chunk of req) {
    length += chunk.length;
    if (length > 4096) fail(413, 'Слишком длинный запрос.');
    chunks.push(chunk);
  }
  try {
    const data = JSON.parse(Buffer.concat(chunks).toString());
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error();
    return data;
  } catch {
    fail(400, 'Не удалось прочитать запрос.');
  }
}

function snapshot(room, player) {
  const now = Date.now();
  room.touched = now;
  tick(room.game, now);
  return {
    ...view(room.game, player.id),
    now, code: room.code, me: player.id, host: room.host,
    players: [...room.members.values()].map(({ id, name }) => ({ id, name })),
  };
}

function register(path, body) {
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name || name.length > limits.name) fail(400, 'Введи имя до 24 символов.');
  let room;
  if (path === '/api/create') {
    if (rooms.size >= 500) fail(503, 'Все комнаты заняты. Попробуй позже.');
    let code;
    do { code = randomBytes(3).toString('hex').toUpperCase(); } while (rooms.has(code));
    room = { code, members: new Map(), game: newGame() };
    rooms.set(code, room);
  } else {
    room = rooms.get(String(body.code).trim().toUpperCase());
    if (!room) fail(404, 'Комната не найдена. Проверь код.');
    tick(room.game, Date.now());
    if (!['lobby', 'finished'].includes(room.game.phase)) fail(409, 'Партия уже идёт. Зайди после финала.');
    if (room.members.size >= limits.maxPlayers) fail(409, 'Комната заполнена.');
    if ([...room.members.values()].some(player => player.name.toLowerCase() === name.toLowerCase())) {
      fail(409, 'Это имя уже занято.');
    }
  }
  const token = randomUUID();
  const player = { id: randomUUID(), name };
  room.members.set(token, player);
  room.host ??= player.id;
  return { token, state: snapshot(room, player) };
}

async function api(req, res, path) {
  if (req.method === 'POST' && ['/api/create', '/api/join'].includes(path)) {
    send(res, 201, register(path, await readBody(req)));
    return;
  }
  const match = /^\/api\/rooms\/([0-9A-F]{6})$/.exec(path);
  if (!match) fail(404, 'Страница не найдена.');
  if (!['GET', 'POST'].includes(req.method)) fail(405, 'Метод не поддерживается.');
  const body = req.method === 'POST' ? await readBody(req) : null;
  const room = rooms.get(match[1]);
  const player = room?.members.get(req.headers.authorization?.replace(/^Bearer /, ''));
  if (!player) fail(401, 'Сессия комнаты закончилась. Подключись снова.');
  if (body) {
    const error = act(room.game, {
      id: player.id, isHost: player.id === room.host,
      players: [...room.members.values()].map(member => member.id),
    }, body, Date.now());
    send(res, error ? 409 : 200, { error, state: snapshot(room, player) });
    return;
  }
  send(res, 200, { state: snapshot(room, player) });
}

const server = createServer(async (req, res) => {
  try {
    const path = new URL(req.url, 'http://localhost').pathname;
    if (path.startsWith('/api/')) {
      await api(req, res, path);
      return;
    }
    const asset = assets.get(path);
    if (req.method !== 'GET' || !asset) fail(404, 'Страница не найдена.');
    const [file, type] = asset;
    const contents = await readFile(new URL(file, import.meta.url));
    res.writeHead(200, {
      'Content-Type': type + '; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'self'",
    });
    res.end(contents);
  } catch (error) {
    if (!error.status) console.error(error);
    if (!res.destroyed) send(res, error.status ?? 500, { error: error.status ? error.message : 'Ошибка сервера.' });
  }
});

setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    if (now - room.touched > roomLifetime) rooms.delete(code);
    else tick(room.game, now);
  }
}, 1000).unref();

const port = Number(process.env.PORT ?? 4176);
server.listen(port, process.env.BIND_ADDRESS ?? '0.0.0.0', () => {
  console.log('Ври убедительно — http://localhost:' + server.address().port);
});


