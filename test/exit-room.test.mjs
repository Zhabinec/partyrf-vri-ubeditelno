import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createExitQueue } from '../src/exit-room.js';

function memoryStorage() {
  const data = new Map();
  return { get length() { return data.size; }, key: i => [...data.keys()][i], getItem: key => data.get(key), setItem: (key,value) => data.set(key,value), removeItem: key => data.delete(key) };
}
const session = { code:'ABC123', token:'old-token' };

test('next entry waits until the pending exit is acknowledged', async () => {
  let acknowledge; let calls=0;
  const storage=memoryStorage();
  const queue=createExitQueue(()=>{calls++;return new Promise(resolve=>{acknowledge=resolve;});},storage);
  const leaving=queue.enqueue(session);
  assert.equal(storage.length,1);
  const beforeEntry=queue.flush();
  assert.equal(leaving,beforeEntry);assert.equal(calls,1);
  acknowledge({});await beforeEntry;
  assert.equal(storage.length,0);
});

test('failed exit survives navigation and retries with the original session', async () => {
  const storage=memoryStorage();
  const first=createExitQueue(async()=>{throw new Error('offline');},storage);
  await assert.rejects(first.enqueue(session));assert.equal(storage.length,1);
  const calls=[];const next=createExitQueue(async(...args)=>{calls.push(args);},storage);
  await next.flush();
  assert.deepEqual(calls,[['rooms/ABC123',{type:'leave'},'old-token']]);assert.equal(storage.length,0);
});

test('an already closed session acknowledges the queued exit', async () => {
  const storage=memoryStorage();
  const queue=createExitQueue(async()=>{throw Object.assign(new Error('closed'),{status:401});},storage);
  await queue.enqueue(session);assert.equal(storage.length,0);
});
