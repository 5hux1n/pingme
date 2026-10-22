import {validEmail,changeTicket,visitorEvent,eventStatement,jobStatements} from './ticket-events.js';
import {shortTicketToken,validTicketToken,ticketNumber} from './ticket-access.js';
import {rasterMime} from './feedback-files.js';
import {aiRead} from './ai-read.js';
import {aiWrite} from './ai-write.js';
import {threadStatement,mailWebhook,drainMail} from './mail.js';
import { notifyFeedback } from './wecom.js';
import { categories, projectRows, catalogResponse, saveCategory, deleteCategory, projectFields, projectOrder } from './project-catalog.js';
import { withImage, fetchImageSource, saveProject, serveProjectImage } from './project-images.js';
import { readAbout, normalizeAbout, publicAbout, aboutDefaults } from './about-settings.js';
const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), {status, headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff',...headers}});
const err = (s,m) => json({error:m},s);
const enc = new TextEncoder();
const hex = ab => [...new Uint8Array(ab)].map(x=>x.toString(16).padStart(2,'0')).join('');
const hash = async s => hex(await crypto.subtle.digest('SHA-256',enc.encode(s)));
const uuid = () => crypto.randomUUID();
const randomToken = () => [...crypto.getRandomValues(new Uint8Array(32))].map(x=>x.toString(16).padStart(2,'0')).join('');
const ctEqual = (a,b) => {const x=enc.encode(a||''),y=enc.encode(b||'');let d=x.length ^ y.length;for(let i=0;i<Math.max(x.length,y.length);i++) d|=(x[i]||0)^(y[i]||0);return d===0;};
const sign = async (value,key) => {const k=await crypto.subtle.importKey('raw',enc.encode(key),{name:'HMAC',hash:'SHA-256'},false,['sign']);return hex(await crypto.subtle.sign('HMAC',k,enc.encode(value)));};
const cookie = request => (request.headers.get('cookie')||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('pm_session='))?.split('=')[1]||'';
const adminCredentials = env => env.DB.prepare("SELECT password_hash,salt,iterations,session_version FROM admin_credentials WHERE id='admin'").first();
const passwordHash = async (password,salt,iterations=100000) => {
 const key=await crypto.subtle.importKey('raw',enc.encode(password),'PBKDF2',false,['deriveBits']);
 return hex(await crypto.subtle.deriveBits({name:'PBKDF2',salt:Uint8Array.from(salt.match(/../g),x=>parseInt(x,16)),iterations,hash:'SHA-256'},key,256));
};
const sessionValue=(stamp,credentials)=>credentials?.session_version?stamp+':'+credentials.session_version:stamp;
async function passwordMatches(password,env,credentials){if(credentials?.password_hash)return ctEqual(await passwordHash(password,credentials.salt,credentials.iterations),credentials.password_hash);return !!env.ADMIN_PASSWORD&&ctEqual(password,env.ADMIN_PASSWORD);}
async function isAdmin(request,env){if(!env.SESSION_SECRET)return false;const [stamp,sig]=cookie(request).split('.');if(!stamp||!sig||!/^[0-9]+$/.test(stamp)||Number(stamp)<Date.now()||Number(stamp)>Date.now()+8*86400000)return false;const credentials=await adminCredentials(env);return ctEqual(sig,await sign(sessionValue(stamp,credentials),env.SESSION_SECRET));}
const clean = (x,n=5000) => String(x??'').trim().slice(0,n);
const validProjectUrl = value => {if(!value)return true;try{const u=new URL(value);return ['http:','https:'].includes(u.protocol)&&!!u.hostname&&!u.username&&!u.password;}catch{return false;}};
const publicTicket = t => ({id:t.id,number:t.number,project_name:t.project_name,project_slug:t.project_slug,kind:t.kind,title:t.title,body:t.body,app_version:t.app_version,platform:t.platform,status:t.status,created_at:t.created_at,updated_at:t.updated_at});
const fileExt = name => (name.split('.').pop()||'').toLowerCase();
const allowedExt = new Set(['png','jpg','jpeg','webp','gif','heic','mp4','mov','webm','txt','log','crash','ips','json','zip','pdf']);
const allowedTypes = new Set(['image/png','image/jpeg','image/webp','image/gif','image/heic','video/mp4','video/quicktime','video/webm','text/plain','application/json','application/zip','application/x-zip-compressed','application/pdf','application/octet-stream','']);
async function rate(env,request,label,max=12,ttl=3600){
 const ip=request.headers.get('cf-connecting-ip')||'local',key=await hash(label+':'+ip),now=Math.floor(Date.now()/1000);
 const results=await env.DB.batch([
  env.DB.prepare('DELETE FROM rate_limits WHERE bucket=? AND expires_at<?').bind(key,now),
  env.DB.prepare('INSERT INTO rate_limits(bucket,count,expires_at) VALUES(?,1,?) ON CONFLICT(bucket) DO UPDATE SET count=count+1').bind(key,now+ttl),
  env.DB.prepare('SELECT count FROM rate_limits WHERE bucket=?').bind(key)
 ]);
 return results[2].results[0].count<=max;
}
async function messages(env,id){return (await env.DB.prepare('SELECT id,role,body,created_at FROM messages WHERE ticket_id=? ORDER BY created_at,rowid').bind(id).all()).results;}
async function attachments(env,id){return (await env.DB.prepare("SELECT a.id,a.name,a.mime,a.bytes,a.created_at,a.message_id,(m.role='internal') internal FROM attachments a LEFT JOIN messages m ON m.id=a.message_id WHERE a.ticket_id=? ORDER BY a.created_at,a.rowid").bind(id).all()).results;}
async function storeFiles(env,form,ticketId,messageId=null){const files=form.getAll('files').filter(f=>f instanceof File && f.size>0);if(files.length>5)throw new Error('最多上传 5 个附件');for(const file of files){if(file.size>10*1024*1024)throw new Error('单个附件不能超过 10MB');if(!allowedExt.has(fileExt(file.name))||!allowedTypes.has(file.type))throw new Error('不支持的附件格式：'+file.name);}
 for(const file of files){const id=uuid(), key=`${ticketId}/${id}`;await env.FILES.put(key,file.stream(),{httpMetadata:{contentType:'application/octet-stream'}});await env.DB.prepare('INSERT INTO attachments(id,ticket_id,message_id,name,mime,bytes,object_key) VALUES(?,?,?,?,?,?,?)').bind(id,ticketId,messageId,clean(file.name,150),file.type||'application/octet-stream',file.size,key).run();}}
async function getTicket(env,token){if(!validTicketToken(token))return null;return env.DB.prepare('SELECT t.*,p.name project_name,p.slug project_slug FROM tickets t JOIN projects p ON p.id=t.project_id WHERE t.access_hash=?').bind(await hash(token)).first();}
const ticketListFields="t.id,t.number,t.kind,CASE WHEN length(t.title)>200 THEN substr(t.title,1,200)||'…' ELSE t.title END title,t.status,t.created_at,t.updated_at,p.name project_name,p.slug project_slug";
async function adminSnapshot(env){
 const [projects,groups,tickets,about,total,feedbackProjects]=await env.DB.batch([
  env.DB.prepare(`SELECT p.*,COALESCE(c.name,'其他项目') category_name FROM projects p LEFT JOIN project_categories c ON c.id=p.category ORDER BY ${projectOrder}`),
  env.DB.prepare('SELECT id,name,description,sort_order FROM project_categories ORDER BY sort_order,name,id'),
  env.DB.prepare(`SELECT ${ticketListFields} FROM tickets t JOIN projects p ON p.id=t.project_id ORDER BY t.updated_at DESC,t.id DESC LIMIT 50`),
  env.DB.prepare("SELECT value,version FROM site_settings WHERE key='about'"),
  env.DB.prepare('SELECT COUNT(*) total FROM tickets'),
  env.DB.prepare(`SELECT p.slug,p.name FROM projects p LEFT JOIN project_categories c ON c.id=p.category WHERE EXISTS(SELECT 1 FROM tickets t WHERE t.project_id=p.id) ORDER BY ${projectOrder}`)
 ]);
 const config=about.results[0];
 return {feedbackProjects:feedbackProjects.results,ticketTotal:total.results[0].total,projects:projects.results.map(p=>({...p,image_url:withImage(p).image_url})),categories:groups.results,tickets:tickets.results,about:{personal:config?JSON.parse(config.value):structuredClone(aboutDefaults),version:config?.version||0}};
}
function scheduleMail(env,ctx,ticketId=null){const task=drainMail(env,{ticketId}).catch(()=>console.error('邮件队列暂未处理完成，将由定时任务重试'));if(ctx?.waitUntil)ctx.waitUntil(task);else return task;}
async function route(request,env,ctx){const url=new URL(request.url), path=url.pathname,method=request.method;
 if(path==='/api/ai'||path.startsWith('/api/ai/')){if(method==='PATCH'||method==='POST'&&path.endsWith('/reply'))return aiWrite(request,env,rate,(env,id)=>scheduleMail(env,ctx,id));return aiRead(request,env,rate);}
 if(method==='POST'&&path==='/api/mail/webhook'){const response=await mailWebhook(request,env);if(response.ok)scheduleMail(env,ctx);return response;}
 if(!path.startsWith('/api/'))return env.ASSETS.fetch(request);
 if(['GET','HEAD'].includes(method)&&path.startsWith('/api/project-images/'))return serveProjectImage(request,env);
 if(method==='GET'&&path==='/api/catalog')return catalogResponse(request,env);
 if(method==='GET'&&path==='/api/about'){const data=await readAbout(env);return json({personal:publicAbout(data.personal)});}
 if(method==='GET'&&path==='/api/config')return json({turnstileSiteKey:''});
 if(method==='GET'&&path==='/api/projects'){const [projects,groups]=await Promise.all([projectRows(env,'p.visible=1 AND p.enabled=1'),categories(env)]);return json({projects,categories:groups});}
 if(method==='GET'&&/^\/api\/projects\/[a-z0-9-]+$/.test(path)){const slug=path.split('/')[3];const p=await env.DB.prepare(`SELECT ${projectFields},COALESCE(c.name,'其他项目') category_name FROM projects p LEFT JOIN project_categories c ON c.id=p.category WHERE p.slug=? AND p.enabled=1`).bind(slug).first();return p?json({project:withImage(p)}):err(404,'项目不存在或已关闭');}
 if(path.startsWith('/api/admin/')&&!['GET','HEAD','OPTIONS'].includes(method)&&request.headers.get('origin')!==url.origin)return err(403,'请从本站后台进行操作');
 if(method==='POST'&&path==='/api/admin/login'){
  if(!await rate(env,request,'admin-login',8,900))return err(429,'尝试次数过多，请稍后再试');
  const credentials=await adminCredentials(env);if(!env.SESSION_SECRET||(!env.ADMIN_PASSWORD&&!credentials?.password_hash))return err(503,'管理员尚未配置');
  const body=await request.json().catch(()=>({}));const password=String(body.password??'');if(password.length>200||!await passwordMatches(password,env,credentials))return err(401,'密码错误');
  const stamp=String(Date.now()+86400000),sig=await sign(sessionValue(stamp,credentials),env.SESSION_SECRET);return json({ok:true,snapshot:await adminSnapshot(env)},200,{'set-cookie':`pm_session=${stamp}.${sig}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=86400`});
 }
 if(method==='POST'&&path==='/api/admin/logout')return json({ok:true},200,{'set-cookie':'pm_session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0'});
 if(method==='GET'&&path==='/api/admin/me'){const authenticated=await isAdmin(request,env);return json({authenticated,...(authenticated?{snapshot:await adminSnapshot(env)}:{})});}
 if(method==='POST'&&path==='/api/tickets'){
  if(!await rate(env,request,'feedback',8,3600))return err(429,'提交过于频繁，请稍后再试');
  if(Number(request.headers.get('content-length')||0)>53*1024*1024)return err(413,'附件总大小超出限制');
  const form=await request.formData().catch(()=>null);if(!form)return err(400,'表单格式错误');
  const project=await env.DB.prepare('SELECT id,slug,name FROM projects WHERE slug=? AND enabled=1').bind(clean(form.get('project'),50)).first();if(!project)return err(404,'项目不存在');
  const body=String(form.get('body')??'').replace(/\r\n?/g,'\n').trim();if(!body)return err(400,'请填写反馈描述');
  const kind='feedback',summary=Array.from(body.slice(0,240).replace(/\s+/g,' ')),title=summary.slice(0,80).join('')+(summary.length>80||body.length>240?'…':'');
  const email=String(form.get('email')??'').trim().toLowerCase();if(!validEmail(email))return err(400,'请填写有效的邮箱地址，用于接收反馈回执和后续回复');
  const fs=form.getAll('files').filter(f=>f instanceof File&&f.size>0);if(fs.length>5||fs.some(f=>f.size>10*1024*1024||!allowedExt.has(fileExt(f.name))||!allowedTypes.has(f.type)))return err(400,'附件最多 5 个，每个不超过 10MB，仅允许常见图片、视频、日志、ZIP 和 PDF');
  const id=uuid();let token,number;
  const event={id:uuid(),ticket_id:id,kind:'created',body,status:'new',previous_status:'new',role:'visitor'};
  for(let attempt=0;attempt<5;attempt++){token=shortTicketToken();number=ticketNumber();try{await env.DB.batch([
   env.DB.prepare('INSERT INTO tickets(id,number,project_id,kind,title,body,app_version,platform,contact,email,access_hash,last_event_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').bind(id,number,project.id,kind,title,body,'','','',email,await hash(token),event.id),
   await threadStatement(env,id,token),eventStatement(env,event),...jobStatements(env,event.id,{visitor:true,admin:true,wecom:true,waitingFiles:true})
  ]);break;}catch(error){if(attempt===4||!/UNIQUE constraint failed: tickets\.(?:access_hash|number)/.test(String(error.cause?.message||error.message)))throw error;}}
  let warning='';try{await storeFiles(env,form,id);}catch{warning='反馈已保存，但部分附件上传失败，请在反馈详情中补充。';}
  await env.DB.prepare("UPDATE notification_jobs SET status='pending',updated_at=CURRENT_TIMESTAMP WHERE event_id=? AND status='waiting_files'").bind(event.id).run();
  scheduleMail(env,ctx,id);
  return json({ok:true,number,url:`/t/${token}`,...(warning?{warning}:{})},201);
 }
 const publicMatch=path.match(/^\/api\/t\/([A-Za-z0-9]{12}|[a-f0-9]{64})(?:\/(reply))?$/);
 if(publicMatch){if(!await rate(env,request,'ticket-access',120,900))return err(429,'访问过于频繁，请稍后再试');const token=publicMatch[1],t=await getTicket(env,token);if(!t)return err(404,'反馈不存在');if(method==='GET'&&!publicMatch[2])return json({ticket:publicTicket(t),messages:(await messages(env,t.id)).filter(m=>m.role!=='internal'),attachments:(await attachments(env,t.id)).filter(f=>!f.message_id||!f.internal)});
  if(method==='POST'&&publicMatch[2]){if(!await rate(env,request,'reply',15,3600))return err(429,'回复过于频繁');const form=await request.formData().catch(()=>null);if(!form)return err(400,'格式错误');const body=String(form.get('body')??'').trim();if(!body && !form.getAll('files').some(f=>f instanceof File&&f.size))return err(400,'请输入回复或添加附件');const fs=form.getAll('files').filter(f=>f instanceof File&&f.size>0);if(fs.length>5||fs.some(f=>f.size>10*1024*1024||!allowedExt.has(fileExt(f.name))||!allowedTypes.has(f.type)))return err(400,'附件不符合要求');const mid=uuid();await storeFiles(env,form,t.id,mid);await visitorEvent(env,t,body,{eventId:mid});scheduleMail(env,ctx,t.id);return json({ok:true});}}
 const attachmentMatch=path.match(/^\/api\/attachments\/([a-f0-9-]{36})$/);
 if(method==='GET'&&attachmentMatch){const file=await env.DB.prepare('SELECT * FROM attachments WHERE id=?').bind(attachmentMatch[1]).first();if(!file)return err(404,'文件不存在');const tok=url.searchParams.get('token');if(!await isAdmin(request,env)){const t=await getTicket(env,tok);if(!t||t.id!==file.ticket_id)return err(403,'无权访问');if(file.message_id&&(await env.DB.prepare('SELECT role FROM messages WHERE id=?').bind(file.message_id).first())?.role==='internal')return err(403,'无权访问');}const obj=await env.FILES.get(file.object_key);if(!obj)return err(404,'附件已丢失');if(url.searchParams.get('inline')==='1'){if(file.bytes>10*1024*1024)return err(413,'图片过大');const bytes=new Uint8Array(await new Response(obj.body).arrayBuffer()),mime=rasterMime(bytes);if(!mime)return err(415,'该文件不支持图片预览，请下载查看');return new Response(bytes,{headers:{'content-type':mime,'content-disposition':'inline','x-content-type-options':'nosniff','cache-control':'private, no-store','referrer-policy':'no-referrer','content-security-policy':"default-src 'none'; sandbox"}});}const safeName=file.name.replace(/[\r\n"\\]/g,'_');return new Response(obj.body,{headers:{'content-type':'application/octet-stream','content-disposition':`attachment; filename="${safeName.replace(/[^\x20-\x7e]/g,'_')}"; filename*=UTF-8''${encodeURIComponent(file.name)}`,'x-content-type-options':'nosniff','cache-control':'private, no-store'}});}
 if(!path.startsWith('/api/admin/'))return err(404,'接口不存在');
 if(!await isAdmin(request,env))return err(401,'请先登录');
 const mailRetry=path.match(/^\/api\/admin\/mail\/jobs\/([^/]+)\/retry$/);
 if(method==='POST'&&mailRetry){
  if(!await rate(env,request,'mail-retry',20,3600))return err(429,'重试过于频繁，请稍后再试');
  const id=decodeURIComponent(mailRetry[1]),job=await env.DB.prepare('SELECT j.*,e.created_at event_created_at FROM notification_jobs j JOIN ticket_events e ON e.id=j.event_id WHERE j.id=?').bind(id).first();if(!job)return err(404,'通知记录不存在');
  if(!['failed','retry'].includes(job.status))return err(409,'该通知不需要重试');
  if(job.provider_id)return err(409,'邮件服务已接收这条通知，请先核对投递结果，不重复发送');
  if(job.event_created_at<new Date(Date.now()-23*3600000).toISOString().replace('T',' ').slice(0,19))return err(409,'这条通知已超出服务的去重时限，请先核对收件箱，避免重复发送');
  await env.DB.prepare("UPDATE notification_jobs SET status='pending',attempts=0,next_attempt=0,error='',updated_at=CURRENT_TIMESTAMP WHERE id=? AND status IN ('failed','retry')").bind(id).run();scheduleMail(env,ctx);return json({ok:true});
 }
 if(method==='GET'&&path==='/api/admin/mail'){return json({configured:!!env.RESEND_API_KEY,receiving:!!env.RESEND_WEBHOOK_SECRET,adminConfigured:!!env.MAIL_ADMIN_TO,inbound:(await env.DB.prepare("SELECT id,email_id,status,error,ticket_id,created_at FROM mail_inbound WHERE status IN ('failed','rejected','unmatched','retry') ORDER BY created_at DESC LIMIT 30").all()).results});}
 if(method==='GET'&&path==='/api/admin/about')return json(await readAbout(env));
 if(method==='PUT'&&path==='/api/admin/about'){
  if(request.headers.get('origin')!==url.origin)return err(403,'请从本站后台保存配置');
  const body=await request.json().catch(()=>null);if(!body||!Number.isSafeInteger(body.version)||body.version<0)return err(400,'配置版本不正确，请刷新后重试');
  let personal;try{personal=normalizeAbout(body.personal);}catch(e){return err(400,e.message);}
  const value=JSON.stringify(personal);
  const saved=body.version===0?await env.DB.prepare("INSERT OR IGNORE INTO site_settings(key,value,version) VALUES('about',?,1)").bind(value).run():await env.DB.prepare("UPDATE site_settings SET value=?,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE key='about' AND version=?").bind(value,body.version).run();
  if((saved.meta?.changes??saved.changes)===0)return err(409,'配置已被其他页面修改，请重新加载后再保存');
  return json({ok:true,personal,version:body.version+1});
 }
 if(method==='POST'&&path==='/api/admin/password'){
  if(!await rate(env,request,'admin-password',5,900))return err(429,'尝试次数过多，请稍后再试');
  const body=await request.json().catch(()=>({}));const current=String(body.currentPassword??''),next=String(body.newPassword??''),confirm=String(body.confirmPassword??'');
  if(!next.length)return err(400,'请输入新密码');if(next.length>128)return err(400,'新密码不能超过 128 个字符');if(next!==confirm)return err(400,'两次输入的新密码不一致');if(current.length>200)return err(400,'当前密码无效');
  const credentials=await adminCredentials(env);if(!await passwordMatches(current,env,credentials))return err(401,'当前密码错误');if(ctEqual(current,next))return err(400,'新密码不能与当前密码相同');
  const salt=randomToken(),sessionVersion=randomToken(),iterations=100000,digest=await passwordHash(next,salt,iterations);
  const saved=await env.DB.prepare("INSERT INTO admin_credentials(id,password_hash,salt,iterations,session_version,updated_at) VALUES('admin',?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(id) DO UPDATE SET password_hash=excluded.password_hash,salt=excluded.salt,iterations=excluded.iterations,session_version=excluded.session_version,updated_at=excluded.updated_at WHERE admin_credentials.session_version=?").bind(digest,salt,iterations,sessionVersion,credentials?.session_version||'').run();
  if((saved.meta?.changes??saved.changes)===0)return err(409,'密码已发生变化，请重新登录');
  return json({ok:true},200,{'set-cookie':'pm_session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0'});
 }
 if(method==='POST'&&path==='/api/admin/project-image-source'){
  if(request.headers.get('origin')!==url.origin)return err(403,'请从本站后台获取图片');
  if(!await rate(env,request,'project-image',30,3600))return err(429,'图片操作过于频繁，请稍后再试');
  const body=await request.json().catch(()=>({}));try{const image=await fetchImageSource(body.url);return new Response(image.bytes,{headers:{'content-type':image.type,'cache-control':'no-store','x-content-type-options':'nosniff','content-security-policy':"default-src 'none'; sandbox"}});}catch(e){return err(400,e.name==='TimeoutError'?'图片下载超时，请换个地址重试':e.message);}
 }
 if(method==='GET'&&path==='/api/admin/categories')return json({categories:await categories(env)});
 const categoryMatch=path.match(/^\/api\/admin\/categories\/([a-z0-9-]+)$/);
 if(method==='POST'&&path==='/api/admin/categories'||['PATCH','DELETE'].includes(method)&&categoryMatch){const result=method==='DELETE'?await deleteCategory(request,env,categoryMatch[1]):await saveCategory(request,env,categoryMatch?.[1]??null);return result.error?err(result.status,result.error):json(result);}
 if(method==='GET'&&path==='/api/admin/projects'){const rows=(await env.DB.prepare(`SELECT p.*,COALESCE(c.name,'其他项目') category_name FROM projects p LEFT JOIN project_categories c ON c.id=p.category ORDER BY ${projectOrder}`).all()).results;return json({projects:rows.map(p=>({...p,image_url:withImage(p).image_url}))});}
 const projectMatch=path.match(/^\/api\/admin\/projects\/([a-z0-9-]+)$/);
 if(method==='POST'&&path==='/api/admin/projects'||method==='PATCH'&&projectMatch){const result=await saveProject(request,env,projectMatch?.[1]??null);return result.error?err(result.status,result.error):json(result,method==='POST'?201:200);}
 if(method==='GET'&&path==='/api/admin/tickets'){
  const status=clean(url.searchParams.get('status'),20),project=clean(url.searchParams.get('project'),50),q=clean(url.searchParams.get('q'),100);
  const page=Math.max(1,Math.floor(Number(url.searchParams.get('page'))||1)),limit=Math.min(100,Math.max(1,Math.floor(Number(url.searchParams.get('limit'))||50)));
  const where="(?='' OR t.status=?) AND (?='' OR p.slug=?) AND (?='' OR instr(lower(t.title),lower(?))>0 OR instr(lower(t.number),lower(?))>0 OR instr(lower(t.body),lower(?))>0)",params=[status,status,project,project,q,q,q,q];
  const [rows,count,feedbackProjects]=await env.DB.batch([
   env.DB.prepare(`SELECT ${ticketListFields} FROM tickets t JOIN projects p ON p.id=t.project_id WHERE ${where} ORDER BY t.updated_at DESC,t.id DESC LIMIT ? OFFSET ?`).bind(...params,limit,(page-1)*limit),
   env.DB.prepare(`SELECT COUNT(*) total FROM tickets t JOIN projects p ON p.id=t.project_id WHERE ${where}`).bind(...params),
   env.DB.prepare(`SELECT p.slug,p.name FROM projects p LEFT JOIN project_categories c ON c.id=p.category WHERE EXISTS(SELECT 1 FROM tickets t WHERE t.project_id=p.id) ORDER BY ${projectOrder}`)
  ]);
  return json({tickets:rows.results,total:count.results[0].total,page,limit,feedbackProjects:feedbackProjects.results});
 }
 const adt=path.match(/^\/api\/admin\/tickets\/([a-f0-9-]{36})(?:\/(reply|notify))?$/);
 if(adt){const t=await env.DB.prepare('SELECT t.*,p.name project_name,p.slug project_slug FROM tickets t JOIN projects p ON p.id=t.project_id WHERE t.id=?').bind(adt[1]).first();if(!t)return err(404,'反馈不存在');if(method==='GET'&&!adt[2]){const [messageRows,fileRows,notification]=await env.DB.batch([
  env.DB.prepare('SELECT id,role,body,created_at FROM messages WHERE ticket_id=? ORDER BY created_at,rowid').bind(t.id),
  env.DB.prepare('SELECT id,name,mime,bytes,message_id,created_at FROM attachments WHERE ticket_id=? ORDER BY created_at').bind(t.id),
  env.DB.prepare('SELECT status,error,updated_at FROM feedback_notifications WHERE ticket_id=?').bind(t.id)
 ]);return json({ticket:{...publicTicket(t),contact:t.contact,email:t.email,revision:t.revision},messages:messageRows.results,attachments:fileRows.results,notification:notification.results[0]||null,mail:(await env.DB.prepare("SELECT j.id,j.channel,j.audience,j.status,j.error,j.updated_at,(j.provider_id='' AND j.status IN ('failed','retry')) retryable FROM notification_jobs j JOIN ticket_events e ON e.id=j.event_id WHERE e.ticket_id=? ORDER BY e.created_at DESC,j.id LIMIT 12").bind(t.id).all()).results});}
 if(method==='POST'&&adt[2]==='notify'){if(!await rate(env,request,'notify',10,3600))return err(429,'推送过于频繁，请稍后再试');await notifyFeedback(env,{...t,project_name:t.project_name},url.origin);return json({ok:true,notification:await env.DB.prepare('SELECT status,error,updated_at FROM feedback_notifications WHERE ticket_id=?').bind(t.id).first()});}
 if((method==='PATCH'&&!adt[2])||(method==='POST'&&adt[2]==='reply')){
  const b=await request.json().catch(()=>({})),body=String(b.body??'').trim();
  if(b.suppress_email!==undefined&&typeof b.suppress_email!=='boolean')return err(400,'邮件通知选项无效');
  if(b.revision!==undefined&&(!Number.isSafeInteger(b.revision)||b.revision<0))return err(400,'反馈版本无效');
  let saved;try{saved=await changeTicket(env,t,{body,status:b.status??t.status,internal:b.internal===true,suppressEmail:b.suppress_email===true,revision:b.revision??t.revision});}catch(error){return err(error.status||500,error.message);}
  if(saved.changed&&b.suppress_email!==true)scheduleMail(env,ctx,t.id);
  return json({ok:true,changed:saved.changed,emailSuppressed:!!(saved.changed&&b.suppress_email===true),emailQueued:!!(saved.changed&&b.suppress_email!==true&&(!b.internal||(b.status&&b.status!==t.status))&&validEmail(t.email)),ticket:{...publicTicket(t),...(saved.ticket||{}),contact:t.contact,email:t.email,revision:saved.ticket?.revision??t.revision},messages:await messages(env,t.id)});
 }
 }


 return err(404,'接口不存在');
}
export default {async scheduled(event,env,ctx){ctx.waitUntil(drainMail(env));},async fetch(request,env,ctx){try {return await route(request,env,ctx);}catch(e){console.error(e);return err(500,'服务器暂时无法处理请求');}}};
