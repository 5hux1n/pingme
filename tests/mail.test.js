import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,mockProvider,webhookRequest} from './helpers/mail-fixture.js';
import {drainMail,stripReply,htmlText,parseAdminReply,verifyWebhook} from '../src/mail.js';
import {validEmail} from '../src/ticket-events.js';
async function withProvider(fn){const original=globalThis.fetch,p=mockProvider();globalThis.fetch=p.fetch;const f=fixture();try{await fn(f,p);}finally{await f.flush();globalThis.fetch=original;}}
async function adminChange(f,id,body){const cookie=await f.login();return f.call('/api/admin/tickets/'+id+'/reply',{method:'POST',headers:{cookie,'content-type':'application/json'},body:JSON.stringify(body)});}
function incoming(id,to,from='user@example.com',text='邮件补充内容\n\nOn yesterday, someone wrote:\n旧内容'){return {id,to:[to],received_for:[to],from,text,headers:{},authentication:{dkim:'pass',dmarc:'pass'},attachments:[]};}
test('validates required email without accepting header injection',()=>{assert.ok(validEmail('name+tag@example.com'));for(const s of ['', 'a@b','a@b.com\r\nBcc:evil@x.com','a b@x.com'])assert.equal(validEmail(s),false);});
test('new feedback creates durable user/admin mail and WeCom jobs; user token is encrypted',()=>withProvider(async(f,p)=>{
 assert.equal((await f.create('')).response.status,400);assert.equal(f.rows('SELECT * FROM tickets').length,0);
 const {response,data}=await f.create();assert.equal(response.status,201);await f.flush();assert.equal(p.sent.length,2);const t=f.rows('SELECT * FROM tickets')[0];assert.equal(t.email,'user@example.com');assert.equal(f.rows('SELECT * FROM notification_jobs').length,3);assert.equal(f.rows("SELECT * FROM notification_jobs WHERE status='sent'").length,3);
 const token=data.url.slice(3),thread=f.rows('SELECT * FROM mail_threads')[0];assert.ok(!thread.access_token.includes(token));const user=p.sent.find(x=>x.body.to[0]==='user@example.com');assert.ok(user.body.text.includes(data.url));assert.match(user.body.reply_to,/feedback\+u_[a-f0-9]{40}@pingme.test/);assert.notEqual(user.body.reply_to,p.sent.find(x=>x.body.to[0]==='admin@example.com').body.reply_to);
 const view=await (await f.call('/api'+data.url)).json();assert.ok(!('email' in view.ticket));
}));
test('combined reply/status emits one user email; no-op and stale edits emit none',()=>withProvider(async(f,p)=>{
 await f.create();await f.flush();const t=f.rows('SELECT * FROM tickets')[0];const r=await adminChange(f,t.id,{body:'已修复',status:'resolved',revision:0});assert.equal(r.status,200);const saved=await r.json();assert.equal(saved.ticket.revision,1);await f.flush();assert.equal(p.sent.length,3);assert.match(p.sent.at(-1).body.text,/已修复/);assert.match(p.sent.at(-1).body.text,/当前状态：待解决/);assert.match(p.sent.at(-1).body.headers['In-Reply-To'],/^<.+@resend.test>$/);assert.match(p.sent.at(-1).body.subject,/开发者已经答复了！$/);assert.match(p.sent.find(x=>x.body.to[0]==='user@example.com').body.subject,/已经收到您的反馈/);
 assert.equal((await adminChange(f,t.id,{body:'',status:'resolved',revision:1})).status,200);await f.flush();assert.equal(p.sent.length,3);
 assert.equal((await adminChange(f,t.id,{body:'过期答复',status:'closed',revision:0})).status,409);assert.equal(f.rows('SELECT * FROM messages').length,1);assert.equal(f.rows('SELECT * FROM ticket_events').length,2);
}));
test('internal notes never leak in user email, including simultaneous status changes',()=>withProvider(async(f,p)=>{
 await f.create();await f.flush();const t=f.rows('SELECT * FROM tickets')[0];await adminChange(f,t.id,{body:'内部秘密 A',internal:true,status:'new',revision:0});await f.flush();assert.equal(p.sent.length,2);
 await adminChange(f,t.id,{body:'内部秘密 B',internal:true,status:'progress',revision:1});await f.flush();assert.equal(p.sent.length,3);assert.ok(!p.sent.at(-1).body.text.includes('秘密'));assert.match(p.sent.at(-1).body.text,/沟通中/);
}));
test('signed inbound user reply archives once, trims quoted history and notifies admin',()=>withProvider(async(f,p)=>{
 const {data}=await f.create();await f.flush();const address=p.sent.find(x=>x.body.to[0]==='user@example.com').body.reply_to,id=crypto.randomUUID();p.received.set(id,incoming(id,address));assert.equal((await webhookRequest(f,id)).status,200);await f.flush();assert.equal(f.rows('SELECT * FROM messages').length,1);assert.equal(f.rows('SELECT * FROM messages')[0].body,'邮件补充内容');assert.equal(p.sent.length,3);assert.equal(p.sent.at(-1).body.to[0],'admin@example.com');assert.match((await (await f.call('/api'+data.url)).json()).messages[0].body,/邮件补充内容/);
 await webhookRequest(f,id);await f.flush();assert.equal(f.rows('SELECT * FROM messages').length,1);assert.equal(p.sent.length,3);
}));
test('admin email can combine a status command and reply into one user notification',()=>withProvider(async(f,p)=>{
 await f.create();await f.flush();const address=p.sent.find(x=>x.body.to[0]==='admin@example.com').body.reply_to,id=crypto.randomUUID();p.received.set(id,incoming(id,address,'admin@example.com','状态：待解决\n已经处理完成'));await webhookRequest(f,id);await f.flush();assert.equal(f.rows('SELECT * FROM tickets')[0].status,'resolved');assert.equal(f.rows('SELECT * FROM messages')[0].role,'admin');assert.equal(p.sent.length,3);assert.match(p.sent.at(-1).body.text,/已经处理完成/);
}));
test('rejects forged webhook, mismatched sender and failed authentication; ignores auto replies',()=>withProvider(async(f,p)=>{
 await f.create();await f.flush();const address=p.sent.find(x=>x.body.to[0]==='admin@example.com').body.reply_to;
 assert.equal((await webhookRequest(f,crypto.randomUUID(),{badSignature:true})).status,401);
 for(const mode of ['wrong-from','auth-fail','auto']){const id=crypto.randomUUID(),email=incoming(id,address,'admin@example.com');if(mode==='wrong-from')email.from='attacker@example.com';if(mode==='auth-fail')email.authentication={dkim:'fail',dmarc:'fail'};if(mode==='auto')email.headers={'Auto-Submitted':'auto-replied'};p.received.set(id,email);await webhookRequest(f,id);await f.flush();}
 assert.equal(f.rows('SELECT * FROM messages').length,0);assert.equal(f.rows("SELECT * FROM mail_inbound WHERE status='rejected'").length,2);assert.equal(f.rows("SELECT * FROM mail_inbound WHERE status='ignored'").length,1);
}));
test('mail failure keeps ticket intact and can retry from durable jobs',()=>withProvider(async(f,p)=>{
 p.setFail(true);const {response}=await f.create();assert.equal(response.status,201);await f.flush();assert.equal(f.rows('SELECT * FROM tickets').length,1);assert.equal(f.rows("SELECT * FROM notification_jobs WHERE channel='email' AND status='retry'").length,2);
 p.setFail(false);f.sql.exec('UPDATE notification_jobs SET next_attempt=0');await drainMail(f.env);assert.equal(p.sent.length,2);assert.equal(f.rows("SELECT * FROM notification_jobs WHERE status='sent'").length,3);
}));
test('bounce suppresses further visitor delivery without suppressing administrator notifications',()=>withProvider(async(f,p)=>{
 await f.create();await f.flush();const t=f.rows('SELECT * FROM tickets')[0],job=f.rows("SELECT * FROM notification_jobs WHERE audience='visitor'")[0];await webhookRequest(f,job.provider_id,{type:'email.bounced'});await f.flush();assert.equal(f.rows('SELECT * FROM mail_threads')[0].suppressed,1);await adminChange(f,t.id,{status:'progress',revision:0});await f.flush();assert.equal(p.sent.length,2);assert.equal(f.rows("SELECT * FROM notification_jobs WHERE status='failed'").length,1);
}));
test('reply parser preserves new text, strips common quoted blocks and extracts explicit status only',async()=>{assert.equal(stripReply('hello\n\n> quoted'),'hello');assert.equal(htmlText('<p>你好 &amp; thanks</p><blockquote>old</blockquote><script>bad</script>'),'你好 & thanks');assert.deepEqual(parseAdminReply('状态：不受理\n完成'),{status:'closed',body:'完成'});assert.deepEqual(parseAdminReply('用户说状态：不受理'),{body:'用户说状态：不受理'});assert.equal(await verifyWebhook('{}',new Headers(),'whsec_eA=='),false);});
test('operator can retry a failed job only with authenticated same-origin access',()=>withProvider(async(f,p)=>{
 p.setFail(true);await f.create();await f.flush();const job=f.rows("SELECT * FROM notification_jobs WHERE channel='email'")[0],url='/api/admin/mail/jobs/'+encodeURIComponent(job.id)+'/retry';
 assert.equal((await f.call(url,{method:'POST'})).status,401);const cookie=await f.login();assert.equal((await f.call(url,{method:'POST',headers:{cookie,origin:'https://attacker.test'}})).status,403);
 p.setFail(false);assert.equal((await f.call(url,{method:'POST',headers:{cookie}})).status,200);await f.flush();assert.ok(p.sent.some(x=>x.key==='pingme/'+job.id));
}));
test('attachment storage failure returns the saved private link and still queues confirmation',()=>withProvider(async(f,p)=>{
 f.env.FILES.put=async()=>{throw Error('simulated storage failure');};const form=new FormData();for(const [k,v] of Object.entries({project:'demo',kind:'bug',title:'附件测试',body:'内容',email:'user@example.com'}))form.set(k,v);form.set('files',new File(['hello'],'sample.txt',{type:'text/plain'}));
 const response=await f.call('/api/tickets',{method:'POST',body:form}),data=await response.json();assert.equal(response.status,201);assert.match(data.warning,/附件/);assert.match(data.url,/^\/t\/[A-Za-z0-9]{12}$/);await f.flush();assert.equal(p.sent.length,2);
}));
test('incoming attachment metadata is persisted with its message and duplicate webhook is harmless',()=>withProvider(async(f,p)=>{
 await f.create();await f.flush();const address=p.sent.find(x=>x.body.to[0]==='user@example.com').body.reply_to,id=crypto.randomUUID(),aid=crypto.randomUUID(),email=incoming(id,address,'user@example.com','附上日志');email.attachments=[{id:aid}];p.received.set(id,email);const normal=p.fetch;
 globalThis.fetch=async(url,options)=>{if(String(url).endsWith('/'+id+'/attachments'))return Response.json({data:[{id:aid,filename:'debug.log',size:5,content_type:'text/plain',download_url:'https://inbound-cdn.resend.com/test-log'}]});if(String(url)==='https://inbound-cdn.resend.com/test-log')return new Response('hello');return normal(url,options);};
 await webhookRequest(f,id);await f.flush();const files=f.rows('SELECT * FROM attachments');assert.equal(files.length,1);assert.equal(files[0].bytes,5);assert.equal(files[0].message_id,'mail-'+id);assert.equal(f.rows('SELECT * FROM messages')[0].body,'附上日志');await webhookRequest(f,id);await f.flush();assert.equal(f.rows('SELECT * FROM attachments').length,1);
}));
test('expired worker lease recovers queued delivery without resending completed jobs',()=>withProvider(async(f,p)=>{
 await f.create();await f.flush();const before=p.sent.length;await drainMail(f.env);assert.equal(p.sent.length,before);
 const t=f.rows('SELECT * FROM tickets')[0];await adminChange(f,t.id,{status:'progress',revision:0});await f.flush();const job=f.rows("SELECT j.* FROM notification_jobs j JOIN ticket_events e ON e.id=j.event_id WHERE e.kind='status'")[0];
 f.sql.prepare("UPDATE notification_jobs SET status='sending',provider_id='',updated_at=datetime('now','-6 minutes') WHERE id=?").run(job.id);await drainMail(f.env);assert.equal(p.sent.at(-1).key,'pingme/'+job.id);assert.equal(f.rows("SELECT status FROM notification_jobs WHERE id='"+job.id+"'")[0].status,'sent');
}));

