// Keep an unacknowledged explicit exit until the server confirms it, even across navigation.
export function createExitQueue(request, storage, prefix = 'room-exit:') {
  const pending = new Map();
  let inFlight;
  try {
    for (let index = 0; index < storage.length; index++) {
      const key = storage.key(index);
      if (!key?.startsWith(prefix)) continue;
      const session = JSON.parse(storage.getItem(key));
      if (typeof session?.token === 'string' && typeof session?.code === 'string') pending.set(session.token, session);
    }
  } catch {}
  function flush() {
    if (inFlight) return inFlight;
    inFlight = (async () => {
      for (const session of pending.values()) {
        try { await request('rooms/' + session.code, { type: 'leave' }, session.token); }
        catch (error) { if (![401, 404].includes(error.status)) throw error; }
        pending.delete(session.token);
        try { storage.removeItem(prefix + session.token); } catch {}
      }
    })().finally(() => { inFlight = null; });
    return inFlight;
  }
  return {
    flush,
    enqueue(session) {
      pending.set(session.token, session);
      try { storage.setItem(prefix + session.token, JSON.stringify(session)); } catch {}
      return flush();
    },
  };
}
