export const STATUS={new:'待审核',progress:'沟通中',resolved:'待解决',closed:'不受理',completed:'已完结'};
export const validEmail=value=>typeof value==='string'&&value.length<=254&&/^[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9-]*[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]*[A-Z0-9])?)+$/i.test(value)&&!/[\r\n]/.test(value);
export function jobStatements(env,id,{visitor=false,admin=false,wecom=false,waitingFiles=false}={}){
 return [...(visitor?[['email','visitor']]:[]),...(admin?[['email','admin']]:[]),...(wecom?[['wecom','admin']]:[])].map(([channel,audience])=>env.DB.prepare('INSERT OR IGNORE INTO notification_jobs(id,event_id,channel,audience,status) SELECT ?,id,?,?,? FROM ticket_events WHERE id=?').bind(id+':'+channel+':'+audience,channel,audience,waitingFiles?'waiting_files':'pending',id));
}
export function eventStatement(env,event){return env.DB.prepare('INSERT OR IGNORE INTO ticket_events(id,ticket_id,kind,body,status,previous_status,role,source) SELECT ?,id,?,?,?,?,?,? FROM tickets WHERE id=? AND last_event_id=?').bind(event.id,event.kind,event.body||'',event.status,event.previous_status,event.role,event.source||'web',event.ticket_id,event.id);}
export async function changeTicket(env,t,{body='',status=t.status,internal=false,suppressEmail=false,source='web',eventId=crypto.randomUUID(),revision=t.revision}={}){
 if(!Object.hasOwn(STATUS,status))throw Object.assign(Error('状态无效'),{status:400});
 if(!body&&status===t.status)return {changed:false};
 const role=internal?'internal':'admin',event={id:eventId,ticket_id:t.id,kind:internal?(status!==t.status?'status':'internal'):body?'reply':'status',body:internal?'':body,status,previous_status:t.status,role,source};
 const history=body+(status!==t.status?`${body?'\n\n':''}处理状态：${STATUS[t.status]} → ${STATUS[status]}`:'');
 const result=await env.DB.batch([
  env.DB.prepare('UPDATE tickets SET status=?,revision=revision+1,last_event_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND revision=?').bind(status,eventId,t.id,revision),
  eventStatement(env,event),
  env.DB.prepare('INSERT OR IGNORE INTO messages(id,ticket_id,role,body) SELECT ?,id,?,? FROM tickets WHERE id=? AND last_event_id=?').bind(eventId,body?role:'system',history,t.id,eventId),
  ...jobStatements(env,eventId,{visitor:(!internal||status!==t.status)&&!suppressEmail}),
  env.DB.prepare('SELECT status,updated_at,revision FROM tickets WHERE id=?').bind(t.id)
 ]);
 if(!(result[0].meta?.changes??result[0].changes))throw Object.assign(Error('这条反馈已被其他操作更新，请刷新详情后再保存；当前回复内容已保留'),{status:409});
 return {changed:true,ticket:result.at(-1).results[0],eventId};
}
export async function visitorEvent(env,t,body,{eventId=crypto.randomUUID(),source='web'}={}){
 for(let attempt=0;attempt<3;attempt++){
  const current=await env.DB.prepare('SELECT status,revision FROM tickets WHERE id=?').bind(t.id).first();
  const status=current.status==='closed'?'new':current.status;
  const history=body+(status!==current.status?`\n\n处理状态：${STATUS[current.status]} → ${STATUS[status]}`:'');
  const event={id:eventId,ticket_id:t.id,kind:'reply',body,status,previous_status:current.status,role:'visitor',source};
  const result=await env.DB.batch([
   env.DB.prepare('UPDATE tickets SET status=?,revision=revision+1,last_event_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND revision=?').bind(status,eventId,t.id,current.revision),
   eventStatement(env,event),
   env.DB.prepare("INSERT OR IGNORE INTO messages(id,ticket_id,role,body) SELECT ?,id,'visitor',? FROM tickets WHERE id=? AND last_event_id=?").bind(eventId,history,t.id,eventId),
   ...jobStatements(env,eventId,{admin:true,wecom:true})
  ]);
  if(result[0].meta?.changes??result[0].changes)return eventId;
 }
 throw Object.assign(Error('反馈正在更新，请稍后重试'),{status:409});
}
