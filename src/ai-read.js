const json=(data,status=200,headers={})=>Response.json(data,{status,headers:{'cache-control':'private, no-store','x-content-type-options':'nosniff',...headers}});
const error=(status,message,headers)=>json({error:message},status,headers);
const sha=async value=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(x=>x.toString(16).padStart(2,'0')).join('');
const equal=(a,b)=>{let diff=a.length^b.length;for(let i=0;i<Math.max(a.length,b.length);i++)diff|=(a.charCodeAt(i)||0)^(b.charCodeAt(i)||0);return diff===0;};
const slug=/^[a-z0-9-]{1,50}$/;
function keys(env){
 const rows=JSON.parse(env.AI_READ_KEYS||'[]');
 if(!Array.isArray(rows)||rows.length>50||rows.some(k=>!k||typeof k.id!=='string'||!k.id||!/^[a-f0-9]{64}$/.test(k.hash)||!(k.projects==='*'||(Array.isArray(k.projects)&&k.projects.length>0&&k.projects.every(p=>typeof p==='string'&&slug.test(p))))||!(k.expires_at===null||Number.isSafeInteger(k.expires_at)&&k.expires_at>0)))throw Error('Invalid AI key configuration');
 return rows;
}
function scope(key,alias='p') {return key.projects==='*'?{sql:'1=1',params:[]}:{sql:`${alias}.slug IN (${key.projects.map(()=>'?').join(',')})`,params:key.projects};}
const detailFields='t.id,t.number,t.title,t.body,t.status,t.created_at,t.updated_at,p.name project_name,p.slug project_slug';
const fileFields='a.id,a.message_id,a.name,a.mime,a.bytes,a.created_at';
const publicFile="(a.message_id IS NULL OR EXISTS(SELECT 1 FROM messages m WHERE m.id=a.message_id AND m.ticket_id=a.ticket_id AND m.role IN ('visitor','admin')))";
const decorateFile=f=>({...f,download_path:'/api/ai/attachments/'+f.id});

// All routes in this namespace are isolated from browser sessions and write APIs.
export async function aiRead(request,env,rate){
 const url=new URL(request.url),path=url.pathname;
 if(request.method!=='GET')return error(405,'AI 接口仅支持 GET 只读查询',{allow:'GET'});
 let configured;try{configured=keys(env);}catch{return error(503,'AI 只读密钥配置无效');}
 if(!configured.length)return error(503,'AI 只读接口尚未配置');
 const token=request.headers.get('authorization')?.match(/^Bearer (pm_ai_[a-f0-9]{64})$/i)?.[1];
 const digest=token?await sha(token):'';
 const key=configured.find(k=>equal(k.hash,digest));
 if(!key||(key.expires_at!==null&&key.expires_at<=Math.floor(Date.now()/1000))){
  if(!await rate(env,request,'ai-denied',30,60))return error(429,'请求过于频繁',{ 'retry-after':'60'});
  return error(401,'AI 密钥无效或已过期',{'www-authenticate':'Bearer realm="PingMe AI read"'});
 }
 if(!await rate(env,request,'ai-read:'+key.id,120,60))return error(429,'请求过于频繁',{'retry-after':'60'});
 const access=scope(key);
 if(path==='/api/ai/projects'){
  const projects=(await env.DB.prepare(`SELECT p.slug,p.name,p.description FROM projects p WHERE ${access.sql} ORDER BY p.sort_order,p.name,p.slug`).bind(...access.params).all()).results;
  return json({projects});
 }
 if(path==='/api/ai/feedback'){
  const q=url.searchParams.get('q')||'',project=url.searchParams.get('project')||'',status=url.searchParams.get('status')||'',after=url.searchParams.get('updated_after')||'';
  if(q.length>200||project&&!slug.test(project)||status&&!['new','progress','resolved','closed'].includes(status))return error(400,'搜索条件无效');
  const page=Number(url.searchParams.get('page')||1),limit=Number(url.searchParams.get('limit')||20);
  if(!Number.isSafeInteger(page)||page<1||page>10000||!Number.isSafeInteger(limit)||limit<1||limit>50)return error(400,'page 为 1–10000，limit 为 1–50 的整数');
  if(after&&(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(after)||!Number.isFinite(Date.parse(after))))return error(400,'updated_after 必须为 UTC ISO 时间');
  const since=after?new Date(after).toISOString().slice(0,19).replace('T',' '):'';
  const where=`${access.sql} AND (?='' OR p.slug=?) AND (?='' OR t.status=?) AND (?='' OR instr(lower(t.title),lower(?))>0 OR instr(lower(t.body),lower(?))>0 OR instr(lower(t.number),lower(?))>0) AND (?='' OR t.updated_at>=?)`;
  const params=[...access.params,project,project,status,status,q,q,q,q,since,since];
  const [rows,count]=await env.DB.batch([
   env.DB.prepare(`SELECT t.id,t.number,substr(t.title,1,200) title,substr(t.body,1,500) excerpt,t.status,t.created_at,t.updated_at,p.slug project_slug,p.name project_name FROM tickets t JOIN projects p ON p.id=t.project_id WHERE ${where} ORDER BY t.updated_at DESC,t.id DESC LIMIT ? OFFSET ?`).bind(...params,limit,(page-1)*limit),
   env.DB.prepare(`SELECT count(*) total FROM tickets t JOIN projects p ON p.id=t.project_id WHERE ${where}`).bind(...params)
  ]);
  const total=count.results[0].total;return json({feedback:rows.results,total,page,limit,has_more:page*limit<total});
 }
 const detail=path.match(/^\/api\/ai\/feedback\/(PM-\d{8}-[A-F0-9]{6}|[a-f0-9-]{36})$/);
 if(detail){
  const ticket=await env.DB.prepare(`SELECT ${detailFields} FROM tickets t JOIN projects p ON p.id=t.project_id WHERE (t.number=? OR t.id=?) AND ${access.sql}`).bind(detail[1],detail[1],...access.params).first();
  if(!ticket)return error(404,'反馈不存在或无权读取');
  const [messages,files]=await env.DB.batch([
   env.DB.prepare("SELECT id,role,body,created_at FROM messages WHERE ticket_id=? AND role IN ('visitor','admin') ORDER BY created_at,rowid").bind(ticket.id),
   env.DB.prepare(`SELECT ${fileFields} FROM attachments a WHERE a.ticket_id=? AND ${publicFile} ORDER BY a.created_at,a.rowid`).bind(ticket.id)
  ]);
  return json({ticket,messages:messages.results,attachments:files.results.map(decorateFile),admin_url:new URL('/admin#inbox/'+ticket.id,url.origin).href});
 }
 const attachment=path.match(/^\/api\/ai\/attachments\/([a-f0-9-]{36})$/);
 if(attachment){
  const file=await env.DB.prepare(`SELECT a.name,a.object_key FROM attachments a JOIN tickets t ON t.id=a.ticket_id JOIN projects p ON p.id=t.project_id WHERE a.id=? AND ${publicFile} AND ${access.sql}`).bind(attachment[1],...access.params).first();
  if(!file)return error(404,'附件不存在或无权读取');
  const obj=await env.FILES.get(file.object_key);if(!obj)return error(404,'附件已丢失');
  return new Response(obj.body,{headers:{'content-type':'application/octet-stream','content-disposition':`attachment; filename="attachment"; filename*=UTF-8''${encodeURIComponent(file.name).replace(/['()*]/g,c=>'%'+c.charCodeAt(0).toString(16))}`,'cache-control':'private, no-store','x-content-type-options':'nosniff'}});
 }
 return error(404,'AI 接口不存在');
}
