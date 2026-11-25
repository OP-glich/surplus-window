import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, balances,error,origin,minute } from './helpers.js';

test('response discarded, retry replays one reservation ID even after the deadline',async t=>{
  const f=await fixture(t);
  const path='/listings/1/reservations';
  const response=await fetch(f.url+'/api'+path,{method:'POST',headers:{Authorization:'Bearer '+f.tokens.kula,
    'Content-Type':'application/json','Idempotency-Key':'lost'},body:JSON.stringify({quantity:5})});
  await response.body.cancel();
  const saved=f.db.prepare("SELECT id FROM reservations WHERE org_id='kula'").get();
  const again=await f.reserve('kula',1,5,'lost');
  assert.equal(again.status,201); assert.equal(again.data.id,saved.id);
  assert.deepEqual(balances(f.db),[15,5,0,0]);
  f.clock.advanceTo(origin+2*60*minute);
  assert.deepEqual(await f.reserve('kula',1,5,'lost'),again);
  assert.equal(f.count('HELD'),1); assert.deepEqual(balances(f.db),[0,0,0,20]);
});
test('key scope includes actor, concrete resource, operation and canonical body',async t=>{
  const f=await fixture(t);
  const newListing=await f.make(); const id=newListing.data.id;
  const a=await f.reserve('kula',1,2,'one');
  error(await f.reserve('kula',id,2,'one'),422,'key_conflict');
  error(await f.reserve('kula',1,3,'one'),422,'key_conflict');
  error(await f.settle('kula',a.data.id,'cancel','one'),422,'key_conflict');
  assert.equal((await f.reserve('hope',1,2,'one')).status,201);
  const body={description:'Bread',unit:'loaves',address:'Demo',quantity:3,pickup_start:origin,pickup_end:origin+minute};
  const first=await f.post('sunrise','/listings',body,'sorted');
  assert.deepEqual(await f.post('sunrise','/listings',Object.fromEntries(Object.entries(body).reverse()),'sorted'),first);
  assert.deepEqual(balances(f.db),[16,4,0,0]);
});
test('role, organisation ownership and credentials enforced before successful replay',async t=>{
  const f=await fixture(t);
  const {data:{id}}=await f.reserve('kula',1,7);
  const path='/reservations/'+id+'/handover';
  error(await f.req('POST',path,{body:{},key:'collect'}),401,'unauthorized');
  error(await f.post('hope',path),403,'forbidden');
  error(await f.settle('hope',id,'cancel'),403,'forbidden');
  error(await f.make({},undefined,'hope'),403,'forbidden');
  error(await f.reserve('mill',1,1),403,'forbidden');
  const done=await f.settle('sunrise',id,'handover','collect');
  assert.equal(done.status,200);
  error(await f.post('mill',path,{},'collect'),403,'forbidden');
  assert.deepEqual(await f.settle('sunrise',id,'handover','collect'),done);
  error(await f.settle('sunrise',id,'handover'),409,'hold_inactive');
  assert.equal(f.count('COLLECTED'),1); assert.deepEqual(balances(f.db),[13,0,7,0]);
  // Even the original actor loses replay rights after a change of organisation.
  f.db.prepare("UPDATE actors SET org_id='mill' WHERE id='sunrise'").run();
  error(await f.post('sunrise',path,{},'collect'),403,'forbidden');
});
test('donors see only their organisation and kitchens see only their own reservations',async t=>{
  const f=await fixture(t);
  await f.make({},undefined,'mill'); await f.reserve('kula',1,2);
  assert.deepEqual((await f.get('mill','/listings')).data.listings.map(l=>l.org_id),['mill']);
  assert.deepEqual((await f.get('sunrise','/listings')).data.listings.map(l=>l.org_id),['sunrise']);
  assert.deepEqual((await f.get('hope','/reservations')).data,[]);
  assert.equal((await f.get('kula','/reservations')).data.length,1);
  for(const row of (await f.get('kula','/listings')).data.listings) assert.equal(row.reservations,undefined);
});
test('all four mutations require an action key',async t=>{
  const f=await fixture(t);
  const hold=await f.reserve('kula',1,2);
  const base='/reservations/'+hold.data.id+'/';
  for(const [actor,path,body] of [['sunrise','/listings',{}],['hope','/listings/1/reservations',{quantity:1}],
    ['sunrise',base+'handover',{}],['kula',base+'cancel',{}]])
    error(await f.req('POST',path,{token:f.tokens[actor],body}),400,'invalid_key');
  assert.deepEqual(balances(f.db),[18,2,0,0]);
});
