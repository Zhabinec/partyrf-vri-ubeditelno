import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newGame, act, depart, resume } from '../src/game.mjs';
import { touchPlayer, refreshPresence, presenceTimeout, markTabClosed, releaseDisconnectedName } from '../src/presence.mjs';
import { createRoomLimiter } from '../src/room-limiter.mjs';
import { sameTurn } from '../src/render-room.js';

function room() {
  const members = new Map(['a','bot','b','c'].map(id => [id,{id,name:id,lastSeen:0,isBot:id==='bot'}]));
  return { members, host:'a', game:newGame(), touched:0 };
}

test('disconnect grace, automatic host migration and reconnect without stealing host', () => {
  const r=room();
  touchPlayer(r,r.members.get('b'),presenceTimeout-1,resume);
  refreshPresence(r,presenceTimeout-1,depart);
  assert.equal(r.host,'a');
  refreshPresence(r,presenceTimeout,depart);
  assert.equal(r.host,'b');
  assert.equal(r.members.get('a').disconnected,true);
  assert.equal(r.members.get('bot').disconnected,undefined);
  assert.ok(r.game.departed.includes('a'));
  touchPlayer(r,r.members.get('a'),presenceTimeout+1,resume);
  refreshPresence(r,presenceTimeout+1,depart);
  assert.equal(r.host,'b');
  assert.equal(r.members.get('a').disconnected,false);
  assert.ok(!r.game.departed.includes('a'));
});

test('room can recover when everyone was temporarily disconnected', () => {
  const r=room();
  refreshPresence(r,presenceTimeout,depart);
  touchPlayer(r,r.members.get('c'),presenceTimeout+10,resume);
  refreshPresence(r,presenceTimeout+10,depart);
  assert.equal(r.host,'c');
});

test('host is passed to connected human on explicit leave', () => {
  const r=room();r.members.get('a').left=true;
  refreshPresence(r,10,depart);
  assert.equal(r.host,'b');
});

test('room creation limiter has a bounded window and recovers at the boundary', () => {
  const take=createRoomLimiter({limit:2,windowMs:60_000});
  assert.equal(take(100),0);assert.equal(take(101),0);
  assert.equal(take(102),60);assert.equal(take(60_099),1);
  assert.equal(take(60_100),0);
});

test('draft only survives the same player, room and unfinished turn', () => {
  const state={code:'ABC123',me:'a',step:5,phase:'bluff',done:false};
  assert.equal(sameTurn(state,{...state,host:'b',players:[]}),true);
  for(const patch of [{code:'DEF456'},{me:'b'},{step:6},{phase:'vote'},{done:true}]) assert.equal(sameTurn(state,{...state,...patch}),false);
  assert.equal(sameTurn(null,state),false);
});

test('late actions cannot change a later turn', () => {
  const game=newGame();const context={id:'a',isHost:true,players:['a','b','c']};
  act(game,context,{type:'start',step:0},0);
  const before=JSON.stringify(game);
  assert.ok(act(game,context,{type:'vote',value:'b',step:0},1));
  assert.equal(JSON.stringify(game),before);
});

test('closed tab gets a short grace, reload cancels it, stale lobby name can be reused', () => {
  const r=room();const now=100_000;
  for(const player of r.members.values()) touchPlayer(r,player,now,resume);
  const host=r.members.get('a');markTabClosed(host,now);
  refreshPresence(r,now+4_999,depart);assert.equal(r.host,'a');
  touchPlayer(r,host,now+4_999,resume);refreshPresence(r,now+5_001,depart);assert.equal(r.host,'a');
  markTabClosed(host,now+10_000);touchPlayer(r,r.members.get('b'),now+15_000,resume);
  refreshPresence(r,now+15_000,depart);assert.equal(r.host,'b');
  releaseDisconnectedName(r,'A',now+15_000,depart);assert.equal(r.members.has('a'),false);
});
