import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { startServer } from '../src/server.js';
import { root } from '../src/config.js';

export const origin = Date.UTC(2026, 9, 5, 8);
export const minute = 60_000;
export function clockAt(time = origin) {
  return { now:() => time, advanceTo:t => { time=t; } };
}
export function balances(db, listing=1) {
  const row = db.prepare(`SELECT total,available,written_off,
    (SELECT COALESCE(SUM(quantity),0) FROM reservations WHERE listing_id=l.id AND state='HELD') held,
    (SELECT COALESCE(SUM(quantity),0) FROM reservations WHERE listing_id=l.id AND state='COLLECTED') collected
    FROM listings l WHERE id=?`).get(listing);
  assert.equal(row.available + row.held + row.collected + row.written_off, row.total);
  const ledger = db.prepare('SELECT SUM(available_delta) AS n FROM inventory_events WHERE listing_id=?').get(listing);
  assert.equal(ledger.n, row.available, 'ledger deltas match current availability');
  return [row.available,row.held,row.collected,row.written_off];
}
export async function fixture(t, options={}) {
  const base = path.join(root,'.work','tests');
  mkdirSync(base,{recursive:true});
  const dir = mkdtempSync(path.join(base,'db-'));
  const file = path.join(dir,'test.sqlite');
  const clock = options.clock ?? clockAt();
  const config = { port:0, file, clock, sweepMs:3600000, ...options };
  let server = await startServer(config);
  const tokens = {};
  t.after(async () => {
    if (server) await server.stop();
    rmSync(dir,{recursive:true,force:true,maxRetries:3});
  });
  async function req(method,url,{ token,body,key }={}) {
    const headers = {};
    if (token) headers.Authorization='Bearer '+token;
    if (key) headers['Idempotency-Key']=key;
    if (body !== undefined) headers['Content-Type']='application/json';
    const response = await fetch(server.url+'/api'+url,{ method,headers,body:body===undefined?undefined:JSON.stringify(body) });
    return { status:response.status, data:await response.json() };
  }
  for (const identity of ['sunrise','mill','kula','hope','eagle']) {
    const session = await req('POST','/session',{body:{identity}});
    assert.equal(session.status,201);
    tokens[identity] = session.data.token;
  }
  const post = (actor,url,body={},key=randomUUID()) => req('POST',url,{body,key,token:tokens[actor]});
  const get = (actor,url) => req('GET',url,{token:tokens[actor]});
  const reserve = (actor,id,quantity,key) => post(actor,'/listings/'+id+'/reservations',{quantity},key);
  const make = (overrides={},key,actor='sunrise') => post(actor,'/listings',{
    description:'Rye loaves',unit:'portions',quantity:20,address:'Demo Lane, Windhoek',
    pickup_start:clock.now(),pickup_end:clock.now()+60*minute,...overrides
  },key);
  const settle = (actor,id,op,key) => post(actor,'/reservations/'+id+'/'+op,{},key);
  return { clock,file,req,post,get,make,reserve,settle,tokens,get db(){return server.db;},get url(){return server.url;},
    count:(kind,id=1)=>server.db.prepare('SELECT COUNT(*) n FROM inventory_events WHERE kind=? AND listing_id=?').get(kind,id).n,
    async stop(){await server.stop(); server=null;},async open(){server=await startServer(config);}
  };
}
export function error(result,status,code) {
  assert.equal(result.status,status,JSON.stringify(result.data));
  assert.equal(result.data.error.code,code);
}
