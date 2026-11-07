import {test} from 'node:test';
import assert from 'node:assert/strict';
import {newGame,act,tick} from '../src/game.mjs';

test('truth awards two to voter, one to subject, lie awards one to author',()=>{
 const game=newGame();let now=0;const players=['a','b','c'];
 const send=(id,type,value)=>assert.equal(act(game,{id,isHost:id==='a',players},{type,value,step:game.step},now),undefined);
 send('a','start');now=game.deadline;tick(game,now);
 for(const id of players)send(id,'interview','Ответ '+id);
 send('b','bluff','Версия б');send('c','bluff','Версия в');
 send('b','vote',game.options.find(o=>o.truth).id);
 send('c','vote',game.options.find(o=>o.author==='b').id);
 assert.deepEqual(game.scores,{a:1,b:3,c:0});
});
