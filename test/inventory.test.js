import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { fixture,balances,error,origin,minute } from './helpers.js';

test('HTTP concurrency: three fresh 20-portion listings each have exactly one five-portion winner',async t=>{
  const f=await fixture(t);
  for (let i=0;i<3;i++) {
    const {data:{id}}=await f.make();
    assert.equal((await f.reserve('kula',id,15)).status,201);
    const results=await Promise.all([f.reserve('hope',id,5),f.reserve('eagle',id,5)]);
    assert.deepEqual(results.map(r=>r.status).sort(),[201,409]);
    error(results.find(r=>r.status===409),409,'insufficient_stock');
    assert.deepEqual(balances(f.db,id),[0,20,0,0]);
    assert.equal(f.count('HELD',id),2);
    assert.deepEqual(f.db.prepare("SELECT quantity FROM reservations WHERE listing_id=? AND org_id!='kula' AND state='HELD'").all(id),[{quantity:5}]);
  }
});
test('cancelling releases once and another kitchen can claim all returned portions',async t=>{
  const f=await fixture(t);
  const {data:{id}}=await f.reserve('kula',1,20);
  const once=await f.settle('kula',id,'cancel','cancel-once');
  assert.equal(once.status,200);
  assert.deepEqual(await f.settle('kula',id,'cancel','cancel-once'),once);
  error(await f.settle('kula',id,'cancel'),409,'hold_inactive');
  assert.deepEqual(balances(f.db),[20,0,0,0]);
  assert.equal((await f.reserve('hope',1,20)).status,201);
  assert.deepEqual(balances(f.db),[0,20,0,0]); assert.equal(f.count('CANCELLED'),1);
});
test('hold expires exactly at thirty minutes and is released before closing',async t=>{
  const f=await fixture(t);
  const hold=(await f.reserve('kula',1,20)).data;
  assert.equal(hold.expires_at,origin+30*minute);
  f.clock.advanceTo(hold.expires_at-1);
  error(await f.reserve('hope',1,1),409,'insufficient_stock');
  f.clock.advanceTo(hold.expires_at);
  error(await f.settle('sunrise',hold.id,'handover'),409,'hold_expired');
  assert.deepEqual(balances(f.db),[20,0,0,0]);
  assert.equal((await f.reserve('hope',1,20)).status,201);
  assert.equal(f.count('EXPIRED'),1);
});
test('start inclusive, deadline exclusive and hold expiring at deadline never releases availability',async t=>{
  const f=await fixture(t);
  const {data:{id}}=await f.make({pickup_start:origin+10,pickup_end:origin+20});
  f.clock.advanceTo(origin+9);
  error(await f.reserve('kula',id,1),409,'window_not_started');
  f.clock.advanceTo(origin+10);
  const hold=await f.reserve('kula',id,2);
  assert.equal(hold.status,201); assert.equal(hold.data.expires_at,origin+20);
  f.clock.advanceTo(origin+19);
  assert.equal((await f.settle('sunrise',hold.data.id,'handover')).status,200);
  const last=await f.reserve('hope',id,1); assert.equal(last.status,201);
  f.clock.advanceTo(origin+20);
  error(await f.reserve('eagle',id,1),409,'window_closed');
  error(await f.settle('sunrise',last.data.id,'handover'),409,'hold_expired');
  error(await f.settle('hope',last.data.id,'cancel'),409,'hold_expired');
  assert.deepEqual(balances(f.db,id),[0,0,2,18]);
  assert.equal(f.db.prepare("SELECT available_delta FROM inventory_events WHERE listing_id=? AND kind='EXPIRED'").get(id).available_delta,0);
  assert.equal(f.count('CLOSED',id),1);
});
for (const [name,collected,held] of [['zero available',15,5],['available and held',10,4],['all collected',20,0]]) {
  test('closing arithmetic: '+name,async t=>{
    const f=await fixture(t,{demo:true});
    const hold=await f.reserve('kula',1,collected);
    await f.settle('sunrise',hold.data.id,'handover');
    if (held) await f.reserve('eagle',1,held);
    const before=balances(f.db);
    for (let i=0;i<2;i++) {
      assert.equal((await f.post('sunrise','/demo/listings/1/deadline')).status,200);
      await f.get('sunrise','/listings');
    }
    const loss=20-collected;
    assert.deepEqual(balances(f.db),[0,0,collected,loss]);
    assert.equal(f.count('CLOSED'),1);
    const closing=f.db.prepare("SELECT quantity,available_delta FROM inventory_events WHERE kind='CLOSED'").get();
    assert.deepEqual(closing,{quantity:loss,available_delta:0-before[0]});
    assert.equal(f.count('COLLECTED'),1);
  });
}
test('periodic sweep closes a due listing without an HTTP read',async t=>{
  const f=await fixture(t,{sweepMs:20});
  f.clock.advanceTo(origin+3*60*minute);
  for(let i=0; i<100 && !f.count('CLOSED'); i++) await delay(15);
  assert.equal(f.count('CLOSED'),1); assert.deepEqual(balances(f.db),[0,0,0,20]);
});
test('unexpected reservation failure rolls back stock, events, hold and retry record',async t=>{
  const f=await fixture(t);
  const log = t.mock.method(console,'error',() => {});
  f.db.exec("CREATE TRIGGER force_error BEFORE INSERT ON retries BEGIN SELECT RAISE(ABORT,'simulated disk write failure'); END");
  error(await f.reserve('kula',1,8,'fault'),500,'internal_error');
  assert.deepEqual(balances(f.db),[20,0,0,0]);
  assert.equal(log.mock.callCount(),1);
  assert.equal(f.count('HELD'),0);
  assert.equal(f.db.prepare('SELECT count(*) n FROM reservations').get().n,0);
  assert.equal(f.db.prepare('SELECT count(*) n FROM retries').get().n,0);
  f.db.exec('DROP TRIGGER force_error');
  assert.equal((await f.reserve('kula',1,8,'fault')).status,201);
});
