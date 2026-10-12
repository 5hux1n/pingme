import { readAbout, normalizeAbout, publicAbout } from './about-settings.js';
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
async function rate(env, request, label, max = 12, ttl = 3600){const ip=request.headers.get('cf-connecting-ip')||'local';const key=await hash(label+':'+ip);const now=Math.floor(Date.now()/1000);await env.DB.prepare('DELETE FROM rate_limits WHERE bucket=? AND expires_at<?').bind(key,now).run();await env.DB.prepare('INSERT INTO rate_limits(bucket,count,expires_at) VALUES(?,1,?) ON CONFLICT(bucket) DO UPDATE SET count=count+1').bind(key,now+ttl).run();const r=await env.DB.prepare('SELECT count FROM rate_limits WHERE bucket=?').bind(key).first();return r.count<=max;}
async function human(request,env,token){if(env.TURNSTILE_REQUIRED!=='true')return true;if(!env.TURNSTILE_SECRET||!token)return false;const body=new FormData();body.set('secret',env.TURNSTILE_SECRET);body.set('response',token);body.set('remoteip',request.headers.get('cf-connecting-ip')||'');try {const r=await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify',{method:'POST',body});return !!(await r.json()).success;}catch{return false;}}
async function messages(env,id){return (await env.DB.prepare('SELECT id,role,body,created_at FROM messages WHERE ticket_id=? ORDER BY created_at').bind(id).all()).results;}
async function attachments(env,id){return (await env.DB.prepare('SELECT id,name,mime,bytes,created_at FROM attachments WHERE ticket_id=? ORDER BY created_at').bind(id).all()).results;}
async function storeFiles(env,form,ticketId,messageId=null){const files=form.getAll('files').filter(f=>f instanceof File && f.size>0);if(files.length>5)throw new Error('最多上传 5 个附件');for(const file of files){if(file.size>10*1024*1024)throw new Error('单个附件不能超过 10MB');if(!allowedExt.has(fileExt(file.name))||!allowedTypes.has(file.type))throw new Error('不支持的附件格式：'+file.name);}
 for(const file of files){const id=uuid(), key=`${ticketId}/${id}`;await env.FILES.put(key,file.stream(),{httpMetadata:{contentType:'application/octet-stream'}});await env.DB.prepare('INSERT INTO attachments(id,ticket_id,message_id,name,mime,bytes,object_key) VALUES(?,?,?,?,?,?,?)').bind(id,ticketId,messageId,clean(file.name,150),file.type||'application/octet-stream',file.size,key).run();}}
async function getTicket(env,token){if(!/^[a-f0-9]{64}$/.test(token||''))return null;return env.DB.prepare('SELECT t.*,p.name project_name,p.slug project_slug FROM tickets t JOIN projects p ON p.id=t.project_id WHERE t.access_hash=?').bind(await hash(token)).first();}
async function route(request,env){const url=new URL(request.url), path=url.pathname,method=request.method;
 if(!path.startsWith('/api/'))return env.ASSETS.fetch(request);
 if(method==='GET'&&path==='/api/about'){const data=await readAbout(env);return json({personal:publicAbout(data.personal)});}
 if(method==='GET'&&path==='/api/config')return json({turnstileSiteKey:env.TURNSTILE_REQUIRED==='true'?(env.TURNSTILE_SITE_KEY||''):''});
 if(method==='GET'&&path==='/api/projects'){const rows=(await env.DB.prepare('SELECT slug,name,description,official_url,color,icon FROM projects WHERE visible=1 AND enabled=1 ORDER BY created_at').all()).results;return json({projects:rows});}
 if(method==='GET'&&/^\/api\/projects\/[a-z0-9-]+$/.test(path)){const slug=path.split('/')[3];const p=await env.DB.prepare('SELECT slug,name,description,official_url,color,icon FROM projects WHERE slug=? AND enabled=1').bind(slug).first();return p?json({project:p}):err(404,'项目不存在或已关闭');}
 if(method==='POST'&&path==='/api/admin/login'){
  if(!await rate(env,request,'admin-login',8,900))return err(429,'尝试次数过多，请稍后再试');
  const credentials=await adminCredentials(env);if(!env.SESSION_SECRET||(!env.ADMIN_PASSWORD&&!credentials?.password_hash))return err(503,'管理员尚未配置');
  const body=await request.json().catch(()=>({}));const password=String(body.password??'');if(password.length>200||!await passwordMatches(password,env,credentials))return err(401,'密码错误');
  const stamp=String(Date.now()+86400000),sig=await sign(sessionValue(stamp,credentials),env.SESSION_SECRET);return json({ok:true},200,{'set-cookie':`pm_session=${stamp}.${sig}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=86400`});
 }
 if(method==='POST'&&path==='/api/admin/logout')return json({ok:true},200,{'set-cookie':'pm_session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0'});
 if(method==='GET'&&path==='/api/admin/me')return json({authenticated:await isAdmin(request,env)});
 if(method==='POST'&&path==='/api/tickets'){
  if(!await rate(env,request,'feedback',8,3600))return err(429,'提交过于频繁，请稍后再试');
  if(Number(request.headers.get('content-length')||0)>53*1024*1024)return err(413,'附件总大小超出限制');
  const form=await request.formData().catch(()=>null);if(!form)return err(400,'表单格式错误');if(!await human(request,env,clean(form.get('cf-turnstile-response'),3000)))return err(403,'请完成人机验证');
  const project=await env.DB.prepare('SELECT id,slug,name FROM projects WHERE slug=? AND enabled=1').bind(clean(form.get('project'),50)).first();if(!project)return err(404,'项目不存在');
  const kind=clean(form.get('kind'),30),title=clean(form.get('title'),120),body=clean(form.get('body'),8000);if(!['bug','unavailable','update','suggestion','idea','question','other'].includes(kind)||title.length<3||body.length<5)return err(400,'请填写完整的反馈类型、标题和描述');
  const fs=form.getAll('files').filter(f=>f instanceof File&&f.size>0);if(fs.length>5||fs.some(f=>f.size>10*1024*1024||!allowedExt.has(fileExt(f.name))||!allowedTypes.has(f.type)))return err(400,'附件最多 5 个，每个不超过 10MB，仅允许常见图片、视频、日志、ZIP 和 PDF');
  const id=uuid(),token=randomToken(),number='PM-'+new Date().toISOString().slice(0,10).replaceAll('-','')+'-'+id.slice(0,6).toUpperCase();
  await env.DB.prepare('INSERT INTO tickets(id,number,project_id,kind,title,body,app_version,platform,contact,access_hash) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(id,number,project.id,kind,title,body,clean(form.get('app_version'),80),clean(form.get('platform'),80),clean(form.get('contact'),200),await hash(token)).run();
  try {await storeFiles(env,form,id);} catch(e){return err(500,'反馈已创建，但附件上传失败；请在反馈详情中补充附件');}
  return json({ok:true,number,url:`/t/${token}`},201);
 }
 const publicMatch=path.match(/^\/api\/t\/([a-f0-9]{64})(?:\/(reply))?$/);
 if(publicMatch){const token=publicMatch[1],t=await getTicket(env,token);if(!t)return err(404,'反馈不存在');if(method==='GET'&&!publicMatch[2])return json({ticket:publicTicket(t),messages:(await messages(env,t.id)).filter(m=>m.role!=='internal'),attachments:await attachments(env,t.id)});
  if(method==='POST'&&publicMatch[2]){if(t.status==='closed')return err(403,'该反馈已关闭');if(!await rate(env,request,'reply',15,3600))return err(429,'回复过于频繁');const form=await request.formData().catch(()=>null);if(!form)return err(400,'格式错误');const body=clean(form.get('body'),4000);if(!body && !form.getAll('files').some(f=>f instanceof File&&f.size))return err(400,'请输入回复或添加附件');const fs=form.getAll('files').filter(f=>f instanceof File&&f.size>0);if(fs.length>5||fs.some(f=>f.size>10*1024*1024||!allowedExt.has(fileExt(f.name))||!allowedTypes.has(f.type)))return err(400,'附件不符合要求');const mid=uuid();await env.DB.prepare('INSERT INTO messages(id,ticket_id,role,body) VALUES(?,?,?,?)').bind(mid,t.id,'visitor',body).run();await storeFiles(env,form,t.id,mid);await env.DB.prepare('UPDATE tickets SET updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(t.id).run();return json({ok:true});}}
 const attachmentMatch=path.match(/^\/api\/attachments\/([a-f0-9-]{36})$/);
 if(method==='GET'&&attachmentMatch){const file=await env.DB.prepare('SELECT * FROM attachments WHERE id=?').bind(attachmentMatch[1]).first();if(!file)return err(404,'文件不存在');const tok=url.searchParams.get('token');if(!await isAdmin(request,env)){const t=await getTicket(env,tok);if(!t||t.id!==file.ticket_id)return err(403,'无权访问');}const obj=await env.FILES.get(file.object_key);if(!obj)return err(404,'附件已丢失');const safeName=file.name.replace(/[\r\n"\\]/g,'_');return new Response(obj.body,{headers:{'content-type':'application/octet-stream','content-disposition':`attachment; filename="${safeName.replace(/[^\x20-\x7e]/g,'_')}"; filename*=UTF-8''${encodeURIComponent(file.name)}`,'x-content-type-options':'nosniff','cache-control':'private, no-store'}});}
 if(!path.startsWith('/api/admin/'))return err(404,'接口不存在');
 if(!await isAdmin(request,env))return err(401,'请先登录');
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
 if(method==='GET'&&path==='/api/admin/projects')return json({projects:(await env.DB.prepare('SELECT * FROM projects ORDER BY created_at').all()).results});
 if(method==='POST'&&path==='/api/admin/projects'){const b=await request.json().catch(()=>({}));const slug=clean(b.slug,50).toLowerCase(),name=clean(b.name,80);if(!/^[a-z0-9-]{2,50}$/.test(slug)||!name)return err(400,'项目名称或路径不合法');const officialUrl=clean(b.official_url,1000);if(!validProjectUrl(officialUrl))return err(400,'官网地址必须是有效的 HTTP 或 HTTPS 链接');try{await env.DB.prepare('INSERT INTO projects(id,slug,name,description,official_url,visible,enabled) VALUES(?,?,?,?,?,?,?)').bind(uuid(),slug,name,clean(b.description,200),officialUrl,b.visible?1:0,b.enabled?1:0).run();return json({ok:true},201);}catch{return err(409,'项目路径已存在');}}
 const proj=path.match(/^\/api\/admin\/projects\/([a-z0-9-]+)$/);if(method==='PATCH'&&proj){const b=await request.json().catch(()=>({}));const name=clean(b.name,80);if(!name)return err(400,'项目名称不能为空');const officialUrl=b.official_url===undefined?null:clean(b.official_url,1000);if(!validProjectUrl(officialUrl))return err(400,'官网地址必须是有效的 HTTP 或 HTTPS 链接');await env.DB.prepare('UPDATE projects SET name=?,description=?,official_url=COALESCE(?,official_url),visible=?,enabled=? WHERE slug=?').bind(name,clean(b.description,200),officialUrl,b.visible?1:0,b.enabled?1:0,proj[1]).run();return json({ok:true});}
 if(method==='GET'&&path==='/api/admin/tickets'){const status=clean(url.searchParams.get('status'),20),project=clean(url.searchParams.get('project'),50),q=clean(url.searchParams.get('q'),100);const rows=(await env.DB.prepare(`SELECT t.id,t.number,t.kind,t.title,t.status,t.created_at,t.updated_at,p.name project_name,p.slug project_slug FROM tickets t JOIN projects p ON p.id=t.project_id WHERE (?='' OR t.status=?) AND (?='' OR p.slug=?) AND (?='' OR t.title LIKE ? OR t.number LIKE ?) ORDER BY t.updated_at DESC LIMIT 200`).bind(status,status,project,project,q,'%'+q+'%','%'+q+'%').all()).results;return json({tickets:rows});}
 const adt=path.match(/^\/api\/admin\/tickets\/([a-f0-9-]{36})(?:\/(reply))?$/);
 if(adt){const t=await env.DB.prepare('SELECT t.*,p.name project_name,p.slug project_slug FROM tickets t JOIN projects p ON p.id=t.project_id WHERE t.id=?').bind(adt[1]).first();if(!t)return err(404,'反馈不存在');if(method==='GET'&&!adt[2])return json({ticket:{...publicTicket(t),contact:t.contact},messages:await messages(env,t.id),attachments:await attachments(env,t.id)});
 if(method==='PATCH'&&!adt[2]){const b=await request.json().catch(()=>({}));if(!['new','progress','resolved','closed'].includes(b.status))return err(400,'状态无效');await env.DB.prepare('UPDATE tickets SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(b.status,t.id).run();return json({ok:true});}
 if(method==='POST'&&adt[2]){const b=await request.json().catch(()=>({}));const body=clean(b.body,4000);if(!body)return err(400,'回复不能为空');await env.DB.prepare('INSERT INTO messages(id,ticket_id,role,body) VALUES(?,?,?,?)').bind(uuid(),t.id,b.internal?'internal':'admin',body).run();await env.DB.prepare('UPDATE tickets SET updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(t.id).run();return json({ok:true});}}
 return err(404,'接口不存在');
}
export default {async fetch(request,env){try {return await route(request,env);}catch(e){console.error(e);return err(500,'服务器暂时无法处理请求');}}};
