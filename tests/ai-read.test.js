import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './helpers/mail-fixture.js';
import {createServer} from 'node:http';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
const exec=promisify(execFile),token='pm_ai_'+'a'.repeat(64),other='pm_ai_'+'b'.repeat(64);
const digest=async value=>Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))).toString('hex');
async function setup(projects=['demo']){
 const f=fixture();f.env.AI_READ_KEYS=JSON.stringify([{id:'test-key',hash:await digest(token),projects,expires_at:null}]);
 f.sql.exec("INSERT INTO projects(id,slug,name) VALUES('private','private','测试阶段项目');");
 const a=crypto.randomUUID(),b=crypto.randomUUID(),msg=crypto.randomUUID(),internal=crypto.randomUUID(),file=crypto.randomUUID(),secretFile=crypto.randomUUID(),foreign=crypto.randomUUID();
 for(const [id,project,number] of [[a,'demo','PM-20261018-ABCDEF'],[b,'private','PM-20261018-123456']])f.sql.prepare("INSERT INTO tickets(id,number,project_id,kind,title,body,email,contact,access_hash) VALUES(?,?,?,'feedback','自动摘要','完整描述的独有搜索词','private@example.test','私人联系方式',?)").run(id,number,project,id+'private-token');
 f.sql.prepare("INSERT INTO messages(id,ticket_id,role,body) VALUES(?,?,'admin','公开答复'),(?,?,'internal','内部秘密')").run(msg,a,internal,a);
 for(const [id,ticket,message,name] of [[file,a,msg,'debug.log'],[secretFile,a,internal,'internal.log'],[foreign,b,null,'foreign.log']]){f.sql.prepare("INSERT INTO attachments(id,ticket_id,message_id,name,mime,bytes,object_key) VALUES(?,?,?,?,'text/plain',5,?)").run(id,ticket,message,name,id);await f.env.FILES.put(id,'hello');}
 const call=(path,options={})=>f.call(path,{...options,headers:{authorization:'Bearer '+token,...options.headers}});
 return {...f,call,a,b,file,secretFile,foreign};
}
test('AI API requires an independent valid key, fails closed on bad scope, expiry and revocation',async()=>{
 const f=await setup();
 for(const headers of [{},{authorization:'Bearer '+other}]){
  assert.equal((await f.call('/api/ai/projects',{headers:{authorization:'',...headers}})).status,401);
 }
 const cookie=await f.login();assert.equal((await f.call('/api/ai/projects',{headers:{authorization:'',cookie}})).status,401);
 for(const row of [{projects:[]},{projects:null},{expires_at:0},{hash:'invalid'}]){const valid={id:'k',hash:await digest(token),projects:['demo'],expires_at:null};f.env.AI_READ_KEYS=JSON.stringify([{...valid,...row}]);assert.equal((await f.call('/api/ai/projects')).status,503);}
 f.env.AI_READ_KEYS=JSON.stringify([{id:'k',hash:await digest(token),projects:['demo'],expires_at:1}]);assert.equal((await f.call('/api/ai/projects')).status,401);
 f.env.AI_READ_KEYS='[]';assert.equal((await f.call('/api/ai/projects')).status,503);
});
test('project scopes apply to search, counts, details and binary attachments',async()=>{
 const f=await setup();const projects=await (await f.call('/api/ai/projects')).json();assert.deepEqual(projects.projects.map(p=>p.slug),['demo']);
 const list=await (await f.call('/api/ai/feedback?q='+encodeURIComponent('独有搜索词'))).json();assert.equal(list.total,1);assert.equal(list.feedback[0].id,f.a);assert.equal(list.has_more,false);
 assert.equal((await (await f.call('/api/ai/feedback?project=private')).json()).total,0);
 for(const path of ['/api/ai/feedback/'+f.b,'/api/ai/feedback/PM-20261018-123456','/api/ai/attachments/'+f.foreign])assert.equal((await f.call(path)).status,404);
 const file=await f.call('/api/ai/attachments/'+f.file);assert.equal(await file.text(),'hello');assert.equal(file.headers.get('cache-control'),'private, no-store');
 const all=await setup('*');assert.equal((await (await all.call('/api/ai/projects')).json()).projects.length,2);
});
test('detail omits private fields, internal messages and internal attachments',async()=>{
 const f=await setup();const response=await f.call('/api/ai/feedback/PM-20261018-ABCDEF'),body=await response.json();
 assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'private, no-store');assert.equal(body.ticket.body,'完整描述的独有搜索词');assert.deepEqual(body.messages.map(m=>m.role),['admin']);assert.deepEqual(body.attachments.map(a=>a.id),[f.file]);assert.equal(body.attachments[0].download_path,'/api/ai/attachments/'+f.file);
 const text=JSON.stringify(body);for(const value of ['内部秘密','private@example.test','私人联系方式','access_hash','object_key','internal.log'])assert.ok(!text.includes(value),value);
 assert.equal((await f.call('/api/ai/attachments/'+f.secretFile)).status,404);
});
test('AI keys cannot modify business data, invoke email actions or authenticate admin endpoints',async()=>{
 const f=await setup();const before=JSON.stringify(f.rows('SELECT * FROM tickets'));
 for(const method of ['POST','PATCH','DELETE','PUT','HEAD'])assert.equal((await f.call('/api/ai/feedback/'+f.a,{method})).status,405);
 assert.equal((await f.call('/api/ai/feedback/'+f.a+'/reply')).status,404);
 assert.equal((await f.call('/api/admin/tickets/'+f.a)).status,401);
 assert.equal(JSON.stringify(f.rows('SELECT * FROM tickets')),before);assert.equal(f.rows('SELECT * FROM notification_jobs').length,0);
});
test('pagination, full description search, filters and parameter limits are deterministic',async()=>{
 const f=await setup('*');let r=await (await f.call('/api/ai/feedback?limit=1')).json();assert.equal(r.total,2);assert.equal(r.feedback.length,1);assert.equal(r.has_more,true);
 const second=await (await f.call('/api/ai/feedback?limit=1&page=2')).json();assert.notEqual(second.feedback[0].id,r.feedback[0].id);assert.equal(second.has_more,false);
 assert.equal((await (await f.call('/api/ai/feedback?status=closed')).json()).total,0);
 assert.equal((await (await f.call('/api/ai/feedback?updated_after=2099-01-01T00:00:00Z')).json()).total,0);
 for(const query of ['limit=51','page=0','limit=NaN','page=1.5','status=oops','updated_after=bad','q='+('x'.repeat(201))])assert.equal((await f.call('/api/ai/feedback?'+query)).status,400,query);
 assert.equal((await (await f.call('/api/ai/feedback?q=%27%20OR%201%3D1')).json()).total,0);
});
test('AI requests are rate limited per key and source',async()=>{
 const f=await setup();
 for(let i=0;i<120;i++)assert.equal((await f.call('/api/ai/projects',{headers:{'cf-connecting-ip':'127.0.0.1'}})).status,200);
 const r=await f.call('/api/ai/projects',{headers:{'cf-connecting-ip':'127.0.0.1'}});assert.equal(r.status,429);assert.equal(r.headers.get('retry-after'),'60');
});
test('installed skill client reads API and downloads attachments without browser login',async()=>{
 const f=await setup();let redirect=false,redirectHits=0;const server=createServer(async(req,res)=>{
  if(req.url==='/redirect-target'){redirectHits++;res.end('{}');return;}
  if(redirect){res.writeHead(302,{location:'/redirect-target'});res.end();return;}
  try{const response=await f.call(req.url,{headers:req.headers});res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));}catch{res.writeHead(500);res.end();}
 });await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const dir=await mkdtemp(join(tmpdir(),'pingme-skill-'));
 const script=fileURLToPath(new URL('../skills/pingme-feedback/scripts/pingme.py',import.meta.url)),config=join(dir,'config.json'),output=join(dir,'debug.log');
 await writeFile(config,JSON.stringify({base_url:'http://127.0.0.1:'+server.address().port,token}),{mode:0o600});
 const run=(...args)=>exec('python3',[script,'--config',config,...args],{env:{...process.env,PINGME_AI_TOKEN:'',PINGME_URL:''}});
 try{
  assert.equal(JSON.parse((await run('projects')).stdout).projects[0].slug,'demo');
  assert.equal(JSON.parse((await run('search','--q','独有搜索词')).stdout).total,1);
  assert.equal(JSON.parse((await run('get','pm-20261018-abcdef')).stdout).ticket.id,f.a);
  await run('download',f.file,'--output',output);assert.equal(await readFile(output,'utf8'),'hello');
  await assert.rejects(run('download',f.file,'--output',output));
  await writeFile(config,JSON.stringify({base_url:'http://127.0.0.1:'+server.address().port,token:other}));await assert.rejects(run('projects'),e=>e.stderr.includes('HTTP 401')&&!e.stderr.includes(other));
  redirect=true;await assert.rejects(run('projects'),e=>e.stderr.includes('HTTP 302'));assert.equal(redirectHits,0);
 }finally{await new Promise(resolve=>server.close(resolve));await rm(dir,{recursive:true,force:true});}
});
