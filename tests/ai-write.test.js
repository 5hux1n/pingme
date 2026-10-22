import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,mockProvider} from './helpers/mail-fixture.js';
import {aiHash} from '../src/ai-auth.js';
import {createServer} from 'node:http';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
const token='pm_aiw_'+'c'.repeat(64),readToken='pm_ai_'+'a'.repeat(64),exec=promisify(execFile);
async function setup(permissions=['reply','status']){
 const f=fixture(),key={id:'writer',hash:await aiHash(token),projects:['demo'],expires_at:null,permissions};
 f.env.AI_WRITE_KEYS=JSON.stringify([key]);f.env.AI_READ_KEYS=JSON.stringify([{id:'reader',hash:await aiHash(readToken),projects:['demo'],expires_at:null}]);
 f.sql.exec("INSERT INTO projects(id,slug,name) VALUES('other','other','其他项目')");
 const id=crypto.randomUUID(),other=crypto.randomUUID();
 const insert=f.sql.prepare("INSERT INTO tickets(id,number,project_id,kind,title,body,email,access_hash) VALUES(?,?,?,'feedback','标题','描述','user@example.com',?)");
 insert.run(id,'PM20261022000001','demo',id);insert.run(other,'PM20261022000002','other',other);
 const call=(path,options={})=>f.call(path,{...options,headers:{authorization:'Bearer '+token,...options.headers}});
 const update=(body={revision:0,status:'completed',suppress_email:true},requestId='same-request-000001',options={})=>call('/api/ai/feedback/'+id+'/reply',{method:'POST',...options,headers:{'content-type':'application/json','idempotency-key':requestId,...options.headers},body:JSON.stringify(body)});
 return {...f,call,update,id,other,key};
}
test('write key reads revision, combines reply and state, and never exposes admin credentials or private fields',async()=>{
 const f=await setup();const detail=await (await f.call('/api/ai/feedback/'+f.id)).json();assert.equal(detail.ticket.revision,0);
 const r=await f.update({revision:0,status:'completed',body:'已修复并发布',suppress_email:true});assert.equal(r.status,200);const result=await r.json();assert.equal(result.ticket.status,'completed');assert.equal(result.ticket.revision,1);assert.equal(result.emailSuppressed,true);
 assert.equal(f.rows('SELECT * FROM messages').length,1);assert.equal(f.rows('SELECT * FROM notification_jobs').length,0);assert.match(f.rows('SELECT * FROM ticket_events')[0].source,/^ai:writer:/);
 assert.ok(!JSON.stringify(result).includes('user@example.com'));assert.ok(!('access_hash' in result.ticket));assert.equal((await f.call('/api/admin/me')).status,200);assert.equal((await (await f.call('/api/admin/me')).json()).authenticated,false);
});
test('only status PATCH and scoped authorized replies work; reading keys, browser sessions and deletion cannot write',async()=>{
 const f=await setup();assert.equal((await f.update(undefined,undefined,{headers:{authorization:'Bearer '+readToken}})).status,403);
 assert.equal((await f.update(undefined,undefined,{headers:{authorization:''}})).status,401);
 const cookie=await f.login();assert.equal((await f.update(undefined,undefined,{headers:{authorization:'',cookie}})).status,401);
 assert.equal((await f.call('/api/ai/feedback/'+f.other+'/reply',{method:'POST',headers:{'content-type':'application/json','idempotency-key':'foreign-request-0001'},body:JSON.stringify({revision:0,status:'completed'})})).status,404);
 assert.equal((await f.call('/api/ai/feedback/'+f.id,{method:'DELETE'})).status,405);
 const r=await f.call('/api/ai/feedback/PM20261022000001',{method:'PATCH',headers:{'content-type':'application/json','idempotency-key':'status-request-00001'},body:JSON.stringify({revision:0,status:'resolved',suppress_email:true})});assert.equal(r.status,200);assert.equal((await r.json()).ticket.status,'resolved');
 assert.equal(f.rows('SELECT * FROM messages').length,1);
});
test('identical retries and concurrent requests write once; changed payloads and stale revisions conflict',async()=>{
 const f=await setup(),body={revision:0,status:'completed',body:'已完成',suppress_email:true};
 const responses=await Promise.all([f.update(body),f.update(body)]);for(const r of responses)assert.equal(r.status,200);
 const again=await (await f.update(body)).json();assert.equal(again.replayed,true);assert.equal(f.rows('SELECT * FROM messages').length,1);assert.equal(f.rows('SELECT * FROM ticket_events').length,1);
 assert.equal((await f.update({...body,body:'不同内容'})).status,409);
 assert.equal((await f.update({...body,status:'resolved'},'different-request-001')).status,409);
 assert.equal(f.rows('SELECT * FROM messages').length,1);
});
test('reply and state permissions are independent, malformed requests and foreign origins do not mutate',async()=>{
 const f=await setup(['status']);assert.equal((await f.update({revision:0,body:'无权答复'})).status,403);
 for(const body of [{status:'new'},{revision:-1,status:'new'},{revision:0,status:'invalid'},{revision:0,body:123},{revision:0,status:'closed',suppress_email:'true'},{revision:0,status:'closed',internal:true}])assert.equal((await f.update(body)).status,400);
 assert.equal((await f.update(undefined,'short')).status,400);
 assert.equal((await f.update(undefined,undefined,{headers:{origin:'https://evil.test'}})).status,403);
 assert.equal((await f.update(undefined,undefined,{headers:{'content-type':'text/plain'}})).status,415);
 assert.equal(f.rows('SELECT * FROM messages').length,0);
 const reply=await setup(['reply']);assert.equal((await reply.update({revision:0,status:'completed'})).status,403);
 assert.equal((await reply.update({revision:0,body:'补充答复',suppress_email:true})).status,200);
});
test('expired, revoked and malformed write key configurations fail closed',async()=>{
 const f=await setup();f.env.AI_WRITE_KEYS=JSON.stringify([{...f.key,expires_at:1}]);assert.equal((await f.update()).status,401);
 f.env.AI_WRITE_KEYS='[]';assert.equal((await f.update()).status,503);
 f.env.AI_WRITE_KEYS=JSON.stringify([{...f.key,permissions:['delete']}]);assert.equal((await f.update()).status,503);
 assert.equal(f.rows('SELECT * FROM messages').length,0);
});
test('AI updates enqueue one real-format user email and retries never send a second one',async()=>{
 const f=await setup(),p=mockProvider(),original=globalThis.fetch;globalThis.fetch=p.fetch;
 try{
  const body={revision:0,status:'completed',body:'已完成修复'};
  assert.equal((await f.update(body)).status,200);await f.flush();assert.equal(p.sent.length,1);assert.match(p.sent[0].body.html,/已完成修复/);assert.match(p.sent[0].body.html,/当前状态：已完结/);
  assert.equal((await f.update(body)).status,200);await f.flush();assert.equal(p.sent.length,1);
 }finally{await f.flush();globalThis.fetch=original;}
});
test('write request limits also apply to no-op requests',async()=>{
 const f=await setup();for(let n=0;n<30;n++)assert.equal((await f.update({revision:0,status:'new'},'noop-request-000000'+n,{headers:{'cf-connecting-ip':'192.0.2.1'}})).status,200);
 assert.equal((await f.update({revision:0,status:'new'},'noop-request-000099',{headers:{'cf-connecting-ip':'192.0.2.1'}})).status,429);assert.equal(f.rows('SELECT * FROM messages').length,0);
});
test('skill client processes a local feedback with the write config and can safely repeat the same request',async()=>{
 const f=await setup(),server=createServer(async(req,res)=>{const chunks=[];for await(const c of req)chunks.push(c);const response=await f.call(req.url,{method:req.method,headers:req.headers,...(req.method==='POST'?{body:Buffer.concat(chunks)}:{})});res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const dir=await mkdtemp(join(tmpdir(),'pingme-write-'));
 const config=join(dir,'client.json'),reply=join(dir,'reply.txt'),script=fileURLToPath(new URL('../skills/pingme-feedback/scripts/pingme.py',import.meta.url));
 await writeFile(config,JSON.stringify({token,base_url:'http://127.0.0.1:'+server.address().port}),{mode:0o600});await writeFile(reply,'修复已完成');
 const args=[script,'--config',config,'update',f.id,'--status','completed','--revision','0','--request-id','client-request-00001','--body-file',reply,'--no-email'];
 try{const env={...process.env,PINGME_AI_WRITE_TOKEN:'',PINGME_URL:''};assert.equal(JSON.parse((await exec('python3',args,{env})).stdout).ticket.status,'completed');assert.equal(JSON.parse((await exec('python3',args,{env})).stdout).replayed,true);assert.equal(f.rows('SELECT * FROM messages').length,1);}
 finally{await new Promise(r=>server.close(r));await rm(dir,{recursive:true,force:true});}
});
