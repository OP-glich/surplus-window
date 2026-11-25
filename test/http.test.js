import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, balances, error } from './helpers.js';

test('live health, static pages and locally served scripts, CSS and photograph',async t=>{
  const f=await fixture(t);
  const health=await f.req('GET','/health');
  assert.deepEqual(health,{status:200,data:{status:'ok',mode:'normal'}});
  for(const [url,type] of [['/','text/html'],['/donor.html','text/html'],['/kitchen.html','text/html'],
    ['/common.js','javascript'],['/home.js','javascript'],['/desk.js','javascript'],['/styles.css','text/css'],['/assets/bakery-crate.jpg','image/jpeg']]) {
    const response=await fetch(f.url+url);
    assert.equal(response.status,200,url);
    assert.ok(response.headers.get('content-type').includes(type),url);
    assert.ok((await response.arrayBuffer()).byteLength>0);
  }
});
test('new listing and reservation replay check current ownership of the created resource',async t=>{
  const f=await fixture(t);
  const first=await f.make({},'publish');
  assert.equal(first.status,201);
  const hold=await f.reserve('kula',first.data.id,4,'claim');
  assert.equal(hold.status,201);
  f.db.prepare("UPDATE actors SET org_id='mill' WHERE id='sunrise'").run();
  f.db.prepare("UPDATE actors SET org_id='eagle' WHERE id='kula'").run();
  error(await f.make({},'publish'),403,'forbidden');
  error(await f.reserve('kula',first.data.id,4,'claim'),403,'forbidden');
  assert.deepEqual(balances(f.db,first.data.id),[16,4,0,0]);
});
