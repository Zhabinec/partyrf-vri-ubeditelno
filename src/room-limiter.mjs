// A service-wide limit also works behind reverse proxies without trusting client-supplied IP headers.
export function createRoomLimiter({ limit = 30, windowMs = 60_000 } = {}) {
  let used = 0;
  let until = 0;
  return now => {
    if (now >= until) { used = 0; until = now + windowMs; }
    if (used >= limit) return Math.max(1, Math.ceil((until - now) / 1000));
    used++;
    return 0;
  };
}
