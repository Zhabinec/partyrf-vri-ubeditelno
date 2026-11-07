export function sameTurn(previous, next) {
  return Boolean(previous && previous.code === next.code && previous.me === next.me
    && previous.step === next.step && previous.phase === next.phase && !next.done);
}

// Reuse the actual form node: text, range value, caret and wave visuals survive roster updates.
export function renderRoom(root, html, previous, next) {
  const form = sameTurn(previous, next) ? root.querySelector('form[data-form]') : null;
  const focused = form?.contains(root.ownerDocument.activeElement) ? root.ownerDocument.activeElement : null;
  root.innerHTML = html;
  const replacement = root.querySelector('form[data-form]');
  if (!form || !replacement || form.dataset.form !== replacement.dataset.form) return false;
  replacement.replaceWith(form);
  focused?.focus({ preventScroll: true });
  return Boolean(focused);
}
