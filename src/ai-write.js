import {authorizeAI,projectScope,aiHash} from './ai-auth.js';
import {STATUS,changeTicket,validEmail} from './ticket-events.js';
const json=(body,status=200)=>Response.json(body,{status,headers:{'cache-control':'private, no-store','x-content-type-options':'nosniff'}});
const fail=(status,error)=>json({error},status);
const fields='t.id,t.number,t.status,t.revision,t.updated_at,p.name project_name,p.slug project_slug';
export async function aiWrite(request,env,rate,schedule){
 const match=new URL(request.url).pathname.match(/^\/api\/ai\/feedback\/(PM\d{14}|PM-\d{8}-[A-F0-9]{6}|[a-f0-9-]{36})(\/reply)?$/);
 if(!match||!(request.method==='PATCH'&&!match[2]||request.method==='POST'&&match[2]))return fail(405,'此 AI 写接口仅支持 PATCH 状态或 POST 答复');
 const auth=await authorizeAI(request,env,rate,{write:true});if(auth.response)return auth.response;const key=auth.key,scope=projectScope(key);
 if(request.headers.get('origin')&&request.headers.get('origin')!==new URL(request.url).origin)return fail(403,'不允许跨站写入');
 if(!/^application\/json(?:;|$)/i.test(request.headers.get('content-type')||''))return fail(415,'请使用 application/json');
 const requestId=request.headers.get('idempotency-key')||'';
 if(!/^[A-Za-z0-9_-]{16,100}$/.test(requestId))return fail(400,'请提供 16–100 位 Idempotency-Key，同一操作重试时保持不变');
 if(Number(request.headers.get('content-length')||0)>512*1024)return fail(413,'请求正文过大');
 let b;try{const text=await request.text();if(new TextEncoder().encode(text).length>512*1024)return fail(413,'请求正文过大');b=JSON.parse(text);}catch{return fail(400,'JSON 格式错误');}
 if(!b||typeof b!=='object'||Array.isArray(b)||Object.keys(b).some(k=>!['body','status','revision','suppress_email'].includes(k)))return fail(400,'只允许 body、status、revision、suppress_email 字段');
 if(!Number.isSafeInteger(b.revision)||b.revision<0)return fail(400,'请先读取反馈详情并提供 revision');
 if(b.body!==undefined&&typeof b.body!=='string'||b.suppress_email!==undefined&&typeof b.suppress_email!=='boolean')return fail(400,'答复或通知选项格式无效');
 const body=(b.body||'').trim();
 if(request.method==='PATCH'&&b.body!==undefined)return fail(400,'答复内容请使用 POST reply 接口');
 if(b.status!==undefined&&!Object.hasOwn(STATUS,b.status)||!body&&b.status===undefined)return fail(400,'请提供有效状态或非空答复');
 if(body&&!key.permissions.includes('reply')||b.status!==undefined&&!key.permissions.includes('status'))return fail(403,'密钥没有对应的答复或状态修改权限');
 const t=await env.DB.prepare(`SELECT t.*,p.slug project_slug FROM tickets t JOIN projects p ON p.id=t.project_id WHERE (t.id=? OR t.number=?) AND ${scope.sql}`).bind(match[1],match[1],...scope.params).first();
 if(!t)return fail(404,'反馈不存在或无权处理');
 const payload={body,status:b.status??null,revision:b.revision,suppress_email:b.suppress_email===true};
 const source='ai:'+key.id+':'+await aiHash(JSON.stringify(payload));
 const eventId='ai_'+await aiHash(key.id+':'+requestId);
 async function receipt(replayed,event){
  const ticket=await env.DB.prepare(`SELECT ${fields} FROM tickets t JOIN projects p ON p.id=t.project_id WHERE t.id=?`).bind(t.id).first();
  const job=event?await env.DB.prepare("SELECT status FROM notification_jobs WHERE event_id=? AND channel='email' AND audience='visitor'").bind(eventId).first():null;
  return json({ok:true,changed:!!event,event_id:event?eventId:null,replayed,emailQueued:!!job&&validEmail(t.email),emailSuppressed:!!event&&payload.suppress_email,ticket});
 }
 async function prior(){
  const event=await env.DB.prepare('SELECT ticket_id,source FROM ticket_events WHERE id=?').bind(eventId).first();
  if(!event)return null;
  if(event.ticket_id!==t.id||event.source!==source)return fail(409,'Idempotency-Key 已用于其他内容，请勿复用');
  return receipt(true,event);
 }
 const existing=await prior();if(existing)return existing;
 let result;try{result=await changeTicket(env,t,{body,status:b.status??t.status,revision:b.revision,suppressEmail:payload.suppress_email,source,eventId});}
 catch(e){if(e.status===409){const retry=await prior();if(retry)return retry;}return fail(e.status||500,e.status?e.message:'反馈保存失败，请用相同 Idempotency-Key 重试');}
 if(result.changed&&!payload.suppress_email)schedule(env,t.id);
 return receipt(false,result.changed?{id:eventId}:null);
}
