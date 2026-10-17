import test from 'node:test';
import assert from 'node:assert/strict';
import {notifyFeedback} from '../src/wecom.js';
import {validImageSource} from '../src/project-images.js';
function database(){
 let row;
 return {
  get row(){return row;},
  prepare(sql){
   return {bind(...args){
    return {async run(){
     let changes=1;
     if(sql.startsWith('INSERT'))row??={status:'pending'};
     else if(sql.includes("status='sending'")){
      if(['sent','sending'].includes(row?.status))changes=0;
      else row={...row,status:'sending'};
     }else if(sql.includes("status='sent'"))row={...row,status:'sent',message_id:args[0]};
     else if(sql.includes("status='disabled'"))row={...row,status:'disabled'};
     else row={...row,status:args[0],error:args[1]};
     return {meta:{changes}};
    }};
   }};
  }
 };
}
const feedback={id:'00000000-0000-4000-8000-000000000001',project_name:'测试项目',number:'PM-TEST',title:'字'.repeat(2000),body:'反馈'.repeat(8000)};
const env=()=>({DB:database(),WECOM_CORP_ID:'unit-test-corp',WECOM_SECRET:Math.random().toString(36),WECOM_AGENT_ID:'1',WECOM_TO_USER:'test',PUBLIC_SITE_URL:'https://example.test'});
test('notification text fits byte limit, retains admin link, uses text, and does not resend success',async()=>{const e=env(),original=globalThis.fetch;let sent=0;try{globalThis.fetch=async(url,options)=>{if(String(url).includes('/gettoken'))return Response.json({errcode:0,access_token:'unit-token',expires_in:7200});sent++;const body=JSON.parse(options.body);assert.equal(body.msgtype,'text');assert.ok(new TextEncoder().encode(body.text.content).length<=2048);assert.ok(body.text.content.endsWith('/admin#inbox/'+feedback.id));return Response.json({errcode:0,msgid:'unit-msg'});};await notifyFeedback(e,feedback,'https://unused.test');assert.equal(e.DB.row.status,'sent');await notifyFeedback(e,feedback,'https://unused.test');assert.equal(sent,1);}finally{globalThis.fetch=original;}});
test('unknown delivery is recorded without blind retry or throwing to the submitter',async()=>{const e=env(),original=globalThis.fetch;let sends=0;try{globalThis.fetch=async url=>{if(String(url).includes('/gettoken'))return Response.json({errcode:0,access_token:'unit-token'});sends++;throw Error('simulated timeout');};await notifyFeedback(e,feedback,'https://example.test');assert.equal(e.DB.row.status,'unknown');assert.equal(sends,1);}finally{globalThis.fetch=original;}});
test('only explicit expired-token rejection refreshes token and retries',async()=>{const e=env(),original=globalThis.fetch;let sends=0,tokens=0;try{globalThis.fetch=async url=>{if(String(url).includes('/gettoken')){tokens++;return Response.json({errcode:0,access_token:'unit-token'});}sends++;return Response.json(sends===1?{errcode:42001}:{errcode:0,msgid:'ok'});};await notifyFeedback(e,feedback,'https://example.test');assert.equal(e.DB.row.status,'sent');assert.equal(tokens,2);assert.equal(sends,2);}finally{globalThis.fetch=original;}});
test('notification configuration missing is explicit and does not block feedback',async()=>{const DB=database();await notifyFeedback({DB},feedback,'https://example.test');assert.equal(DB.row.status,'disabled');});
test('image importer rejects private hosts, credentials and unsafe ports',()=>{for(const url of ['http://127.0.0.1/a.png','http://10.0.0.1/a','http://192.168.0.1/x','http://[::1]/a','http://foo.local/a','https://u:p@example.com/a','http://example.com:8080/a','file:///tmp/a'])assert.equal(validImageSource(url),false,url);assert.equal(validImageSource('https://example.com/icon.webp'),true);});
