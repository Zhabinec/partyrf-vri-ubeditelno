const escape = value => String(value).replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[char]));

const button = (label, action) => `<button type="button" data-action="${action}">${label}</button>`;
const kicker = text => `<p class="kicker">${text}</p>`;

export function entrance(code) {
  return `
    <section class="intro">
      ${kicker('03–08 ИГРОКОВ / ОНЛАЙН')}
      <h1>Ври<br><em>убедительно</em></h1>
      <p class="lede">Придумай ответ, в который поверят друзья. И попробуй сам не попасться.</p>
      <ol class="beats"><li>Придумай выдумку</li><li>Найди правду</li><li>Узнай, кто поверил</li></ol>
    </section>
    <section class="panel entry">
      ${kicker('ТОЧКА ВХОДА')}
      <h2>${code ? 'Тебя ждут в комнате' : 'Собираем компанию'}</h2>
      <form data-form="entry">
        <label for="name">Твоё имя</label>
        <input id="name" name="name" maxlength="24" required autocomplete="nickname" placeholder="Например, Саша">
        <label for="code">Код комнаты</label>
        <input id="code" class="room-code" name="code" maxlength="6" value="${escape(code)}" placeholder="Введи код друга" autocomplete="off" autocapitalize="characters">
        <button type="submit" name="mode" value="join">Войти в комнату</button>
        ${code ? '' : '<button type="submit" name="mode" value="create" class="secondary">Создать комнату</button>'}
      </form>
    </section>`;
}

function renderRoom(state) {
  const host = state.host === state.me;
  const name = id => escape(state.players.find(player => player.id === id)?.name ?? 'Игрок');
  const waiting = text => `<p class="waiting">${text}</p>`;
  const ranking = () => Object.entries(state.scores).sort((a, b) => b[1] - a[1]);
  if (state.phase === 'lobby') {
    return `${kicker('ЛОББИ · ' + state.players.length + ' / 8')}
      <h1>Собираем <em>компанию</em></h1>
      <p class="lede">Отправь друзьям код или ссылку. Для старта нужно минимум три игрока.</p>
      <section class="invite"><strong>${state.code}</strong>${button('Скопировать ссылку', 'copy')}</section>
      <input id="invite-link" class="invite-link" aria-label="Ссылка на комнату" readonly>
      <ul class="roster">${state.players.map(({ id }) => `<li><span>${name(id)}</span><b>${id === state.host ? 'Хост' : 'В комнате'}</b></li>`).join('')}</ul>
      ${host && state.players.length >= 3 ? button('Начать игру', 'start') : waiting('Ждём старта партии.')}`;
  }
  if (state.phase === 'finished') {
    const ranked = ranking();
    const winners = ranked.filter(([, score]) => score === ranked[0][1]).map(([id]) => name(id));
    return `${kicker('ФИНАЛ')}<h1>Кто кого <em>провёл?</em></h1>
      <p class="lede">${ranked[0][1] ? winners.join(', ') + (winners.length === 1 ? ' побеждает!' : ' делят победу!') : 'Никто не набрал очков.'}</p>
      <ul class="roster">${ranked.map(([id, score]) => `<li><span>${name(id)}</span><b>${score}</b></li>`).join('')}</ul>
      ${host ? button('Сыграть ещё', 'start') : waiting('Хост может начать новую партию.')}`;
  }

  const round = state.round.join(' / ');
  const fact = `<p class="topic">${escape(state.prompt).replace('___', '<strong class="blank">___</strong>')}</p>`;
  if (state.phase === 'bluff') {
    return `${kicker('РАУНД ' + round)}<h1>Придумай <em>выдумку</em></h1>${fact}
      <p class="lede">Заполни пропуск так, чтобы друзья поверили.</p>
      ${state.done ? waiting('Ответ принят. Ждём остальных.') : `
      <form data-form="bluff">
        <label for="bluff">Твой вариант</label>
        <input id="bluff" name="value" maxlength="70" required autocomplete="off">
        <button type="submit">Отправить</button>
        <button type="button" class="secondary" data-action="skip">Пропустить</button>
      </form>`}`;
  }
  if (state.phase === 'vote') {
    return `${kicker('РАУНД ' + round)}<h1>Где <em>правда?</em></h1>${fact}
      ${state.done ? waiting('Голос принят. Ждём раскрытия.') : `
      <form data-form="vote">
        <label for="answer">Какой ответ настоящий?</label>
        <select id="answer" name="value" required>
          <option value="">Выбери ответ</option>
          ${state.options.map(option => `<option value="${option.id}" ${option.own ? 'disabled' : ''}>${escape(option.text)}${option.own ? ' (твой вариант)' : ''}</option>`).join('')}
        </select>
        <button type="submit">Подтвердить голос</button>
      </form>`}`;
  }
  return `${kicker('РАСКРЫТИЕ · ' + round)}<h1>Момент <em>правды</em></h1>${fact}
    <ul class="roster answers">${state.result.options.map(option => `<li>
      <span>${escape(option.text)}<small>${option.truth ? 'Правда' : option.author ? 'Выдумка · ' + name(option.author) : 'Выдумка игры'}
      ${option.voters.length ? ' · Поверили: ' + option.voters.map(name).join(', ') : ''}</small></span></li>`).join('')}</ul>
    <ul class="roster">${ranking().map(([id, score]) => `<li><span>${name(id)} <small>+${state.result.points[id]} за раунд</small></span><b>${score}</b></li>`).join('')}</ul>
    ${host ? button(state.round[0] === state.round[1] ? 'Показать итог' : 'Следующий факт', 'next') : waiting('Ждём следующего хода.')}`;
}

export function roomScreen(state) {
  return `<section class="panel round">
    <section class="round-status" aria-label="Время и готовность"><span id="progress"></span><time id="timer"></time></section>
    ${renderRoom(state)}
  </section>`;
}
