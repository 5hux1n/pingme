import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import worker from '../../src/worker.js';
export function fixture(){
 const sql=new DatabaseSync(':memory:');sql.exec(readFileSync(new URL('../../schema.sql',import.meta.url),'utf8'));
 sql.exec("INSERT INTO projects(id,slug,name,category) VALUES('demo','demo','本地测试项目','other')");
 const DB={prepare(query){const stmt={query,values:[],bind(...values){return {...stmt,values};},async all(){return {results:sql.prepare(query).all(...this.values)};},async first(){return sql.prepare(query).get(...this.values)||null;},async run(){const r=sql.prepare(query).run(...this.values);return {meta:{changes:r.changes}};}};return stmt;},async batch(statements){sql.exec('BEGIN');try{const results=statements.map(stmt=>{const q=sql.prepare(stmt.query);if(q.columns().length)return {results:q.all(...stmt.values)};return {meta:{changes:q.run(...stmt.values).changes}};});sql.exec('COMMIT');return results;}catch(error){sql.exec('ROLLBACK');throw error;}}};
 const blobs=new Map(),env={DB,FILES:{async put(key,body){blobs.set(key,body instanceof ReadableStream?await new Response(body).blob():new Blob([body]));},async get(key){const b=blobs.get(key);return b?{body:b.stream()}:null;}},SESSION_SECRET:'local-test-session-secret',MAIL_SIGNING_SECRET:'local-test-mail-signing-secret',RESEND_API_KEY:'local-test-key',RESEND_WEBHOOK_SECRET:'whsec_'+btoa('local-test-webhook-secret'),MAIL_FROM:'PingMe <feedback@pingme.test>',MAIL_DOMAIN:'pingme.test',MAIL_ADMIN_TO:'admin@example.com',PUBLIC_SITE_URL:'http://localhost',ADMIN_PASSWORD:'x',WECOM_CORP_ID:'local-corp',WECOM_AGENT_ID:'1',WECOM_SECRET:crypto.randomUUID(),WECOM_TO_USER:'local-admin'};
 const pending=[],ctx={waitUntil(p){pending.push(p);}};
 const call=(path,options={})=>worker.fetch(new Request('http://localhost'+path,{...options,headers:{origin:'http://localhost','cf-connecting-ip':crypto.randomUUID(),...options.headers}}),env,ctx);
 const flush=async()=>{while(pending.length)await Promise.all(pending.splice(0));};
 const rows=query=>sql.prepare(query).all();
 async function create(email='user@example.com'){const form=new FormData();for(const [k,v] of Object.entries({project:'demo',body:'这是一条本地验证反馈',email}))form.set(k,v);const response=await call('/api/tickets',{method:'POST',body:form});return {response,data:await response.json()};}
 async function login(){const response=await call('/api/admin/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({password:'x'})});return response.headers.get('set-cookie').split(';')[0];}
 return {env,sql,rows,call,flush,create,login,blobs};
}
export function mockProvider(){const sent=[],received=new Map();let fail=false;const fetch=async(url,options={})=>{
 const value=String(url);if(value.includes('/gettoken'))return Response.json({errcode:0,access_token:'local-wecom-token'});if(value.includes('qyapi.weixin.qq.com/cgi-bin/message/send'))return Response.json({errcode:0,msgid:crypto.randomUUID()});
 if(value==='https://api.resend.com/emails'){if(fail)return Response.json({name:'temporary_failure'},{status:500});sent.push({body:JSON.parse(options.body),key:options.headers['Idempotency-Key']});return Response.json({id:crypto.randomUUID()});}
 if(/^https:\/\/api.resend.com\/emails\/[a-f0-9-]{36}$/.test(value))return Response.json({message_id:'<'+value.split('/').pop()+'@resend.test>'});
 const match=value.match(/^https:\/\/api.resend.com\/emails\/receiving\/([a-f0-9-]+)(?:\?html_format=cid)?$/);if(match)return Response.json(received.get(match[1])||{error:'missing'});
 if(value.endsWith('/attachments'))return Response.json({data:[]});throw Error('Unexpected test fetch: '+value);
 };return {fetch,sent,received,setFail(v){fail=v;}};
}
export async function webhookRequest(f,emailId,{type='email.received',extra={},badSignature=false,id=crypto.randomUUID()}={}){
 const body=JSON.stringify({type,data:{email_id:emailId,...extra}}),timestamp=String(Math.floor(Date.now()/1000));const secret=Uint8Array.from(atob(f.env.RESEND_WEBHOOK_SECRET.slice(6)),c=>c.charCodeAt(0)),key=await crypto.subtle.importKey('raw',secret,{name:'HMAC',hash:'SHA-256'},false,['sign']);const signature=btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(id+'.'+timestamp+'.'+body)))));
 return f.call('/api/mail/webhook',{method:'POST',headers:{'svix-id':id,'svix-timestamp':timestamp,'svix-signature':'v1,'+(badSignature?'bad':signature)},body});
}
