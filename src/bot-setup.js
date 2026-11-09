export function botSetupMarkup({ min, max, default: value }) {
  return `<dialog id="bot-settings" class="sound-settings bot-settings" aria-labelledby="bot-title">
    <h2 id="bot-title">Тест с ботами</h2>
    <p class="bot-description">Ты играешь за себя, боты — за остальных. Собери компанию для проверки.</p>
    <form id="bot-form">
      <label for="bot-name">Твоё имя</label>
      <input id="bot-name" name="name" maxlength="24" required autocomplete="nickname">
      <label for="bot-count">Количество ботов</label>
      <div class="bot-stepper">
        <button id="bot-less" type="button" aria-label="Уменьшить число ботов">−</button>
        <input id="bot-count" name="botCount" type="number" min="${min}" max="${max}" step="1" value="${value}" required inputmode="numeric" aria-describedby="bot-summary">
        <button id="bot-more" type="button" aria-label="Увеличить число ботов">+</button>
      </div>
      <p id="bot-summary" class="bot-summary" aria-live="polite"></p>
      <div id="bot-crew" class="bot-crew" aria-hidden="true"></div>
      <p id="bot-error" role="status" hidden></p>
      <button id="bot-create" type="submit">Собрать компанию</button>
      <button id="bot-cancel" type="button" class="secondary">Назад</button>
    </form>
  </dialog>`;
}

export function createBotSetup(onCreate, documentRoot = document) {
  const dialog = documentRoot.querySelector('#bot-settings');
  if (!dialog) return { open() {} };
  const form = dialog.querySelector('#bot-form');
  const count = dialog.querySelector('#bot-count');
  const name = dialog.querySelector('#bot-name');
  const less = dialog.querySelector('#bot-less');
  const more = dialog.querySelector('#bot-more');
  const submit = dialog.querySelector('#bot-create');
  const error = dialog.querySelector('#bot-error');
  let busy = false;
  let opener;
  function update() {
    const value = count.valueAsNumber;
    const valid = count.checkValidity();
    less.disabled = busy || value <= Number(count.min);
    more.disabled = busy || value >= Number(count.max);
    dialog.querySelector('#bot-summary').textContent = valid
      ? 'Ты + ' + value + (value < 5 ? ' бота' : ' ботов') + ' · всего участников: ' + (value + 1)
      : 'Выбери от ' + count.min + ' до ' + count.max + ' ботов';
    const crew = dialog.querySelector('#bot-crew');
    crew.replaceChildren();
    for (let index = 0; index <= (valid ? value : 0); index++) {
      const badge = documentRoot.createElement('span');
      badge.textContent = index ? 'БОТ ' + index : 'ТЫ';
      if (!index) badge.className = 'bot-human';
      crew.append(badge);
    }
  }
  less.addEventListener('click', () => { count.stepDown(); update(); });
  more.addEventListener('click', () => { count.stepUp(); update(); });
  count.addEventListener('input', update);
  dialog.querySelector('#bot-cancel').addEventListener('click', () => dialog.close());
  dialog.addEventListener('cancel', event => { if (busy) event.preventDefault(); });
  dialog.addEventListener('close', () => {
    if (opener?.isConnected) opener.focus();
    else {
      const heading = documentRoot.querySelector('#app h1');
      if (heading) { heading.tabIndex = -1; heading.focus({ preventScroll: true }); }
    }
  });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (busy || !form.reportValidity()) return;
    busy = true;
    error.hidden = true;
    for (const field of form.elements) field.disabled = true;
    submit.textContent = 'Собираем…';
    try {
      await onCreate(name.value.trim(), count.valueAsNumber);
      dialog.close();
    } catch (failure) {
      error.textContent = failure.status ? failure.message : 'Не удалось создать комнату. Попробуй ещё раз.';
      error.hidden = false;
    } finally {
      busy = false;
      for (const field of form.elements) field.disabled = false;
      submit.textContent = 'Собрать компанию';
      update();
    }
  });
  update();
  return {
    open(enteredName, control) {
      name.value = enteredName?.trim() || 'Тестер';
      opener = control;
      error.hidden = true;
      update();
      dialog.showModal();
      count.focus();
    },
  };
}
