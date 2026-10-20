import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,mockProvider} from './helpers/mail-fixture.js';
import {shortTicketToken,validTicketToken,ticketNumber} from '../src/ticket-access.js';
const digest=async token=>Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token))).toString('hex');
async function setup(fn){const original=globalThis.fetch,provider=mockProvider(),f=fixture();globalThis.fetch=provider.fetch;try{await fn(f,provider);}finally{await f.flush();globalThis.fetch=original;}}
test('ticket access accepts new case-sensitive codes and legacy tokens only',()=>{
 assert.match(shortTicketToken(),/^[A-Za-z0-9]{12}$/);
 for(const token of ['Ab7kP2mN9xQ4','a'.repeat(64)])assert.equal(validTicketToken(token),true);
 for(const token of ['', '123456', 'a'.repeat(13),'A'.repeat(64),'a'.repeat(11)+'_'])assert.equal(validTicketToken(token),false);
});
test('short links open, reply and download own attachments while old links still work',()=>setup(async(f,p)=>{
 const form=new FormData();form.set('project','demo');form.set('email','user@example.com');form.set('body','短链接验证');form.set('files',new File(['sample'],'sample.txt',{type:'text/plain'}));
 const response=await f.call('/api/tickets',{method:'POST',body:form}),data=await response.json();assert.equal(response.status,201);assert.match(data.number,/^PM\d{14}$/);assert.match(data.url,/^\/t\/[A-Za-z0-9]{12}$/);await f.flush();
 const token=data.url.slice(3),ticket=f.rows('SELECT * FROM tickets')[0],file=f.rows('SELECT * FROM attachments')[0];
 assert.equal((await f.call('/api'+data.url)).status,200);assert.ok(p.sent.find(x=>x.body.to[0]==='user@example.com').body.text.includes(data.url));
 const changed=token.slice(0,-1)+(token.endsWith('A')?'a':'A');assert.equal((await f.call('/api/t/'+changed)).status,404);
 assert.equal((await f.call('/api/attachments/'+file.id+'?token='+changed)).status,403);
 const download=await f.call('/api/attachments/'+file.id+'?token='+token);assert.equal(download.status,200);assert.equal(await download.text(),'sample');
 const reply=new FormData();reply.set('body','追加内容');assert.equal((await f.call('/api'+data.url+'/reply',{method:'POST',body:reply})).status,200);await f.flush();
 const legacy='a'.repeat(64);f.sql.prepare('UPDATE tickets SET access_hash=? WHERE id=?').run(await digest(legacy),ticket.id);
 assert.equal((await f.call('/api/t/'+legacy)).status,200);assert.equal((await f.call('/api/attachments/'+file.id+'?token='+legacy)).status,200);
 assert.equal((await f.call('/api/t/'+token)).status,404);
}));
test('collisions retry creation atomically without duplicating tickets or jobs',()=>setup(async f=>{
 const batch=f.env.DB.batch.bind(f.env.DB);let attempts=0;
 f.env.DB.batch=async statements=>{if(statements[0].query.startsWith('INSERT INTO tickets')&&++attempts<=2)throw Error('UNIQUE constraint failed: tickets.'+(attempts===1?'access_hash':'number'));return batch(statements);};
 const {response,data}=await f.create();assert.equal(response.status,201);assert.match(data.url,/^\/t\/[A-Za-z0-9]{12}$/);assert.equal(attempts,3);assert.equal(f.rows('SELECT * FROM tickets').length,1);assert.equal(f.rows('SELECT * FROM ticket_events').length,1);assert.equal(f.rows('SELECT * FROM notification_jobs').length,3);
}));
test('ticket reads rate limit guessing before returning private data',()=>setup(async f=>{
 for(let n=0;n<120;n++)assert.equal((await f.call('/api/t/Ab7kP2mN9xQ4',{headers:{'cf-connecting-ip':'192.0.2.8'}})).status,404);
 assert.equal((await f.call('/api/t/Ab7kP2mN9xQ4',{headers:{'cf-connecting-ip':'192.0.2.8'}})).status,429);
}));

test('feedback numbers use Beijing dates and six random decimal digits',()=>{
 assert.match(ticketNumber(new Date('2026-10-20T16:00:00Z')),/^PM20261021[0-9]{6}$/);
 assert.match(ticketNumber(new Date('2026-10-20T15:59:59Z')),/^PM20261020[0-9]{6}$/);
});
