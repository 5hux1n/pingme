import {renderFeedbackMail} from './mail-template.js';
import {STATUS,validEmail,changeTicket,visitorEvent} from './ticket-events.js';
import {notifyFeedback,sendConversationNotice} from './wecom.js';
const enc=new TextEncoder(),hex=bytes=>[...new Uint8Array(bytes)].map(n=>n.toString(16).padStart(2,'0')).join('');
const bytes64=value=>Uint8Array.from(atob(value),c=>c.charCodeAt(0));
const base64=bytes=>btoa(String.fromCharCode(...new Uint8Array(bytes)));
const hash=async value=>hex(await crypto.subtle.digest('SHA-256',enc.encode(value)));
const equal=(a,b)=>{let diff=a.length^b.length;for(let i=0;i<Math.max(a.length,b.length);i++)diff|=(a.charCodeAt(i)||0)^(b.charCodeAt(i)||0);return diff===0;};
async function hmac(value,secret){const key=await crypto.subtle.importKey('raw',typeof secret==='string'?enc.encode(secret):secret,{name:'HMAC',hash:'SHA-256'},false,['sign']);return crypto.subtle.sign('HMAC',key,enc.encode(value));}
async function replyKey(env,id,role){return hex(await hmac('reply:'+role+':'+id,env.MAIL_SIGNING_SECRET||env.SESSION_SECRET)).slice(0,40);}
async function cipherKey(env){return crypto.subtle.importKey('raw',await crypto.subtle.digest('SHA-256',enc.encode('mail-access:'+ (env.MAIL_SIGNING_SECRET||env.SESSION_SECRET))),'AES-GCM',false,['encrypt','decrypt']);}
async function seal(env,token){if(!token)return '';const iv=crypto.getRandomValues(new Uint8Array(12));return base64(iv)+'.'+base64(await crypto.subtle.encrypt({name:'AES-GCM',iv},await cipherKey(env),enc.encode(token)));}
async function unseal(env,value){if(!value)return '';const [iv,data]=value.split('.');return new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes64(iv)},await cipherKey(env),bytes64(data)));}
export async function threadStatement(env,id,token=''){return env.DB.prepare('INSERT OR IGNORE INTO mail_threads(ticket_id,visitor_key,admin_key,access_token) VALUES(?,?,?,?)').bind(id,await hash(await replyKey(env,id,'visitor')),await hash(await replyKey(env,id,'admin')),await seal(env,token));}
export const mailbox=value=>String(value||'').match(/<([^<>]+)>/)?.[1]?.trim().toLowerCase()||String(value||'').trim().toLowerCase();
export const adminAddresses=env=>String(env.MAIL_ADMIN_TO||'').split(',').map(mailbox).filter(validEmail);
function replyAddress(env,id,role){return replyKey(env,id,role).then(key=>'feedback+'+(role==='admin'?'a':'u')+'_'+key+'@'+(env.MAIL_DOMAIN||'pingme.pm'));}
let nextResendSlot=0;
export async function resend(env,path,options={}){
 if(!env.RESEND_API_KEY)throw Error('邮件服务尚未配置');
 const slot=Math.max(Date.now(),nextResendSlot);nextResendSlot=slot+600;if(slot>Date.now())await new Promise(resolve=>setTimeout(resolve,slot-Date.now()));
 let response;try{response=await fetch('https://api.resend.com'+path,{...options,headers:{Authorization:'Bearer '+env.RESEND_API_KEY,'Content-Type':'application/json',...options.headers},signal:AbortSignal.timeout(15000)});}catch{throw Error('邮件服务暂时未返回回执，将自动重试');}
 const data=await response.json().catch(()=>({}));if(!response.ok){const e=Error('邮件服务请求失败（HTTP '+response.status+'；'+String(data.name||'unknown')+'）');e.permanent=[400,401,403,404,413,422].includes(response.status);throw e;}return data;
}
export async function emailContent(env,t,event,audience){
 const admin=audience==='admin',thread=await env.DB.prepare('SELECT * FROM mail_threads WHERE ticket_id=?').bind(t.id).first();
 const parent=thread?.[admin?'admin_message_id':'visitor_message_id'];
 const token=admin?'':await unseal(env,thread?.access_token),link=new URL(admin?'/admin#inbox/'+t.id:token?'/t/'+token:'/'+t.project_slug,env.PUBLIC_SITE_URL).href;
 const heading=event.kind==='created'?(admin?'收到新反馈':'反馈已提交'):event.kind==='status'?'反馈状态更新':admin?'用户补充了反馈':'开发者回复了反馈';
 const original=event.body||'',body=original.slice(0,18000)+(original.length>18000?'\n…（内容较长，请通过查看链接阅读完整记录）':''),status=STATUS[event.status]||event.status;
 const files=(await env.DB.prepare('SELECT id,name FROM attachments WHERE ticket_id=? AND (message_id=? OR (?=\'created\' AND message_id IS NULL))').bind(t.id,event.id,event.kind).all()).results;
 const attachments=files.map(f=>({name:f.name,url:new URL('/api/attachments/'+f.id+(token?'?token='+token:''),env.PUBLIC_SITE_URL).href}));
 const content=renderFeedbackMail({heading,projectName:t.project_name,number:t.number,status,previousStatus:STATUS[event.previous_status]||event.previous_status,statusCode:event.status,body,attachments,link,admin,userEmail:admin?t.email:''});
 return {from:env.MAIL_FROM||'PingMe <feedback@pingme.pm>',to:admin?adminAddresses(env):[t.email],reply_to:await replyAddress(env,t.id,audience),...content,headers:{'Auto-Submitted':'auto-generated','X-Auto-Response-Suppress':'All',...(/^<[^<>\s]{1,250}>$/.test(parent||'')?{'In-Reply-To':parent,'References':parent}:{})}};
}
export async function verifyWebhook(body,headers,secret,now=Date.now()){
 if(!secret)return false;const id=headers.get('svix-id')||'',stamp=headers.get('svix-timestamp')||'';if(!id||!/^\d+$/.test(stamp)||Math.abs(now/1000-Number(stamp))>300)return false;
 try{const signature=base64(await hmac(id+'.'+stamp+'.'+body,bytes64(secret.replace(/^whsec_/,''))));return (headers.get('svix-signature')||'').split(' ').some(value=>value.startsWith('v1,')&&equal(value.slice(3),signature));}catch{return false;}
}
export async function mailWebhook(request,env){
 if(!env.RESEND_WEBHOOK_SECRET)return new Response('邮件回调尚未配置',{status:503});
 if(Number(request.headers.get('content-length')||0)>1024*1024)return new Response('Payload too large',{status:413});const body=await request.text();if(body.length>1024*1024)return new Response('Payload too large',{status:413});
 if(!await verifyWebhook(body,request.headers,env.RESEND_WEBHOOK_SECRET))return new Response('Invalid signature',{status:401});
 let event;try{event=JSON.parse(body);}catch{return new Response('Invalid payload',{status:400});}
 const id=request.headers.get('svix-id');if(event.type==='email.received'){
  if(!/^[a-f0-9-]{36}$/i.test(event.data?.email_id||''))return new Response('Invalid email ID',{status:400});
  await env.DB.batch([env.DB.prepare('INSERT OR IGNORE INTO mail_inbound(id,email_id) VALUES(?,?)').bind(id,event.data.email_id),env.DB.prepare('INSERT OR IGNORE INTO mail_webhooks(id) VALUES(?)').bind(id)]);
 }else if(['email.delivered','email.bounced','email.complained','email.failed'].includes(event.type)){
  const status={'email.delivered':'delivered','email.bounced':'bounced','email.complained':'complained','email.failed':'failed'}[event.type];
  await env.DB.batch([
   env.DB.prepare('UPDATE notification_jobs SET status=?,error=?,updated_at=CURRENT_TIMESTAMP WHERE provider_id=? AND channel=\'email\' AND NOT EXISTS(SELECT 1 FROM mail_webhooks WHERE id=?) AND (status<>\'delivered\' OR ?<>\'delivered\')').bind(status,status==='delivered'?'':'邮件投递失败，请检查收件邮箱',event.data?.email_id||'',id,status),
   env.DB.prepare('UPDATE mail_threads SET suppressed=1 WHERE ? IN (\'bounced\',\'complained\') AND ticket_id IN (SELECT e.ticket_id FROM ticket_events e JOIN notification_jobs j ON j.event_id=e.id WHERE j.provider_id=? AND j.audience=\'visitor\')').bind(status,event.data?.email_id||''),
   env.DB.prepare('INSERT OR IGNORE INTO mail_webhooks(id) VALUES(?)').bind(id)
  ]);
 }return new Response('ok');
}
export function stripReply(input){
 const lines=String(input||'').replace(/\r\n/g,'\n').split('\n'),result=[];
 for(let i=0;i<lines.length;i++){const line=lines[i];if(/^\s*>/.test(line)||/^\s*(?:On .+wrote:|在.+写道[：:]|发件人[：:]|From:|[-_]{3,}\s*(?:Original Message|原始邮件|转发邮件)|[-_]{5,})/i.test(line))break;if(line.trim()==='--')break;result.push(line);}
 return result.join('\n').trim();
}
export function htmlText(html){return String(html||'').replace(/<(script|style|blockquote)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,'').replace(/<(?:br\s*\/?|\/p|\/div|\/tr|\/li)>/gi,'\n').replace(/<[^>]+>/g,'').replace(/&(?:nbsp|amp|lt|gt|quot|apos);|&#(?:x[0-9a-f]+|\d+);/gi,value=>{const named={'&nbsp;':' ','&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'"};if(named[value.toLowerCase()])return named[value.toLowerCase()];const n=value.toLowerCase().startsWith('&#x')?parseInt(value.slice(3),16):parseInt(value.slice(2),10);return n>=0&&n<=0x10ffff?String.fromCodePoint(n):'';}).trim();}
export function parseAdminReply(body){const match=body.match(/^状态\s*[:：]\s*(待处理|处理中|已解决|已关闭)\s*(?:\n|$)/);return match?{status:Object.keys(STATUS).find(key=>STATUS[key]===match[1]),body:body.slice(match[0].length).trim()}:{body};}
const fileExtensions=new Set(['png','jpg','jpeg','webp','gif','heic','mp4','mov','webm','txt','log','crash','ips','json','zip','pdf']);
async function inboundFiles(env,email,ticketId,mid){
 if(!email.attachments?.length)return {statements:[],note:''};const result=await resend(env,'/emails/receiving/'+email.id+'/attachments'),files=result.data||[],statements=[],skipped=[];
 for(const file of files.slice(0,5)){
  if(file.size>10*1024*1024||!fileExtensions.has(String(file.filename).split('.').pop().toLowerCase())){skipped.push(file.filename);continue;}
  const url=new URL(file.download_url);if(url.protocol!=='https:'||!(url.hostname.endsWith('.resend.com')||url.hostname.endsWith('.cloudfront.net')))throw Error('邮件附件下载地址无效');
  const response=await fetch(url,{signal:AbortSignal.timeout(15000),redirect:'error'});if(!response.ok)throw Error('邮件附件读取失败');const reader=response.body.getReader(),parts=[];let size=0;
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>10*1024*1024){await reader.cancel();throw Error('邮件附件大小超出限制');}parts.push(value);}
  const digest=await hash(email.id+':'+file.id),id=digest.slice(0,8)+'-'+digest.slice(8,12)+'-'+digest.slice(12,16)+'-'+digest.slice(16,20)+'-'+digest.slice(20,32),key=ticketId+'/'+id;
  await env.FILES.put(key,new Blob(parts),{httpMetadata:{contentType:'application/octet-stream'}});
  statements.push(env.DB.prepare('INSERT OR IGNORE INTO attachments(id,ticket_id,message_id,name,mime,bytes,object_key) VALUES(?,?,?,?,?,?,?)').bind(id,ticketId,mid,String(file.filename||'attachment').slice(0,150),file.content_type||'application/octet-stream',size,key));
 }
 if(files.length>5)skipped.push('其余 '+(files.length-5)+' 个附件');return {statements,note:skipped.length?'\n\n[未导入不支持或超限的附件：'+skipped.join('、')+']':''};
}
async function processIncoming(env,row){
 const email=await resend(env,'/emails/receiving/'+row.email_id+'?html_format=cid'),headers=Object.fromEntries(Object.entries(email.headers||{}).map(([k,v])=>[k.toLowerCase(),String(v)]));
 const finish=async(status,error='')=>env.DB.prepare('UPDATE mail_inbound SET status=?,error=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(status,error,row.id).run();
 if((headers['auto-submitted']&&headers['auto-submitted'].toLowerCase()!=='no')||/auto_reply|bulk|list/i.test(headers.precedence||'')||headers['x-autoreply']||headers['x-autorespond'])return finish('ignored','自动回复或群发邮件');
 const targets=[...new Set([...(email.to||[]),...(email.received_for||[])].map(mailbox))],matches=targets.map(address=>address.match(/^feedback\+([ua])_([a-f0-9]{40})@(.+)$/)).filter(m=>m&&m[3]===(env.MAIL_DOMAIN||'pingme.pm'));
 let role,thread;
 if(matches.length===1){const match=matches[0];role=match[1]==='a'?'admin':'visitor';thread=await env.DB.prepare('SELECT * FROM mail_threads WHERE '+(role==='admin'?'admin_key':'visitor_key')+'=?').bind(await hash(match[2])).first();}
 else if(matches.length===0&&targets.includes('feedback@'+(env.MAIL_DOMAIN||'pingme.pm'))){
  const references=[...new Set(((headers['in-reply-to']||'')+' '+(headers.references||'')).match(/<[^<>\s]{1,250}>/g)||[])].slice(-16);
  if(references.length){const matched=(await env.DB.prepare('SELECT DISTINCT ticket_id,audience FROM mail_references WHERE message_id IN ('+references.map(()=>'?').join(',')+')').bind(...references).all()).results;if(matched.length===1){role=matched[0].audience;thread=await env.DB.prepare('SELECT * FROM mail_threads WHERE ticket_id=?').bind(matched[0].ticket_id).first();}}
 }
 if(!thread)return finish('unmatched','没有唯一的反馈回复地址或邮件引用，请直接回复系统通知邮件');
 const t=await env.DB.prepare('SELECT t.*,p.name project_name,p.slug project_slug FROM tickets t JOIN projects p ON p.id=t.project_id WHERE t.id=?').bind(thread.ticket_id).first();
 const from=mailbox(email.from),allowed=role==='admin'?adminAddresses(env):[t.email];
 if(!allowed.includes(from)||!validEmail(from))return finish('rejected','发件人与该回复地址的授权邮箱不符');
 if(!['pass'].includes(email.authentication?.dmarc)&&email.authentication?.dkim!=='pass')return finish('rejected','发件人域名验证未通过，未追加交流记录');
 if(/^<[^<>\s]{1,250}>$/.test(email.message_id||''))await env.DB.prepare('UPDATE mail_threads SET '+(role==='admin'?'admin_message_id':'visitor_message_id')+'=? WHERE ticket_id=?').bind(email.message_id,t.id).run();
 const body=stripReply(email.text||htmlText(email.html)),parsed=role==='admin'?parseAdminReply(body):{body};
 const mid='mail-'+row.email_id;
 if(await env.DB.prepare('SELECT id FROM ticket_events WHERE id=?').bind(mid).first())return finish('processed');
 const files=await inboundFiles(env,email,t.id,mid),content=parsed.body+files.note;
 if(!content&&!files.statements.length&&!parsed.status)return finish('ignored','没有新的回复内容');
 if(files.statements.length)await env.DB.batch(files.statements);
 if(role==='admin')await changeTicket(env,t,{body:content|| (files.statements.length?'[邮件附件]':''),status:parsed.status||t.status,source:'email',eventId:mid});
 else await visitorEvent(env,t,content||'[邮件附件]',{eventId:mid,source:'email'});
 await env.DB.prepare("UPDATE mail_inbound SET status='processed',ticket_id=?,message_id=?,error='',updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(t.id,mid,row.id).run();
}
async function claim(env,table,id){const now=Math.floor(Date.now()/1000),r=await env.DB.prepare(`UPDATE ${table} SET status='sending',attempts=attempts+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND ((status IN ('pending','retry') AND next_attempt<=?) OR (status='sending' AND updated_at<datetime('now','-5 minutes')))` ).bind(id,now).run();return !!(r.meta?.changes??r.changes);}
async function failed(env,table,row,error){const terminal=error.permanent||error.uncertain||row.attempts>=7;await env.DB.prepare(`UPDATE ${table} SET status=?,error=?,next_attempt=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(terminal?'failed':'retry',String(error.message).slice(0,200),Math.floor(Date.now()/1000)+Math.min(3600,30*2**row.attempts),row.id).run();}
export async function drainMail(env,{ticketId=null,limit=8}={}){
 if(!env.DB)return;
 await env.DB.prepare("UPDATE notification_jobs SET status='pending',updated_at=CURRENT_TIMESTAMP WHERE status='waiting_files' AND updated_at<datetime('now','-10 minutes')").run();
 const incoming=(await env.DB.prepare("SELECT * FROM mail_inbound WHERE (status IN ('pending','retry') AND next_attempt<=unixepoch()) OR (status='sending' AND updated_at<datetime('now','-5 minutes')) ORDER BY created_at LIMIT 4").all()).results;
 for(const row of incoming){if(!await claim(env,'mail_inbound',row.id))continue;try{await processIncoming(env,row);}catch(error){await failed(env,'mail_inbound',row,error);}}
 const jobs=(await env.DB.prepare("SELECT j.* FROM notification_jobs j JOIN ticket_events e ON e.id=j.event_id WHERE (? IS NULL OR e.ticket_id=?) AND ((j.status IN ('pending','retry') AND j.next_attempt<=unixepoch()) OR (j.status='sending' AND j.updated_at<datetime('now','-5 minutes'))) ORDER BY e.created_at,j.id LIMIT ?").bind(ticketId,ticketId,limit).all()).results;
 for(const job of jobs){if(!await claim(env,'notification_jobs',job.id))continue;try{
  const event=await env.DB.prepare('SELECT * FROM ticket_events WHERE id=?').bind(job.event_id).first(),t=await env.DB.prepare('SELECT t.*,p.name project_name,p.slug project_slug FROM tickets t JOIN projects p ON p.id=t.project_id WHERE t.id=?').bind(event.ticket_id).first();
  let provider='';if(job.channel==='wecom'){
   if(event.kind==='created'){await notifyFeedback(env,t,env.PUBLIC_SITE_URL);const receipt=await env.DB.prepare('SELECT status,error,message_id FROM feedback_notifications WHERE ticket_id=?').bind(t.id).first();if(receipt?.status!=='sent')throw Object.assign(Error(receipt?.error||'企业微信推送尚未成功'),{permanent:receipt?.status==='unknown'});provider=receipt.message_id;}
   else provider=await sendConversationNotice(env,t,event);
  }else{
   if(job.audience==='visitor'&&!validEmail(t.email)){await env.DB.prepare("UPDATE notification_jobs SET status='skipped',error='旧反馈没有可用邮箱' WHERE id=?").bind(job.id).run();continue;}
   if(job.audience==='visitor'&&(await env.DB.prepare('SELECT suppressed FROM mail_threads WHERE ticket_id=?').bind(t.id).first())?.suppressed)throw Object.assign(Error('用户邮箱退信或拒收，邮件通知已暂停'),{permanent:true});
   if(job.audience==='admin'&&!adminAddresses(env).length)throw Error('管理员收件邮箱尚未配置');
   if(!await env.DB.prepare('SELECT ticket_id FROM mail_threads WHERE ticket_id=?').bind(t.id).first())await (await threadStatement(env,t.id)).run();
   const content=await emailContent(env,t,event,job.audience),result=await resend(env,'/emails',{method:'POST',headers:{'Idempotency-Key':'pingme/'+job.id},body:JSON.stringify(content)});provider=result.id;
   await env.DB.prepare('UPDATE notification_jobs SET provider_id=? WHERE id=?').bind(provider,job.id).run();
   try{const metadata=result.message_id?result:await resend(env,'/emails/'+provider);if(/^<[^<>\s]{1,250}>$/.test(metadata.message_id||''))await env.DB.batch([env.DB.prepare('UPDATE mail_threads SET '+(job.audience==='admin'?'admin_message_id':'visitor_message_id')+'=? WHERE ticket_id=?').bind(metadata.message_id,t.id),env.DB.prepare('INSERT OR IGNORE INTO mail_references(message_id,ticket_id,audience) VALUES(?,?,?)').bind(metadata.message_id,t.id,job.audience)]);}catch{/* Sending succeeded; a metadata lookup must not trigger a resend. */}
  }
  await env.DB.prepare("UPDATE notification_jobs SET status='sent',provider_id=?,error='',updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='sending'").bind(provider||'',job.id).run();
 }catch(error){await failed(env,'notification_jobs',job,error);}}
 await env.DB.prepare("DELETE FROM mail_webhooks WHERE created_at<datetime('now','-30 days')").run();
}
