import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { newGame, act, tick, view, publicView, depart } from '../src/game.mjs';
import { roomScreen } from '../src/ui.js';

const players = ['a', 'b', 'c', 'd'];
const roster = players.map(id => ({ id, name: 'Игрок ' + id }));
const context = id => ({ id, isHost: id === 'a', players });

function checkPublic(game) {
  const state = publicView(game);
  for (const key of ['word', 'selected', 'assigned', 'ratings', 'answers', 'truth', 'interviews']) assert.equal(state[key], undefined, key + ' leaked');
  if (['interview','rating'].includes(game.phase)) assert.equal(state.question ?? state.topic, undefined);
  if (game.phase === 'vote' && state.options) for (const option of state.options) {
    assert.equal(option.truth, undefined);
    assert.equal(option.author, undefined);
  }
  const html = roomScreen({ ...state, players: roster, me: null, host: 'a', code: 'ABC123' });
  assert.ok(!html.includes('data-action="start"'));
  assert.ok(!html.includes('data-form='));
  return state;
}

test('full multiplayer game, safe shared display, departure and rematch', () => {
  const game = newGame();
  let now = 1000;
  assert.equal(act(game, context('b'), {type:'start',step:0}, now), 'Партию запускает хост.');
  assert.equal(act(game, context('a'), {type:'start',step:0}, now), undefined);
  let left = false;
  for (let iteration=0; iteration<250 && game.phase !== 'finished'; iteration++) {
    const state = checkPublic(game);
    if (['intro','briefing','sealed','explain'].includes(game.phase)) {
      now = game.deadline; tick(game, now); continue;
    }
    if (!left && ['topics','choose','interview'].includes(game.phase)) { depart(game, 'd', now); left = true; }
    let acted = false;
    for (const id of players.filter(id => id !== 'd')) {
      const mine = view(game,id);
      let type, value;
      if (mine.phase === 'topics' && !mine.done) [type,value]=['topic','Тема '+id];
      if (mine.phase === 'rating' && !mine.done) [type,value]=['rate',70];
      if (mine.phase === 'guessing' && mine.subject !== id && !mine.done) [type,value]=['guess',60];
      if (mine.phase === 'choose' && !mine.done) [type,value]=['choose',mine.options[0]];
      if (mine.phase === 'interview' && !mine.done) [type,value]=['interview','Честный ответ '+id];
      if (mine.phase === 'bluff' && mine.subject !== id && !mine.done) [type,value]=['bluff','Версия '+id];
      if (mine.phase === 'vote' && !mine.done && mine.subject !== id) {
        type='vote'; value=mine.options ? mine.options.find(option=>!option.own).id : players.find(other=>other!==id);
      }
      if (id === 'a') {
        if (['recap','recap-why'].includes(mine.phase)) type='next-recap';
        if (mine.phase === 'reveal') type='next';
        if (['winner','moment','verdict'].includes(mine.phase)) type='next-finale';
      }
      if (type) {
        const error=act(game,context(id),{type,value,step:mine.step},now);
        assert.equal(error,undefined, mine.phase+': '+error); acted=true;
      }
    }
    assert.ok(acted || game.phase !== state.phase, 'game stalled in '+game.phase);
  }
  assert.equal(game.phase,'finished');
  checkPublic(game);
  assert.equal(act(game,context('a'),{type:'start',step:game.step},now),undefined);
  assert.deepEqual(game.departed,[]);
});

test('independent HTTP sessions, reconnect, host migration and screen access', async t => {
  const child=spawn(process.execPath,['server.mjs'],{cwd:new URL('../',import.meta.url),env:{...process.env,PORT:'0',BIND_ADDRESS:'127.0.0.1',TEST_BOTS:'0'},stdio:['ignore','pipe','pipe']});
  t.after(()=>child.kill());
  let output='';
  const origin=await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(new Error('startup timeout')),5000);
    child.stdout.on('data',chunk=>{output+=chunk; const port=output.match(/localhost:(\d+)/)?.[1];if(port){clearTimeout(timer);resolve('http://127.0.0.1:'+port);}});
    child.once('error',reject);
  });
  async function api(path,body,token){
    const response=await fetch(origin+'/api/'+path,{method:body?'POST':'GET',headers:{...(body?{'Content-Type':'application/json'}:{}),...(token?{Authorization:'Bearer '+token}:{})},body:body?JSON.stringify(body):undefined});
    return {status:response.status,...await response.json()};
  }
  assert.equal((await api('create-test',{name:'Tester'})).status,404);
  const host=await api('create',{name:'Хост'});
  const code=host.state.code, path='rooms/'+code;
  const b=await api('join',{name:'Второй',code}), c=await api('join',{name:'Третий',code});
  assert.equal((await api(path,null,b.token)).state.players.length,3);
  assert.equal((await api(path,null,b.token)).state.me,b.state.me);
  assert.equal((await api(path,null,'invalid')).status,401);
  assert.equal(b.state.displayToken,undefined);
  const screen='display/'+code+'/'+host.state.displayToken;
  assert.equal((await api(screen)).state.me,null);
  assert.equal((await api(screen,{type:'start'})).status,405);
  assert.equal((await api(path,{type:'start',step:host.state.step},b.token)).status,409);
  assert.equal((await api(path,{type:'start',step:host.state.step},host.token)).status,200);
  assert.equal((await api(path,{type:'leave'},host.token)).status,200);
  assert.equal((await api(path,null,b.token)).state.host,b.state.me);
  assert.equal((await api(path,null,host.token)).status,401);
  assert.equal((await api(screen)).status,200);
  await api(path,{type:'leave'},b.token);await api(path,{type:'leave'},c.token);
  assert.equal((await api(screen)).status,404);
});
