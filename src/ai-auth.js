const json=(status,error,headers={})=>Response.json({error},{status,headers:{'cache-control':'private, no-store','x-content-type-options':'nosniff',...headers}});
export const aiHash=async value=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(x=>x.toString(16).padStart(2,'0')).join('');
const equal=(a,b)=>{let diff=a.length^b.length;for(let i=0;i<Math.max(a.length,b.length);i++)diff|=(a.charCodeAt(i)||0)^(b.charCodeAt(i)||0);return diff===0;};
export const projectScope=(key,alias='p')=>key.projects==='*'?{sql:'1=1',params:[]}:{sql:`${alias}.slug IN (${key.projects.map(()=>'?').join(',')})`,params:key.projects};
export async function authorizeAI(request,env,rate,{write=false}={}){
 const token=request.headers.get('authorization')?.match(/^Bearer (pm_ai_[a-f0-9]{64}|pm_aiw_[a-f0-9]{64})$/i)?.[1];
 const writingKey=!!token?.startsWith('pm_aiw_'),secret=writingKey?'AI_WRITE_KEYS':'AI_READ_KEYS';
 if(write&&!writingKey)return {response:json(token?403:401,'此操作需要独立的 AI 写入密钥')};
 let configured;
 try{
  configured=JSON.parse(env[secret]||'[]');
  if(!Array.isArray(configured)||configured.length>50||configured.some(k=>!k||typeof k.id!=='string'||!k.id||!/^[a-f0-9]{64}$/.test(k.hash)||!(k.projects==='*'||Array.isArray(k.projects)&&k.projects.length>0&&k.projects.every(p=>typeof p==='string'&&/^[a-z0-9-]{1,50}$/.test(p)))||!(k.expires_at===null||Number.isSafeInteger(k.expires_at)&&k.expires_at>0)||writingKey&&(!Array.isArray(k.permissions)||!k.permissions.length||k.permissions.some(p=>!['reply','status'].includes(p)))))throw Error();
 }catch{return {response:json(503,'AI 密钥配置无效')};}
 if(!configured.length)return {response:json(503,'AI 接口尚未配置相应密钥')};
 const digest=token?await aiHash(token):'',key=configured.find(k=>equal(k.hash,digest));
 if(!key||(key.expires_at!==null&&key.expires_at<=Math.floor(Date.now()/1000))){
  if(!await rate(env,request,'ai-denied',30,60))return {response:json(429,'请求过于频繁',{'retry-after':'60'})};
  return {response:json(401,'AI 密钥无效或已过期',{'www-authenticate':'Bearer realm="PingMe AI"'})};
 }
 if(!await rate(env,request,(write?'ai-write:':'ai-read:')+key.id,write?30:120,60))return {response:json(429,'请求过于频繁',{'retry-after':'60'})};
 return {key};
}
