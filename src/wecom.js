const encoder=new TextEncoder();
let cachedToken;
const configured=env=>!!(env.WECOM_CORP_ID&&env.WECOM_SECRET&&env.WECOM_AGENT_ID&&env.WECOM_TO_USER);
const limited=(value,max=1800)=>{let result='',bytes=0;for(const char of String(value)){const n=encoder.encode(char).length;if(bytes+n>max)return result+'…';result+=char;bytes+=n;}return result;};
async function token(env){
 if(cachedToken&&cachedToken.corp===env.WECOM_CORP_ID&&cachedToken.secret===env.WECOM_SECRET&&cachedToken.until>Date.now())return cachedToken.value;
 const url=new URL('https://qyapi.weixin.qq.com/cgi-bin/gettoken');url.searchParams.set('corpid',env.WECOM_CORP_ID);url.searchParams.set('corpsecret',env.WECOM_SECRET);
 const response=await fetch(url,{signal:AbortSignal.timeout(10000)});if(!response.ok)throw Error('获取企业微信令牌失败（HTTP '+response.status+'）');const data=await response.json();
 if(data.errcode||!data.access_token)throw Error('获取企业微信令牌失败（'+(data.errcode??'无令牌')+'）');
 cachedToken={corp:env.WECOM_CORP_ID,secret:env.WECOM_SECRET,value:data.access_token,until:Date.now()+Math.max(60,(Number(data.expires_in)||7200)-300)*1000};return data.access_token;
}
async function send(env,content,renew=false){
 const access=await token(env),url='https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token='+encodeURIComponent(access);
 let response;try{response=await fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({touser:env.WECOM_TO_USER,msgtype:'text',agentid:Number(env.WECOM_AGENT_ID),text:{content},safe:0}),signal:AbortSignal.timeout(10000)});}catch{const error=Error('推送请求未获得回执，请先在企业微信确认是否收到再重试');error.uncertain=true;throw error;}
 if(!response.ok){const error=Error('推送未获得有效回执（HTTP '+response.status+'），请先确认是否收到');error.uncertain=true;throw error;}
 let result;try{result=await response.json();}catch{const error=Error('无法读取推送回执，请先确认是否收到');error.uncertain=true;throw error;}
 if([40014,42001].includes(result.errcode)&&!renew){cachedToken=null;return send(env,content,true);}
 if(result.errcode||result.invaliduser||result.invalidparty||result.invalidtag)throw Error('企业微信未成功接收通知（'+(result.errcode||'接收成员不可用')+'）');
 return result.msgid||'';
}
export async function notifyFeedback(env,ticket,origin){
 await env.DB.prepare("INSERT OR IGNORE INTO feedback_notifications(ticket_id,status) VALUES(?,'pending')").bind(ticket.id).run();
 if(!configured(env)){await env.DB.prepare("UPDATE feedback_notifications SET status='disabled',error='企业微信应用尚未配置',updated_at=CURRENT_TIMESTAMP WHERE ticket_id=? AND status<>'sent'").bind(ticket.id).run();return;}
 const claim=await env.DB.prepare("UPDATE feedback_notifications SET status='sending',error='',updated_at=CURRENT_TIMESTAMP WHERE ticket_id=? AND (status IN ('pending','failed','disabled','unknown') OR (status='sending' AND updated_at<datetime('now','-5 minutes')))").bind(ticket.id).run();
 if(!(claim.meta?.changes??claim.changes))return;
 try{
  const target=new URL('/admin#inbox/'+ticket.id,env.PUBLIC_SITE_URL||origin).href;
  const heading=`收到新反馈\n项目：${ticket.project_name}\n编号：${ticket.number}\n标题：${ticket.title}\n内容：${ticket.body}`;
  const content=limited(heading,Math.max(200,1900-encoder.encode(target).length))+'\n\n查看并处理：'+target;
  const msgid=await send(env,content);
  await env.DB.prepare("UPDATE feedback_notifications SET status='sent',message_id=?,error='',updated_at=CURRENT_TIMESTAMP WHERE ticket_id=?").bind(msgid,ticket.id).run();
 }catch(error){await env.DB.prepare('UPDATE feedback_notifications SET status=?,error=?,updated_at=CURRENT_TIMESTAMP WHERE ticket_id=?').bind(error.uncertain?'unknown':'failed',String(error.message).slice(0,300),ticket.id).run();console.error('Feedback notification failed:',error.message);}
}
