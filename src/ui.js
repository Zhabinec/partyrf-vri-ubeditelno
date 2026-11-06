const escape = value => String(value).replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[char]));

const button = (label, action) => `<button type="button" data-action="${action}">${label}</button>`;
const kicker = text => `<p class="kicker">${text}</p>`;
const imprint = text => `<div class="imprint"><span>Вечерний вестник</span><span>${text}</span></div>`;
const stamp = text => `<span class="press-stamp">${text}</span>`;

export function voterAvatars(players, voters) {
  return voters.map(id => {
    const index = players.findIndex(player => player.id === id);
    const name = players[index]?.name ?? 'Игрок';
    const initials = name.split(/\s+/).slice(0, 2).map(word => [...word][0]).join('').toUpperCase();
    return `<span class="voter-avatar avatar-${Math.max(0, index) % 8}" role="img" title="${escape(name)}" aria-label="${escape(name)}">${escape(initials)}</span>`;
  }).join('');
}
const manuscript = (type, label, submit) => `<form data-form="${type}">
  <div class="typescript">
    <label for="manuscript">${label}</label>
    <input id="manuscript" name="value" maxlength="70" required autocomplete="off" placeholder="Короткий ответ">
  </div>
  <button type="submit">${submit}</button>
  <button type="button" class="secondary" data-action="skip">Пропустить</button>
</form>`;
const pressSeal = `<svg class="press-seal" viewBox="0 0 100 86" aria-hidden="true" focusable="false">
  <circle cx="50" cy="47" r="27" fill="none" stroke="currentColor"/>
  <path fill="currentColor" d="m50 3 2 6 6 .1-5 3.7 2 6-5-3.7-5 3.7 2-6-5-3.7 6-.1z"/>
  <g fill="none" stroke="currentColor" stroke-width="2">
    <path d="M43 79C17 74 7 52 20 27m-5 11-6-8m4 17-8-7m10 17-8-4m13 13-8-2m3-20 9-10m-8 20 9-9m-5 19 10-8"/>
    <path d="M57 79C83 74 93 52 80 27m5 11 6-8m-4 17 8-7m-10 17 8-4m-13 13 8-2m-3-20-9-10m8 20-9-9m5 19-10-8"/>
  </g>
  <text x="50" y="62" text-anchor="middle" font-size="43" fill="currentColor">☭</text>
</svg>`;
const typewriter = `<svg class="press-typewriter" viewBox="0 0 184 108" aria-hidden="true" focusable="false">
  <g stroke="currentColor" stroke-width="2.5" stroke-linejoin="round">
    <path class="typewriter-sheet" d="M56 47 52 6h75l5 41z"/>
    <path d="M61 16h50m-49 8h57m-56 8h40" fill="none"/>
    <path d="M25 50h134M33 43h118v14H33zm-1 14h120l23 38H9z" fill="var(--field)"/>
    <path d="M9 95h166v8H9zm47-12h72v5H56z" fill="currentColor"/>
    <path d="M42 65h100m-108 9h116m-105-10v5m16-5v5m16-5v5m16-5v5m16-5v5m16-5v5m16-5v5" fill="none" stroke-dasharray="5 5"/>
  </g>
</svg>`;

export function entrance(code, testBots = false) {
  return `
    <section class="intro">
      <div class="front-masthead">
        ${pressSeal}
        <div><p>СССР · 1952</p><strong>Вечерний вестник</strong></div>
      </div>
      <h1><span>Ври</span> <em>убедительно</em></h1>
      <p class="edition">Особый выпуск <span>◆</span> Цена 10 коп. <span>◆</span> 3–8 игроков</p>
      <div class="front-story">${typewriter}<p class="lede">Сегодня в газете — вы. Дай редакции честный ответ о себе. Друзья напишут свои версии, а вся компания попробует угадать, какая заметка правдива.</p></div>
      <ol class="beats"><li>Дай интервью</li><li>Сочини слух</li><li>Вычисли утку</li></ol>
    </section>
    <section class="panel entry">
      ${kicker('ПРИЁМНАЯ')}
      <h2>${code ? 'Редакция ждёт тебя' : 'Набираем редакцию'}</h2>
      <form data-form="entry">
        <label for="name">Твоё имя</label>
        <input id="name" name="name" maxlength="24" required autocomplete="nickname" placeholder="Например, Саша">
        <label for="code">Код комнаты</label>
        <input id="code" class="room-code" name="code" maxlength="6" value="${escape(code)}" placeholder="Введи код друга" autocomplete="off" autocapitalize="characters">
        <button type="submit" name="mode" value="join">Войти в комнату</button>
        ${code ? '' : '<button type="submit" name="mode" value="create" class="secondary">Создать комнату</button>'}
        ${testBots && !code ? '<button type="submit" name="mode" value="create-test" class="secondary" formnovalidate>Тест с ботами</button>' : ''}
      </form>
    </section>`;
}