test('reply sent to bare feedback mailbox uses authenticated thread references',()=>withProvider(async(f,p)=>{
 await f.create();await f.flush();const reference=f.rows("SELECT message_id FROM mail_references WHERE audience='visitor'")[0].message_id,id=crypto.randomUUID(),email=incoming(id,'feedback@pingme.test');email.headers={'In-Reply-To':reference};p.received.set(id,email);await webhookRequest(f,id);await f.flush();assert.equal(f.rows('SELECT * FROM messages').length,1);assert.equal(f.rows('SELECT * FROM mail_inbound')[0].status,'processed');
}));

test('minimal feedback uses description as summary and ignores removed form fields',()=>withProvider(async(f,p)=>{
 const form=new FormData();for(const [key,value] of Object.entries({project:'demo',email:'user@example.com',body:'希望支持新功能。\n这里是完整描述。',title:'旧客户端标题',kind:'invalid',app_version:'旧版本字段',platform:'旧系统字段'}))form.set(key,value);
 const response=await f.call('/api/tickets',{method:'POST',body:form});assert.equal(response.status,201);const t=f.rows('SELECT * FROM tickets')[0];assert.equal(t.title,'希望支持新功能。 这里是完整描述。');assert.equal(t.body,'希望支持新功能。\n这里是完整描述。');assert.equal(t.kind,'feedback');assert.equal(t.app_version,'');assert.equal(t.platform,'');await f.flush();assert.ok(p.sent.every(x=>!x.body.text.includes('旧客户端标题')));
}));

