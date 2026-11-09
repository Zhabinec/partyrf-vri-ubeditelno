import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { newGame, act, tick, view } from '../src/game.mjs';
import { addTestBots, runTestBots } from '../src/test-bots.mjs';
import { entrance } from '../src/ui.js';

test('one human and five bots can complete a whole game', () => {
  const room={ game:newGame(), members:new Map([['human-token',{id:'human',name:'Тестер'}]]), host:'human', testRoom:true };
  addTestBots(room);
  const members=[...room.members.values()];
  assert.equal(members.length,6);
  assert.equal(members.filter(member=>member.isBot).length,5);
  assert.equal(new Set(members.map(member=>member.id)).size,6);
  assert.equal(new Set(members.map(member=>member.name)).size,6);
  const players=members.map(member=>member.id);
  let now=0;
  const send=(type,value)=>assert.equal(act(room.game,{id:'human',isHost:true,players},{type,value,step:room.game.step},now),undefined);
  send('start');
  for(let turn=0;turn<300&&room.game.phase!=='finished';turn++){
    if(['intro','briefing','sealed','explain'].includes(room.game.phase)) {
      now=room.game.deadline;tick(room.game,now);continue;
    }
    now+=1000;
    runTestBots(room,now);
    const state=view(room.game,'human');
    if(state.phase==='topics'&&!state.done)send('topic','Тема человека');
    else if(state.phase==='rating'&&!state.done)send('rate',45);
    else if(state.phase==='guessing'&&state.subject!=='human'&&!state.done)send('guess',40);
    else if(state.phase==='choose'&&!state.done)send('choose',state.options[0]);
    else if(state.phase==='interview'&&!state.done)send('interview','Честный ответ человека');
    else if(state.phase==='bluff'&&state.subject!=='human'&&!state.done)send('bluff','Версия человека');
    else if(state.phase==='vote'&&state.subject!=='human'&&!state.done)send('vote',state.options?state.options.find(option=>!option.own).id:players.find(id=>id!=='human'));
    else if(['recap','recap-why'].includes(state.phase))send('next-recap');
    else if(state.phase==='reveal')send('next');
    else if(['winner','moment','verdict'].includes(state.phase))send('next-finale');
    tick(room.game,now);
  }
  assert.equal(room.game.phase,'finished');
  if(room.game.answers)for(const bot of members.filter(member=>member.isBot))assert.equal(typeof room.game.answers[bot.id],'string','every bot must submit an interview');
  if(room.game.fakes)assert.equal(room.game.fakes.length,2);
  assert.ok(entrance('',true).includes('Тест с 5 ботами'));
  assert.ok(!entrance('',false).includes('create-test'));
});

test('enabled test-room API adds exactly five bots and starts with six participants', async t => {
  const child=spawn(process.execPath,['server.mjs'],{cwd:new URL('../',import.meta.url),env:{...process.env,PORT:'0',BIND_ADDRESS:'127.0.0.1',TEST_BOTS:'1'},stdio:['ignore','pipe','pipe']});
  t.after(()=>child.kill());
  const origin=await new Promise((resolve,reject)=>{
    let output='';
    const timer=setTimeout(()=>reject(new Error('server startup timed out')),5000);
    child.stdout.on('data',chunk=>{output+=chunk;const port=output.match(/localhost:(\d+)/)?.[1];if(port){clearTimeout(timer);resolve('http://127.0.0.1:'+port);}});
    child.once('error',error=>{clearTimeout(timer);reject(error);});
  });
  const page=await fetch(origin).then(response=>response.text());
  assert.ok(page.includes('data-test-bots'));
  const created=await fetch(origin+'/api/create-test',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'Тестер'})});
  assert.equal(created.status,201);
  const {state,token}=await created.json();
  assert.equal(state.players.length,6);
  assert.equal(state.players.filter(player=>player.isBot).length,5);
  const started=await fetch(origin+'/api/rooms/'+state.code,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({type:'start',step:state.step})});
  assert.equal(started.status,200);
  assert.notEqual((await started.json()).state.phase,'lobby');
});
