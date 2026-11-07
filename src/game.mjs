import { interviews } from './content.mjs';

export const limits = { minPlayers: 3, maxPlayers: 8, name: 24 };
const durations = { briefing: 2400, interview: 40_000, bluff: 35_000, vote: 25_000 };
const answerKey = value => value.toLowerCase().replaceAll('ё', 'е').replace(/[^\p{L}\p{N}]/gu, '');

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

function brief(game, nextPhase, now) {
  game.nextPhase = nextPhase;
  enter(game, 'briefing', now);
}

function beginRound(game, now) {
  game.bluffs = {};
  game.votes = {};
  game.options = [];
  game.result = null;
  enter(game, 'bluff', now);
}

function closeInterviews(game, now) {
  game.editions = game.players.filter(id => game.answers[id]).map(subject => ({
    subject, truth: game.answers[subject], ...game.interviews[subject],
  }));
  if (game.editions.length) beginRound(game, now);
  else enter(game, 'finished', now);
}

function beginVote(game, now, random) {
  const { truth, decoys } = game.editions[game.round];
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
  const { subject, question } = game.editions[game.round];
  const points = Object.fromEntries(game.players.map(id => [id, 0]));
  const options = game.options.map(option => ({ ...option, voters: [] }));
  for (const [voter, optionId] of Object.entries(game.votes)) {
    const option = options[Number(optionId)];
    option.voters.push(voter);
    if (option.truth) {
      points[voter] += 2;
      points[subject]++;
    }
    else if (option.author) points[option.author]++;
  }
  for (const id of game.players) game.scores[id] += points[id];
  game.result = { options, points };
  game.history.push({ subject, question, ...game.result });
  enter(game, 'reveal', now);
}

export function tick(game, now, random = Math.random) {
  if (game.deadline === null || now < game.deadline) return;
  if (game.phase === 'briefing') enter(game, game.nextPhase, now);
  else if (game.phase === 'interview') closeInterviews(game, now);
  else if (game.phase === 'bluff') beginVote(game, now, random);
  else reveal(game, now);
}

function required(game) {
  return (game.players ?? []).filter(id => !game.departed?.includes(id)
    && (game.phase === 'interview' || id !== game.editions[game.round]?.subject));
}

export function depart(game, id, now) {
  game.departed ??= [];
  if (!game.departed.includes(id)) game.departed.push(id);
  if (game.phase === 'interview' && required(game).every(player => Object.hasOwn(game.answers, player))) closeInterviews(game, now);
  if (game.phase === 'bluff' && required(game).every(player => Object.hasOwn(game.bluffs, player))) beginVote(game, now, Math.random);
  if (game.phase === 'vote' && required(game).every(player => Object.hasOwn(game.votes, player))) reveal(game, now);
}

