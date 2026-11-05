import { facts } from './content.mjs';

export const limits = { minPlayers: 3, maxPlayers: 8, name: 24 };
const roundCount = 5;
const durations = { bluff: 35_000, vote: 25_000 };
const normalize = value => value.toLowerCase().replaceAll('ё', 'е').replace(/[^\p{L}\p{N}]/gu, '');
const numberWords = new Map([['три', '3'], ['семь', '7']]);
const answerKey = value => {
  const key = normalize(value);
  return numberWords.get(key) ?? key;
};

export function newGame() {
  return { phase: 'lobby', step: 0, deadline: null };
}

function shuffle(items, random) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function enter(game, phase, now) {
  game.phase = phase;
  game.step++;
  game.deadline = durations[phase] ? now + durations[phase] : null;
}

function beginRound(game, now) {
  game.bluffs = {};
  game.votes = {};
  game.options = [];
  game.result = null;
  enter(game, 'bluff', now);
}

function beginVote(game, now, random) {
  const [, truth, ...decoys] = game.deck[game.round];
  const options = [{ text: truth, truth: true }];
  for (const [author, text] of Object.entries(game.bluffs)) {
    if (text !== null) options.push({ text, author });
  }
  for (const text of decoys) {
    if (options.length >= 3) break;
    if (!options.some(option => answerKey(option.text) === answerKey(text))) options.push({ text });
  }
  game.options = shuffle(options, random).map((option, index) => ({ ...option, id: String(index) }));
  enter(game, 'vote', now);
}

function reveal(game, now) {
  const points = Object.fromEntries(game.players.map(id => [id, 0]));
  const options = game.options.map(option => ({ ...option, voters: [] }));
  for (const [voter, optionId] of Object.entries(game.votes)) {
    const option = options[Number(optionId)];
    option.voters.push(voter);
    if (option.truth) points[voter] += 2;
    else if (option.author) points[option.author]++;
  }
  for (const id of game.players) game.scores[id] += points[id];
  game.result = { options, points };
  enter(game, 'reveal', now);
}

export function tick(game, now, random = Math.random) {
  if (game.deadline === null || now < game.deadline) return;
  if (game.phase === 'bluff') beginVote(game, now, random);
  else reveal(game, now);
}

export function act(game, { id, isHost, players }, action, now, random = Math.random) {
  tick(game, now, random);
  if (action.step !== game.step) return 'Этот этап уже закончился.';
  if (action.type === 'start' && ['lobby', 'finished'].includes(game.phase)) {
    if (!isHost) return 'Партию запускает хост.';
    if (players.length < limits.minPlayers) return 'Нужно хотя бы три игрока.';
    Object.assign(game, {
      players, round: 0, deck: shuffle(facts, random).slice(0, roundCount),
      scores: Object.fromEntries(players.map(player => [player, 0])),
    });
    beginRound(game, now);
    return;
  }
  if (game.phase === 'reveal' && action.type === 'next' && isHost) {
    game.round++;
    if (game.round === roundCount) enter(game, 'finished', now);
    else beginRound(game, now);
    return;
  }
  if (!game.players?.includes(id)) return 'Дождись следующей партии.';
  if (game.phase === 'bluff' && ['bluff', 'skip'].includes(action.type)) {
    if (Object.hasOwn(game.bluffs, id)) return 'Ответ уже принят.';
    if (action.type === 'skip') game.bluffs[id] = null;
    else {
      const text = typeof action.value === 'string' ? action.value.trim().replace(/\s+/g, ' ') : '';
      const key = answerKey(text);
      if (!key || text.length > 70) return 'Введи ответ до 70 символов.';
      const [, truth] = game.deck[game.round];
      if ([truth, ...Object.values(game.bluffs).filter(Boolean)].some(value => answerKey(value) === key)) {
        return 'Этот вариант не подходит. Попробуй другой или пропусти.';
      }
      game.bluffs[id] = text;
    }
    if (Object.keys(game.bluffs).length === game.players.length) beginVote(game, now, random);
    return;
  }
  if (game.phase === 'vote' && action.type === 'vote') {
    if (Object.hasOwn(game.votes, id)) return 'Голос уже принят.';
    const option = game.options.find(item => item.id === action.value);
    if (!option || option.author === id) return 'Выбери один из доступных вариантов.';
    game.votes[id] = option.id;
    if (Object.keys(game.votes).length === game.players.length) reveal(game, now);
    return;
  }
  return 'Это действие сейчас недоступно.';
}

export function view(game, id) {
  const { phase, step, deadline } = game;
  const data = { phase, step, deadline };
  if (phase === 'lobby') return data;
  data.scores = game.scores;
  if (phase === 'finished') return data;
  data.round = [game.round + 1, roundCount];
  data.prompt = game.deck[game.round][0];
  if (phase === 'reveal') return { ...data, result: game.result };
  const answers = phase === 'bluff' ? game.bluffs : game.votes;
  data.done = Object.hasOwn(answers, id);
  data.progress = [Object.keys(answers).length, game.players.length];
  if (phase === 'vote') {
    data.options = game.options.map(option => ({
      id: option.id, text: option.text, own: option.author === id,
    }));
  }
  return data;
}