test('suppress email saves a public answer and status, emits no mail and does not affect later replies',()=>withProvider(async(f,p)=>{
 const {data}=await f.create();await f.flush();const t=f.rows('SELECT * FROM tickets')[0],baseline=p.sent.length;
 const response=await adminChange(f,t.id,{body:'静默保存的公开答复',status:'resolved',suppress_email:true,revision:0});assert.equal(response.status,200);const saved=await response.json();assert.equal(saved.emailQueued,false);assert.equal(saved.emailSuppressed,true);await f.flush();await drainMail(f.env);
 assert.equal(p.sent.length,baseline);assert.equal(f.rows('SELECT * FROM notification_jobs').length,3);
 const view=await (await f.call('/api'+data.url)).json();assert.equal(view.ticket.status,'resolved');assert.match(view.messages.at(-1).body,/静默保存的公开答复/);assert.equal(view.messages.at(-1).role,'admin');
 const normal=await adminChange(f,t.id,{body:'下一次正常通知',status:'resolved',revision:1});assert.equal((await normal.json()).emailQueued,true);await f.flush();assert.equal(p.sent.length,baseline+1);assert.match(p.sent.at(-1).body.text,/下一次正常通知/);
}));
test('suppressing a status-only update never sends it from the cron and rejects non-boolean options',()=>withProvider(async(f,p)=>{
 await f.create();await f.flush();const t=f.rows('SELECT * FROM tickets')[0],before=p.sent.length;
 assert.equal((await adminChange(f,t.id,{status:'closed',suppress_email:'true',revision:0})).status,400);
 const response=await adminChange(f,t.id,{status:'closed',suppress_email:true,revision:0}),saved=await response.json();assert.equal(saved.ticket.status,'closed');assert.equal(saved.emailQueued,false);await f.flush();await drainMail(f.env);assert.equal(p.sent.length,before);
 assert.match(f.rows('SELECT * FROM messages').at(-1).body,/不受理/);
}));
test('a visitor can supplement a closed ticket on the web and reopen it without losing the conversation',()=>withProvider(async(f,p)=>{
 const {data}=await f.create();await f.flush();const t=f.rows('SELECT * FROM tickets')[0];await adminChange(f,t.id,{body:'信息不足，等待补充',status:'closed',suppress_email:true,revision:0});
 const form=new FormData();form.set('body','补充复现步骤和版本');assert.equal((await f.call('/api'+data.url+'/reply',{method:'POST',body:form})).status,200);await f.flush();
 const view=await (await f.call('/api'+data.url)).json();assert.equal(view.ticket.status,'new');assert.match(view.messages.at(-1).body,/不受理 → 待审核/);assert.equal(view.messages.length,2);
 assert.equal(p.sent.at(-1).body.to[0],'admin@example.com');assert.match(p.sent.at(-1).body.text,/当前状态：待审核/);assert.equal(f.rows("SELECT * FROM notification_jobs WHERE channel='wecom' AND status='sent'").length,2);
}));
test('authenticated mail supplements reopen a closed ticket and still notify the administrator',()=>withProvider(async(f,p)=>{
 await f.create();await f.flush();const t=f.rows('SELECT * FROM tickets')[0],to=p.sent.find(x=>x.body.to[0]==='user@example.com').body.reply_to;await adminChange(f,t.id,{status:'closed',suppress_email:true,revision:0});
 const id=crypto.randomUUID();p.received.set(id,incoming(id,to,'user@example.com','邮件补充新线索'));assert.equal((await webhookRequest(f,id)).status,200);await f.flush();assert.equal(f.rows('SELECT * FROM tickets')[0].status,'new');assert.equal(f.rows('SELECT * FROM mail_inbound')[0].status,'processed');assert.match(p.sent.at(-1).body.text,/邮件补充新线索/);assert.match(p.sent.at(-1).body.text,/当前状态：待审核/);
}));
