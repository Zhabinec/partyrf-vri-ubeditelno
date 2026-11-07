import { createServer } from 'node:http';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { act, limits, newGame, tick, view, publicView, depart } from './src/game.mjs';
import { addTestBots, runTestBots, testBotsEnabled } from './src/test-bots.mjs';

const rooms = new Map();
const roomLifetime = 6 * 60 * 60 * 1000;
const assets = new Map([
  ['/', ['index.html', 'text/html']],
  ['/styles.css', ['styles.css', 'text/css']],
  ['/src/main.js', ['src/main.js', 'text/javascript']],
  ['/src/ui.js', ['src/ui.js', 'text/javascript']],
  ['/src/audio.js', ['src/audio.js', 'text/javascript']],
  ...['local-forecast', 'typewriter', 'drum-roll', 'clock-tick'].map(name => [
    '/assets/' + name + '.mp3', ['assets/' + name + '.mp3', 'audio/mpeg'],
  ]),
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
    ...(room.host === player.id ? { displayToken: room.displayToken } : {}),
    players: [...room.members.values()]
      .filter(member => room.game.phase !== 'lobby' || !member.left)
      .map(({ id, name, isBot, left }) => ({ id, name, isBot, left })),
  };
}

function register(path, body) {
  const testRoom = path === '/api/create-test';
  if (testRoom && !testBotsEnabled) fail(404, 'Тестовый режим выключен.');
  const enteredName = typeof body.name === 'string' ? body.name.trim() : '';
  const name = enteredName || (testRoom ? 'Тестер' : '');
  if (!name || name.length > limits.name) fail(400, 'Введи имя до 24 символов.');
  let room;
  if (path === '/api/create' || testRoom) {
    if (rooms.size >= 500) fail(503, 'Все комнаты заняты. Попробуй позже.');
    let code;
    do { code = randomBytes(3).toString('hex').toUpperCase(); } while (rooms.has(code));
    room = { code, displayToken: randomBytes(16).toString("hex"), members: new Map(), game: newGame(), testRoom };
    rooms.set(code, room);
  } else {
    room = rooms.get(String(body.code).trim().toUpperCase());
    if (!room) fail(404, 'Комната не найдена. Проверь код.');
    tick(room.game, Date.now());
    if (!['lobby', 'finished'].includes(room.game.phase)) fail(409, 'Партия уже идёт. Зайди после финала.');
    const present = [...room.members.values()].filter(player => !player.left);
    if (present.length >= limits.maxPlayers) fail(409, 'Комната заполнена.');
    if (present.some(player => player.name.toLowerCase() === name.toLowerCase())) {
      fail(409, 'Это имя уже занято.');
    }
  }
  const token = randomUUID();
  const player = { id: randomUUID(), name };
  room.members.set(token, player);
  room.host ??= player.id;
  if (testRoom) addTestBots(room);
  return { token, state: snapshot(room, player) };
}

async function api(req, res, path) {
  const screen = /^\/api\/display\/([0-9A-F]{6})\/([a-f0-9]{32})$/.exec(path);
  if (screen) {
    if (req.method !== 'GET') fail(405, 'Общий экран работает только для просмотра.');
    const room = rooms.get(screen[1]);
    if (!room || room.displayToken !== screen[2]) fail(404, 'Комната общего экрана закрыта.');
    const now = Date.now();
    tick(room.game, now);
    send(res, 200, { state: {
      ...publicView(room.game), now, code: room.code, host: room.host, me: null,
      players: [...room.members.values()]
        .filter(member => room.game.phase !== 'lobby' || !member.left)
        .map(({ id, name, left }) => ({ id, name, left })),
    } });
    return;
  }

  if (req.method === 'POST' && ['/api/create', '/api/join', '/api/create-test'].includes(path)) {
    send(res, 201, register(path, await readBody(req)));
    return;
  }
  const match = /^\/api\/rooms\/([0-9A-F]{6})$/.exec(path);
  if (!match) fail(404, 'Страница не найдена.');
  if (!['GET', 'POST'].includes(req.method)) fail(405, 'Метод не поддерживается.');
  const body = req.method === 'POST' ? await readBody(req) : null;
  const room = rooms.get(match[1]);
  const player = room?.members.get(req.headers.authorization?.replace(/^Bearer /, ''));
  if (!player || player.left) fail(401, 'Сессия комнаты закончилась. Подключись снова.');
  if (body?.type === 'leave') {
    player.left = true;
    depart(room.game, player.id, Date.now());
    const successor = [...room.members.values()].find(member => !member.left && !member.isBot);
    if (!successor) rooms.delete(room.code);
    else if (room.host === player.id) room.host = successor.id;
    if (room.game.phase === 'lobby') {
      for (const [token, member] of room.members) if (member.left) room.members.delete(token);
    }
    send(res, 200, {});
    return;
  }
  if (body) {
    const players = [...room.members.values()].filter(member => !member.left).map(member => member.id);
    const error = act(room.game, {
      id: player.id, isHost: player.id === room.host,
      players,
    }, body, Date.now());
    if (!error && body.type === 'start') {
      for (const [token, member] of room.members) if (member.left) room.members.delete(token);
    }
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
    res.end(path === '/' && testBotsEnabled
      ? contents.toString().replace('id="app"', 'id="app" data-test-bots')
      : contents);
  } catch (error) {
    if (!error.status) console.error(error);
    if (!res.destroyed) send(res, error.status ?? 500, { error: error.status ? error.message : 'Ошибка сервера.' });
  }
});

setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    if (now - room.touched > roomLifetime) rooms.delete(code);
    else {
      tick(room.game, now);
      runTestBots(room, now);
    }
  }
}, 1000).unref();

const port = Number(process.env.PORT ?? 4176);
server.listen(port, process.env.BIND_ADDRESS ?? '0.0.0.0', () => {
  console.log('Ври убедительно — http://localhost:' + server.address().port);
});

