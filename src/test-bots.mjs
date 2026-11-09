import { randomUUID } from 'node:crypto';
import { act, view, limits } from './game.mjs';

export const testBotsEnabled = process.env.TEST_BOTS !== '0';
export const botLimits = { min: limits.minPlayers - 1, max: limits.maxPlayers - 1, default: 5 };
export function getBotCount(value = botLimits.default) {
  return Number.isInteger(value) && value >= botLimits.min && value <= botLimits.max ? value : null;
}
const names = ['Бот Наборщик', 'Бот Репортёр', 'Бот Корректор', 'Бот Редактор', 'Бот Печатник', 'Бот Верстальщик', 'Бот Курьер'];

export function addTestBots(room, count = botLimits.default) {
  for (const name of names.slice(0, count)) {
    room.members.set(randomUUID(), { id: randomUUID(), name, isBot: true });
  }
}

export function runTestBots(room, now) {
  const { game } = room;
  if (!room.testRoom || !['interview', 'bluff', 'vote'].includes(game.phase)) return;
  const members = [...room.members.values()].filter(member => !member.left);
  const players = members.map(member => member.id);
  const { step } = game;
  for (const [index, bot] of members.filter(member => member.isBot).entries()) {
    if (game.step !== step) break;
    const state = view(game, bot.id);
    if (state.done || state.subject === bot.id || now < state.deadline - state.duration + 650) continue;
    const send = (type, value) => act(game, { id: bot.id, isHost: false, players }, { type, value, step }, now);
    if (state.phase === 'interview') {
      const { decoys } = game.interviews[bot.id];
      send('interview', decoys[index % decoys.length]);
    } else if (state.phase === 'bluff') {
      const { decoys } = game.editions[game.round];
      const pitch = [...decoys, 'редакционный кот'].find(text => !send('bluff', text));
      if (!pitch) send('skip');
    } else {
      const options = state.options.filter(option => !option.own);
      send('vote', options[Math.floor(Math.random() * options.length)].id);
    }
  }
}
