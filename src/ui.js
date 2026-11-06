const escape = value => String(value).replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[char]));

const button = (label, action) => `<button type="button" data-action="${action}">${label}</button>`;
const kicker = text => `<p class="kicker">${text}</p>`;

export function entrance(code, testBots = false) {
  return `
    <section class="intro">
      ${kicker('ВЕЧЕРНЯЯ ГАЗЕТА · 3–8 ИГРОКОВ')}
      <h1>Ври <em>убедительно</em></h1>
      <p class="edition">Особый выпуск <span>◆</span> Издаётся со слов очевидцев</p>
      <p class="lede">В заметке пропала важная деталь. Допиши её так, чтобы друзья поверили. Потом найди настоящую версию среди чужих выдумок.</p>
      <ol class="beats"><li>Дописать заметку</li><li>Найти правду</li><li>Проверить тираж</li></ol>
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
      bluff: ['Срочно в набор!', 'В заметке пропала деталь. У тебя 35 секунд, чтобы её придумать.'],
      vote: ['В печать ушло всё!', 'Редактор перепутал версии. Выбери ту, которая была правдой.'],
      winner: ['Последний выпуск', 'Редакция подвела итоги. Сейчас узнаем, кто набрал больше очков.'],
    }[state.nextPhase];
    return `<div class="print-scene">${kicker('ЭКСТРЕННЫЙ ВЫПУСК')}<h1>${title}</h1><p>${caption}</p></div>`;
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
    return `<div class="print-scene">${kicker('ПЕРВАЯ ПОЛОСА')}
      <h1>${ranked[0][1] ? winners.join(' · ') : 'Очков нет'}</h1>
      <p>${ranked[0][1] ? (winners.length === 1 ? 'Главный редактор выпуска' : 'Победители выпуска') : 'Редакция расходится по домам.'}</p>
      ${finaleButton('Главная утка номера')}</div>`;
  }
  if (state.phase === 'moment') {
    const { moment } = state;
    return `<div class="print-scene">${kicker('ГЛАВНАЯ УТКА НОМЕРА')}
      <h1>${moment ? '«' + escape(moment.text) + '»' : 'Утки разлетелись'}</h1>
      <p>${moment ? 'Автор — ' + name(moment.author) + '. Поверили: ' + moment.voters.map(name).join(', ') : 'На выдумки игроков в этом выпуске никто не попался.'}</p>
      ${finaleButton('Открыть архив')}</div>`;
  }
  if (state.phase === 'finished') {
    return `${kicker('ПОСЛЕСЛОВИЕ')}<h1>Архив <em>редакции</em></h1>
      <ul class="roster">${ranking().map(([id, score]) => `<li><span>${name(id)}</span><b>${score}</b></li>`).join('')}</ul>
      <div class="press-archive">${state.history.map(({ prompt, options }) => `<details><summary>${escape(prompt)}</summary>
        <p><strong>Правда:</strong> ${escape(options.find(option => option.truth).text)}</p></details>`).join('')}</div>
      ${host ? button('Сыграть ещё', 'start') : waiting('Хост может начать новую партию.')}`;
  }

  const round = state.round.join(' / ');
  const fact = `<p class="topic">${escape(state.prompt).replace('___', '<strong class="blank">___</strong>')}</p>`;
  if (state.phase === 'bluff') {
    return `${kicker('ВЫПУСК ' + round)}<h1>Дописать <em>до печати</em></h1>${fact}
      <p class="lede">Заполни пропуск так, чтобы друзья поверили.</p>
      ${state.done ? waiting('Ответ принят. Ждём остальных.') : `
      <form data-form="bluff">
        <label for="bluff">Твой вариант</label>
        <input id="bluff" name="value" maxlength="70" required autocomplete="off">
        <button type="submit">Сдать в набор</button>
        <button type="button" class="secondary" data-action="skip">Пропустить</button>
      </form>`}`;
  }
  if (state.phase === 'vote') {
    return `${kicker('ВЫПУСК ' + round)}<h1>Какой версии <em>верим?</em></h1>${fact}
      ${state.done ? waiting('Голос принят. Ждём поправку редакции.') : `
        <div class="clippings" aria-label="Варианты ответа">${state.options.map(option =>
          option.own ? `<p class="clipping">${escape(option.text)}<small>Твоя версия</small></p>`
            : `<button type="button" class="clipping" data-action="vote" data-value="${escape(option.id)}">${escape(option.text)}</button>`).join('')}</div>`}`;
  }
  return `${kicker('ПОПРАВКА · ' + round)}<h1>Редакция <em>уточняет</em></h1>${fact}
    <ul class="roster answers">${state.result.options.map(option => `<li${option.truth ? ' class="verified"' : ''}>
      <span>${escape(option.text)}<small>${option.truth ? 'Правда' : option.author ? 'Выдумка · ' + name(option.author) : 'Выдумка игры'}
      ${option.voters.length ? ' · Поверили: ' + option.voters.map(name).join(', ') : ''}</small></span></li>`).join('')}</ul>
    <ul class="roster">${ranking().map(([id, score]) => `<li><span>${name(id)} <small>+${state.result.points[id]} за раунд</small></span><b>${score}</b></li>`).join('')}</ul>
    ${host ? button(state.round[0] === state.round[1] ? 'Показать итог' : 'Следующий факт', 'next') : waiting('Ждём следующего хода.')}`;
}

export function roomScreen(state) {
  const clock = state.deadline !== null && state.phase !== 'briefing'
    ? '<div class="countdown"><time id="timer"></time><progress id="time-bar" aria-label="Осталось времени"></progress><span id="clock-warning" hidden>Номер сдаётся!</span></div>' : '';
  return `<section class="panel round">
    <section class="round-status" aria-label="Время и готовность"><span id="progress"></span>${clock}</section>
    ${renderRoom(state)}
  </section>`;
}
