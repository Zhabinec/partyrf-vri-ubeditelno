import { entrance, roomScreen } from './ui.js';
import { playEffect, setSoundPhase, unlockSound } from './audio.js';

const app = document.querySelector('#app');
const feedback = document.querySelector('#feedback');
const roomLabel = document.querySelector('#room-label');
const leaveRoom = document.querySelector('#leave-room');
const headerMenu = document.querySelector('#header-menu');
const menuToggle = headerMenu.querySelector('summary');
let code = new URLSearchParams(location.search).get('room')?.toUpperCase() ?? '';
const sessionKey = 'vri-ubeditelno-session';
let session;
try { session = JSON.parse(sessionStorage.getItem(sessionKey)); } catch {}
if (code && session?.code !== code) session = null;
let state;
let renderedKey;
let requestId = 0;
let lastApplied = 0;
let offset = 0;
let busy = false;
let lastTick;

function message(text = '') {
  feedback.textContent = text;
  feedback.hidden = !text;
}

function inviteUrl() {
  const url = new URL('./', location.href);
  url.searchParams.set('room', state.code);
  return url.href;
}

function updateClock() {
  const timer = document.querySelector('#timer');
  if (!timer) return;
  const remaining = Math.max(0, state.deadline - Date.now() - offset);
  const seconds = Math.ceil(remaining / 1000);
  timer.textContent = '0:' + String(seconds).padStart(2, '0');
  const bar = document.querySelector('#time-bar');
  bar.max = state.duration;
  bar.value = remaining;
  bar.classList.toggle('time-low', seconds <= 5);
  document.querySelector('#clock-warning').hidden = seconds > 5;
  const step = state.step;
  const tick = step + ':' + seconds;
  if (seconds > 0 && seconds <= 5 && tick !== lastTick) {
    lastTick = tick;
    void playEffect('clock-tick', () => lastTick === tick && state?.step === step);
  }
}

function applyState(next, id) {
  if (id < lastApplied) return;
  lastApplied = id;
  const changesScene = state?.step !== next.step;
  state = next;
  offset = next.now - Date.now();
  const key = JSON.stringify([state.step, state.done, state.phase, state.players, state.me, state.host]);
  if (key !== renderedKey) {
    const shouldFocus = renderedKey !== undefined && !document.activeElement?.matches('.invite-link');
    renderedKey = key;
    app.classList.add('in-room');
    app.innerHTML = roomScreen(state);
    if (changesScene) {
      app.firstElementChild.classList.add('page-turn');
      setSoundPhase(state.phase);
      const cue = { briefing: 'typewriter', reveal: 'typewriter', winner: 'drum-roll' }[state.phase];
      if (cue) void playEffect(cue, () => state?.step === next.step);
    }
    roomLabel.textContent = 'КОМНАТА ' + state.code;
    leaveRoom.hidden = false;
    const invite = document.querySelector('#invite-link');
    if (invite) invite.value = inviteUrl();
    if (shouldFocus) {
      const heading = app.querySelector('h1');
      heading.tabIndex = -1;
      heading.focus({ preventScroll: true });
    }
  }
  document.querySelector('#progress').textContent = state.progress
    ? 'ГОТОВЫ ' + state.progress.join(' / ') : '';
  updateClock();
}

async function request(path, body, token) {
  const response = await fetch('./api/' + path, {
    method: body ? 'POST' : 'GET',
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(6000),
  });
  const data = await response.json();
  if (!response.ok && !data.state) throw Object.assign(new Error(data.error), { status: response.status });
  return data;
}

async function sync() {
  if (!session) return;
  const id = ++requestId;
  try {
    const data = await request('rooms/' + session.code, null, session.token);
    if (id < lastApplied) return;
    applyState(data.state, id);
    if (feedback.dataset.connection) {
      delete feedback.dataset.connection;
      message();
    }
  } catch (error) {
    if (id < lastApplied) return;
    if (error.status === 401) {
      session = null;
      state = null;
      renderedKey = undefined;
      sessionStorage.removeItem(sessionKey);
      showEntrance();
      message(error.message);
      return;
    }
    feedback.dataset.connection = 'true';
    message('Связь пропала. Пробуем подключиться…');
  }
}

function showEntrance() {
  setSoundPhase(null);
  headerMenu.open = false;
  roomLabel.textContent = 'ИГРА ДЛЯ КОМПАНИИ';
  leaveRoom.hidden = true;
  app.classList.remove('in-room');
  app.innerHTML = entrance(code, app.hasAttribute('data-test-bots'));
}

document.addEventListener('click', event => {
  if (headerMenu.open && !headerMenu.contains(event.target)) headerMenu.open = false;
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && headerMenu.open) {
    headerMenu.open = false;
    menuToggle.focus();
  }
});

leaveRoom.addEventListener('click', () => {
  if (!session) return;
  const previous = session;
  lastApplied = ++requestId;
  session = null;
  state = null;
  renderedKey = undefined;
  lastTick = undefined;
  code = '';
  sessionStorage.removeItem(sessionKey);
  history.replaceState(null, '', new URL('./', location.href));
  delete feedback.dataset.connection;
  message();
  showEntrance();
  app.querySelector('#name')?.focus();
  void request('rooms/' + previous.code, { type: 'leave' }, previous.token).catch(() => {});
});

async function action(type, value) {
  const id = ++requestId;
  const data = await request('rooms/' + session.code, { type, value, step: state.step }, session.token);
  if (id < lastApplied) return;
  applyState(data.state, id);
  if (!data.error && ['bluff', 'vote'].includes(type) && state.phase === type) {
    const step = state.step;
    void playEffect('typewriter', () => state?.step === step);
  }
  message(data.error);
}

async function interact(callback, control) {
  if (busy) return;
  busy = true;
  control.disabled = true;
  delete feedback.dataset.connection;
  message();
  try { await callback(); }
  catch (error) {
    if (!session) setSoundPhase(null);
    message(error.status ? error.message : 'Не удалось связаться с комнатой. Попробуй ещё раз.');
  }
  finally {
    control.disabled = false;
    busy = false;
  }
}

app.addEventListener('submit', event => {
  event.preventDefault();
  const form = event.target;
  const control = event.submitter ?? form.querySelector('button');
  const fields = new FormData(form);
  const type = form.dataset.form;
  void interact(async () => {
    unlockSound(type === 'entry');
    if (type === 'entry') {
      const data = await request(control.value || 'join', { name: fields.get('name'), code: fields.get('code') });
      session = { code: data.state.code, token: data.token };
      sessionStorage.setItem(sessionKey, JSON.stringify(session));
      applyState(data.state, ++requestId);
      return;
    }
    const value = fields.get('value');
    await action(type, value);
  }, control);
});

app.addEventListener('click', event => {
  unlockSound();
  const control = event.target.closest('[data-action]');
  if (!control) return;
  void interact(async () => {
    if (control.dataset.action === 'copy') {
      try {
        await navigator.clipboard.writeText(inviteUrl());
        message('Ссылка скопирована.');
      } catch {
        const input = document.querySelector('#invite-link');
        input.focus();
        input.select();
        message('Скопируй выделенную ссылку.');
      }
    } else await action(control.dataset.action, control.dataset.value);
  }, control);
});

async function poll() {
  if (!busy) await sync();
  setTimeout(poll, 900);
}

if (session) app.textContent = 'Подключаемся к комнате…';
else showEntrance();
void poll();
setInterval(updateClock, 250);

