import test from 'node:test';
import assert from 'node:assert/strict';
import {createTicketStore,tokenFromUrl,lastSpeaker,ACTIVE_STATUSES} from '../public/recent-tickets.js';

const memory=()=>{const data=new Map();return {getItem:k=>data.has(k)?data.get(k):null,setItem:(k,v)=>data.set(k,String(v)),data};};
const T1='a'.repeat(64),T2='Ab3dEf6hIj9k',T3='b'.repeat(64);

test('extracts only well-formed private tokens from a ticket URL',()=>{
 assert.equal(tokenFromUrl('/t/'+T1),T1);
 assert.equal(tokenFromUrl('https://pingme.pm/t/'+T2+'?x=1'),T2);
 for(const bad of ['','/t/','/t/short','/t/'+'z'.repeat(64),'/demo',null])assert.equal(tokenFromUrl(bad),'');
});

test('remembers newest first per project, deduplicates and forgets',()=>{
 const s=createTicketStore(memory());
 s.remember({token:T1,slug:'relaxin',number:'PM1'});
 s.remember({token:T2,slug:'other',number:'PM2'});
 s.remember({token:T3,slug:'relaxin',number:'PM3'});
 s.remember({token:T1,slug:'relaxin',number:'PM1'});
 assert.deepEqual(s.forProject('relaxin').map(e=>e.token),[T1,T3]);
 assert.deepEqual(s.forProject('other').map(e=>e.number),['PM2']);
 s.forget(T1);
 assert.deepEqual(s.forProject('relaxin').map(e=>e.token),[T3]);
});

test('rejects malformed input, caps the list and expires old entries',()=>{
 let clock=Date.UTC(2026,9,24);const storage=memory(),s=createTicketStore(storage,()=>clock);
 s.remember({token:'bad',slug:'relaxin'});s.remember({token:T1,slug:'Bad Slug'});
 assert.equal(s.list().length,0);
 for(let i=0;i<25;i++)s.remember({token:String(i).padStart(12,'x'),slug:'p'});
 assert.equal(s.list().length,20);
 clock+=91*24*60*60*1000;
 assert.equal(s.list().length,0);
});

test('survives corrupt, blocked or missing storage',()=>{
 const corrupt=memory();corrupt.setItem('pingme:tickets','{not json');
 assert.deepEqual(createTicketStore(corrupt).list(),[]);
 const blocked={getItem(){throw Error('SecurityError')},setItem(){throw Error('QuotaExceeded')}};
 const s=createTicketStore(blocked);
 assert.doesNotThrow(()=>s.remember({token:T1,slug:'relaxin'}));
 assert.deepEqual(s.forProject('relaxin'),[]);
 assert.deepEqual(createTicketStore(undefined).list(),[]);
});

test('last speaker skips status changes; only open statuses are active',()=>{
 assert.equal(lastSpeaker([{role:'visitor'},{role:'admin'},{role:'system'}]),'admin');
 assert.equal(lastSpeaker([{role:'admin'},{role:'visitor'}]),'visitor');
 assert.equal(lastSpeaker([]),'');
 assert.deepEqual([...ACTIVE_STATUSES].sort(),['new','progress','resolved']);
});