export function act(game, { id, isHost, players }, action, now, random = Math.random) {
  tick(game, now, random);
  if (action.step !== game.step) return 'Этот этап уже закончился.';
  if (action.type === 'start' && ['lobby', 'finished'].includes(game.phase)) {
    if (!isHost) return 'Партию запускает хост.';
    if (players.length < limits.minPlayers) return 'Нужно хотя бы три игрока.';
    const deck = shuffle(interviews, random);
    Object.assign(game, {
      players, departed: [], round: 0, history: [], editions: [], answers: {},
      interviews: Object.fromEntries(players.map((player, index) => {
        const [question, prompt, decoys] = deck[index];
        return [player, { question, prompt, decoys }];
      })),
      scores: Object.fromEntries(players.map(player => [player, 0])),
    });
    brief(game, 'interview', now);
    return;
  }
  if (game.phase === 'reveal' && action.type === 'next' && isHost) {
    game.round++;
    if (game.round === game.editions.length) brief(game, 'winner', now);
    else beginRound(game, now);
    return;
  }
  if (action.type === 'next-finale' && ['winner', 'moment'].includes(game.phase)) {
    if (!isHost) return 'Выпуски листает хост.';
    enter(game, game.phase === 'winner' ? 'moment' : 'finished', now);
    return;
  }
  if (!game.players?.includes(id)) return 'Дождись следующей партии.';
  const text = typeof action.value === 'string' ? action.value.trim().replace(/\s+/g, ' ') : '';
  const validAnswer = text.length <= 70 && answerKey(text);
  if (game.phase === 'interview' && ['interview', 'skip'].includes(action.type)) {
    if (Object.hasOwn(game.answers, id)) return 'Ответ уже принят.';
    if (action.type === 'interview' && !validAnswer) return 'Введи ответ до 70 символов.';
    game.answers[id] = action.type === 'skip' ? null : text;
    if (required(game).every(player => Object.hasOwn(game.answers, player))) closeInterviews(game, now);
    return;
  }
  const edition = game.editions[game.round];
  if (['bluff', 'vote'].includes(game.phase) && edition.subject === id) return 'Ты герой заметки. Подожди раскрытия.';
  if (game.phase === 'bluff' && ['bluff', 'skip'].includes(action.type)) {
    if (Object.hasOwn(game.bluffs, id)) return 'Ответ уже принят.';
    if (action.type === 'skip') game.bluffs[id] = null;
    else {
      if (!validAnswer) return 'Введи ответ до 70 символов.';
      if ([edition.truth, ...Object.values(game.bluffs).filter(Boolean)].some(value => answerKey(value) === answerKey(text))) {
        return 'Этот вариант не подходит. Попробуй другой или пропусти.';
      }
      game.bluffs[id] = text;
    }
    if (required(game).every(player => Object.hasOwn(game.bluffs, player))) beginVote(game, now, random);
    return;
  }
  if (game.phase === 'vote' && action.type === 'vote') {
    if (Object.hasOwn(game.votes, id)) return 'Голос уже принят.';
    const option = game.options.find(item => item.id === action.value);
    if (!option || option.author === id) return 'Выбери один из доступных вариантов.';
    game.votes[id] = option.id;
    if (required(game).every(player => Object.hasOwn(game.votes, player))) reveal(game, now);
    return;
  }
  return 'Это действие сейчас недоступно.';
}

export function view(game, id) {
  const { phase, step, deadline } = game;
  const data = { phase, step, deadline, duration: durations[phase] ?? null };
  if (phase === 'lobby') return data;
  data.scores = game.scores;
  if (phase === 'briefing') return { ...data, nextPhase: game.nextPhase };
  if (phase === 'interview') return {
    ...data, question: game.interviews[id]?.question, done: Object.hasOwn(game.answers, id),
    progress: [required(game).filter(player => Object.hasOwn(game.answers, player)).length, required(game).length],
  };
  if (phase === 'winner') return data;
  if (phase === 'moment') {
    const headlines = game.history.flatMap(({ options }) => options.filter(option => option.author));
    const moment = headlines.reduce((best, option) => option.voters.length > (best?.voters.length ?? 0) ? option : best, null);
    return { ...data, moment };
  }
  if (phase === 'finished') return { ...data, history: game.history };
  const { subject, question } = game.editions[game.round];
  data.round = [game.round + 1, game.editions.length];
  data.question = question;
  data.subject = subject;
  if (phase === 'reveal') return { ...data, result: game.result };
  const answers = phase === 'bluff' ? game.bluffs : game.votes;
  data.done = Object.hasOwn(answers, id);
  data.progress = [required(game).filter(player => Object.hasOwn(answers, player)).length, required(game).length];
  if (phase === 'vote') {
    data.options = game.options.map(option => ({
      id: option.id, text: option.text, own: option.author === id,
      voters: Object.keys(game.votes).filter(voter => game.votes[voter] === option.id),
    }));
  }
  return data;
}

export function publicView(game) {
  const { question, done, ...data } = view(game, null);
  return { ...data, ...(game.phase !== 'interview' ? { question } : {}), done: true, display: true };
}
