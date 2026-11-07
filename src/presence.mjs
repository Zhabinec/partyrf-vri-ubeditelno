// Presence is separate from explicit leave: a temporary disconnect keeps the session valid.
export const presenceTimeout = 45_000;

export function touchPlayer(room, player, now, resume) {
  if (player.disconnected) resume(room.game, player.id);
  player.disconnected = false;
  player.lastSeen = now;
  room.touched = now;
}

export function refreshPresence(room, now, depart) {
  for (const player of room.members.values()) {
    if (!player.left && !player.isBot && !player.disconnected && now - player.lastSeen >= presenceTimeout) {
      player.disconnected = true;
      depart(room.game, player.id, now);
    }
  }
  const members = [...room.members.values()];
  const host = members.find(player => player.id === room.host);
  if (!host || host.left || host.disconnected) {
    const successor = members.find(player => !player.left && !player.isBot && !player.disconnected);
    if (successor) room.host = successor.id;
  }
}
