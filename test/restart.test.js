import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture,balances,error,origin,minute } from './helpers.js';
import { setup } from '../scripts/setup.js';
import { startServer } from '../src/server.js';

test('restart reconciles downtime exactly like a running server, and a second restart is inert',async t=>{
  const reference=await fixture(t); const reboot=await fixture(t);
  for(const f of [reference,reboot]) {
    const hold=await f.reserve('kula',1,15);
    await f.settle('sunrise',hold.data.id,'handover'); await f.reserve('eagle',1,5);
  }
  await reboot.stop();
  for(const f of [reference,reboot]) f.clock.advanceTo(origin+121*minute);
  await reference.get('sunrise','/listings'); await reboot.open();
  const snapshot=f=>({ balances:balances(f.db),events:f.db.prepare('SELECT * FROM inventory_events ORDER BY id').all(),
    states:f.db.prepare('SELECT state,quantity FROM reservations ORDER BY id').all() });
  const expected=snapshot(reference);
  assert.deepEqual(expected.balances,[0,0,15,5]);
  assert.deepEqual(snapshot(reboot),expected);
  await reboot.stop(); await reboot.open();
  assert.deepEqual(snapshot(reboot),expected); assert.equal(reboot.count('CLOSED'),1);
});
test('two normal setups preserve holds, collections, clock state and history',async t=>{
  const f=await fixture(t);
  const a=await f.reserve('kula',1,15);
  await f.settle('sunrise',a.data.id,'handover'); await f.reserve('hope',1,5);
  f.db.prepare('INSERT INTO demo_clock VALUES (1,?)').run(origin+7);
  const snapshot=()=>['migrations','organisations','actors','sessions','listings','reservations','inventory_events','retries','demo_clock']
    .map(name=>f.db.prepare('SELECT * FROM '+name+' ORDER BY rowid').all());
  const saved=snapshot();
  setup(f.file,f.clock); setup(f.file,f.clock);
  assert.deepEqual(snapshot(),saved); assert.deepEqual(balances(f.db),[0,5,15,0]);
});
test('strict SQLite checks and API reject fractional, zero, negative and unsafe stock',async t=>{
  const f=await fixture(t);
  for(const bad of [.5,0,-1,Number.MAX_SAFE_INTEGER+1,'5',null]) {
    error(await f.make({quantity:bad}),400,'invalid_quantity');
    error(await f.reserve('kula',1,bad),400,'invalid_quantity');
  }
  for(const value of [-1,21,.5]) assert.throws(()=>f.db.prepare('UPDATE listings SET available=? WHERE id=1').run(value));
  assert.equal(f.db.pragma('foreign_keys',{simple:true}),1);
  assert.equal(f.db.pragma('journal_mode',{simple:true}),'wal');
  assert.equal(f.db.pragma('busy_timeout',{simple:true}),2500);
  assert.deepEqual(balances(f.db),[20,0,0,0]);
});
test('normal mode hides clock control and authenticated demo control enforces donor ownership',async t=>{
  const normal=await fixture(t);
  error(await normal.post('sunrise','/demo/listings/1/deadline'),404,'not_found');
  const demo=await fixture(t,{demo:true});
  error(await demo.post('kula','/demo/listings/1/deadline'),403,'forbidden');
  error(await demo.post('mill','/demo/listings/1/deadline'),403,'forbidden');
  assert.deepEqual(balances(demo.db),[20,0,0,0]);
});
test('real demo clock survives closing and reopening the database',async t=>{
  const f=await fixture(t);
  await f.stop();
  const demo=await startServer({port:0,file:f.file,demo:true});
  // Give the controlled fixture a window in the real demo clock's future.
  const future=demo.db.prepare('SELECT now_ms FROM demo_clock').get().now_ms+minute;
  const listing=await fetch(demo.url+'/api/listings',{method:'POST',headers:{Authorization:'Bearer '+f.tokens.sunrise,
    'Content-Type':'application/json','Idempotency-Key':'future'},body:JSON.stringify({description:'Rolls',unit:'portions',quantity:1,address:'Demo',pickup_start:future-minute,pickup_end:future})}).then(r=>r.json());
  try {
    const jump=await fetch(demo.url+'/api/demo/listings/'+listing.id+'/deadline',{method:'POST',headers:{Authorization:'Bearer '+f.tokens.sunrise}});
    assert.equal(jump.status,200);
  } finally { await demo.stop(); }
  const again=await startServer({port:0,file:f.file,demo:true});
  try {
    assert.equal(again.db.prepare('SELECT now_ms FROM demo_clock').get().now_ms,future);
    assert.deepEqual(balances(again.db,listing.id),[0,0,0,1]);
  } finally { await again.stop(); }
});