function renderRoom(state) {
  const host = state.host === state.me;
  const name = id => escape(state.players.find(player => player.id === id)?.name ?? 'Игрок');
  const waiting = text => `<p class="waiting">${text}</p>`;
  const ranking = () => Object.entries(state.scores).sort((a, b) => b[1] - a[1]);
  const finaleButton = label => host ? button(label, 'next-finale') : waiting('Хост перевернёт полосу.');
  if (state.phase === 'briefing') {
    const [title, caption] = {
      interview: ['Секретное интервью', 'У каждого свой вопрос. Ответь честно и сохрани ответ в тайне.'],
      winner: ['Последний выпуск', 'Редакция подвела итоги. Сейчас узнаем, кто набрал больше очков.'],
    }[state.nextPhase];
    return `<div class="print-scene">${imprint('Экстренный выпуск')}
      ${stamp(state.nextPhase === 'interview' ? 'В ПЕЧАТЬ' : 'СРОЧНО')}
      <h1>${title}</h1><p>${caption}</p>${state.nextPhase === 'interview' ? typewriter : ''}</div>`;
  }
  if (state.phase === 'interview') {
    return `${kicker('ТОЛЬКО ДЛЯ ТЕБЯ')}<h1>Секретное <em>интервью</em></h1>
      <p class="topic">${escape(state.question)}</p>
      ${state.done ? waiting('Редакция закрыла конверт. Ждём остальных.') : manuscript('interview', 'Твой честный ответ', 'Запечатать ответ')}`;
  }
  if (state.phase === 'lobby') {
    return `${kicker('РЕДАКЦИЯ · ' + state.players.length + ' / 8')}
      <h1>Летучка <em>редакции</em></h1>
      <p class="lede">Отправь друзьям код или ссылку. Для старта нужно минимум три игрока.</p>
      <section class="invite"><strong>${state.code}</strong>${button('Скопировать ссылку', 'copy')}</section>
      <input id="invite-link" class="invite-link" aria-label="Ссылка на комнату" readonly>
      <ul class="roster">${state.players.map(({ id }) => `<li><span>${name(id)}</span><b>${id === state.host ? 'Хост' : 'В комнате'}</b></li>`).join('')}</ul>
      ${host && state.players.length >= 3 ? button('Начать выпуск', 'start') : waiting('Ждём начала выпуска.')}`;
  }
  if (state.phase === 'winner') {
    const ranked = ranking();
    const winners = ranked.filter(([, score]) => score === ranked[0][1]).map(([id]) => name(id));
    return `<div class="print-scene">${imprint('Первая полоса')}
      ${stamp('ИТОГИ ВЫПУСКА')}
      <h1>${ranked[0][1] ? winners.join(' · ') : 'Очков нет'}</h1>
      <p>${ranked[0][1] ? (winners.length === 1 ? 'Главный редактор выпуска' : 'Победители выпуска') + ' · ' + ranked[0][1] + ' очк.' : 'Редакция расходится по домам.'}</p>
      ${finaleButton('Главная утка номера')}</div>`;
  }
  if (state.phase === 'moment') {
    const { moment } = state;
    return `<div class="print-scene">${imprint('Главная утка номера')}
      <h1>${moment ? '«' + escape(moment.text) + '»' : 'Утки разлетелись'}</h1>
      <p>${moment ? 'Автор — ' + name(moment.author) + '. Поверили: ' + moment.voters.map(name).join(', ') : 'На выдумки игроков в этом выпуске никто не попался.'}</p>
      ${moment ? '<p class="reader-letter"><strong>Письмо в редакцию</strong> Что в этой заметке вас убедило?</p>' : ''}
      ${finaleButton('Открыть архив')}</div>`;
  }
  if (state.phase === 'finished') {
    return `${kicker('ПОСЛЕСЛОВИЕ')}<h1>Архив <em>редакции</em></h1>
      <ul class="roster">${ranking().map(([id, score]) => `<li><span>${name(id)}</span><b>${score}</b></li>`).join('')}</ul>
      ${state.history.length ? '' : waiting('Никто не сдал интервью. Газета сегодня не вышла.')}
      <div class="press-archive">${state.history.map(({ subject, prompt, options }) => `<details><summary>${name(subject)} · ${escape(prompt)}</summary>
        <p><strong>Правда:</strong> ${escape(options.find(option => option.truth).text)}</p></details>`).join('')}</div>
      ${host ? button('Сыграть ещё', 'start') : waiting('Хост может начать новую партию.')}`;
  }

  const round = state.round.join(' / ');
  const headline = answer => `${name(state.subject)} · ${escape(state.prompt).replace('___', () => answer)}`;
  const fact = `<p class="topic">${headline('<strong class="blank">___</strong>')}</p>`;
  if (state.phase === 'bluff') {
    return `${kicker('ВЫПУСК ' + round)}<h1>Дописать <em>до печати</em></h1>${fact}
      ${state.subject === state.me ? waiting('Это заметка о тебе. Остальные сочиняют версии, а ты хранишь тайну.')
        : state.done ? waiting('Слух принят. Ждём остальных.') : manuscript('bluff', 'Твоя версия для газеты', 'Сдать в набор')}`;
  }
  const revealed = state.phase === 'reveal';
  const canVote = !revealed && !state.done && state.me !== state.subject;
  const options = revealed ? state.result.options : state.options;
  const hint = revealed ? 'Редакция раскрыла правду и авторов выдумок.'
    : state.me === state.subject ? 'Этот выпуск про тебя. Следи за голосами.'
      : state.done ? 'Твой голос принят.' : 'Нажми на карточку, которой веришь.';
  return `${kicker('ВЫПУСК ' + round)}<h1>Какой версии <em>верим?</em></h1>${fact}
    <p class="ballot-hint" role="status">${hint}</p>
    <div class="clippings" aria-label="Варианты ответа">${options.map(option => {
      const selected = option.voters.includes(state.me);
      const label = revealed ? (option.truth ? 'ПРАВДА' : option.author ? 'УТКА · ' + name(option.author) : 'УТКА РЕДАКЦИИ')
        : selected ? 'Твой голос' : option.own ? 'Твоя версия' : '';
      const content = `<span class="clipping-text">${escape(option.text)}</span>
        <small class="clipping-label">${label}</small>
        <span class="voter-avatars" data-voters="${option.id}">${voterAvatars(state.players, option.voters)}</span>`;
      const className = 'clipping' + (option.truth ? ' verified' : '') + (selected ? ' voted' : '');
      return canVote && !option.own
        ? `<button type="button" class="${className}" data-action="vote" data-value="${option.id}">${content}</button>`
        : `<div class="${className}">${content}</div>`;
    }).join('')}</div>
    ${revealed ? `<div class="ballot-next">${host ? button(state.round[0] === state.round[1] ? 'Показать итог' : 'Следующий выпуск', 'next') : waiting('Ждём следующего выпуска.')}</div>` : ''}`;
}

export function roomScreen(state) {
  const clock = (state.deadline !== null && state.phase !== 'briefing') || state.phase === 'reveal'
    ? `<div class="countdown${state.phase === 'reveal' ? ' countdown-ended' : ''}"><time id="timer">0:00</time><progress id="time-bar" aria-label="Осталось времени"></progress><span id="clock-warning" hidden>Номер сдаётся!</span></div>` : '';
  return `<section class="panel round">
    <section class="round-status" aria-label="Время и готовность"><span id="progress"></span>${clock}</section>
    ${renderRoom(state)}
  </section>`;
}
