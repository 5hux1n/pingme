import test from 'node:test';
import assert from 'node:assert/strict';
import {mailFiles,rasterMime,imageSize} from '../src/feedback-files.js';
import {feedbackFiles} from '../public/feedback-media.js';
import {emailContent} from '../src/mail.js';
import {fixture,mockProvider} from './helpers/mail-fixture.js';
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aL1kAAAAASUVORK5CYII=','base64');
test('image detection accepts raster signatures and refuses HTML or SVG masquerading as an image',()=>{
 assert.equal(rasterMime(png),'image/png');assert.equal(rasterMime(new TextEncoder().encode('<svg onload="alert(1)">')),'');assert.equal(rasterMime(new TextEncoder().encode('<html>bad</html>')),'');
});
test('email attachments carry exact file bytes and omit oversized or missing objects without leaking URLs',async()=>{
 const env={FILES:{async get(key){return key==='missing'?null:{body:png};}}};
 const out=await mailFiles(env,[{name:'screenshot.png',bytes:png.length,object_key:'picture'},{name:'oversized.zip',bytes:999,object_key:'big'},{name:'missing.log',bytes:1,object_key:'missing'}],{budget:png.length});
 assert.equal(out.attachments.length,1);assert.deepEqual(Buffer.from(out.attachments[0].content,'base64'),png);assert.equal(out.omitted,2);assert.equal(out.attachments[0].content_id,'feedback-image-0');assert.deepEqual(out.images,[{contentId:'feedback-image-0',width:1,height:1}]);assert.ok(!JSON.stringify(out).includes('object_key'));
});
test('media markup previews images and retains downloads without interpreting filenames as markup',()=>{
 const html=feedbackFiles([{id:'demo',name:'<script>.png',mime:'image/png',bytes:80}],'Ab7kP2mN9xQ4');assert.ok(html.includes('<img'));assert.ok(html.includes('inline=1'));assert.ok(html.includes('token=Ab7kP2mN9xQ4'));assert.ok(html.includes('&lt;script&gt;.png'));assert.ok(!html.includes('<script>'));
});
test('private images preview in their message and are real email attachments; later status mail does not resend them',async()=>{
 const original=globalThis.fetch,p=mockProvider(),f=fixture();globalThis.fetch=p.fetch;
 try{
  const form=new FormData();for(const [k,v] of Object.entries({project:'demo',email:'user@example.com',body:'附图验证'}))form.set(k,v);form.set('files',new File([png],'screenshot.png',{type:'image/png'}));
  const created=await f.call('/api/tickets',{method:'POST',body:form}),data=await created.json();assert.equal(created.status,201);await f.flush();
  assert.equal(p.sent.length,2);for(const sent of p.sent){assert.deepEqual(Buffer.from(sent.body.attachments[0].content,'base64'),png);assert.ok(!sent.body.text.includes('/api/attachments/'));assert.ok(!sent.body.html.includes('screenshot.png'));assert.ok(sent.body.html.includes('src="cid:feedback-image-0"'));assert.equal(sent.body.attachments[0].content_id,'feedback-image-0');assert.ok(!sent.body.text.includes('个文件已随信附上'));}
  const t=f.rows('SELECT * FROM tickets')[0],file=f.rows('SELECT * FROM attachments')[0],path='/api/attachments/'+file.id,token=data.url.slice(3);
  assert.equal((await f.call(path+'?inline=1')).status,403);
  const view=await f.call(path+'?inline=1&token='+token);assert.equal(view.status,200);assert.equal(view.headers.get('content-type'),'image/png');assert.equal(view.headers.get('content-disposition'),'inline');assert.equal(view.headers.get('cache-control'),'private, no-store');assert.deepEqual(Buffer.from(await view.arrayBuffer()),png);
  assert.match((await f.call(path+'?token='+token)).headers.get('content-disposition'),/^attachment;/);
  const reply=new FormData();reply.set('body','新截图');reply.set('files',new File([png],'reply.png',{type:'image/png'}));assert.equal((await f.call('/api'+data.url+'/reply',{method:'POST',body:reply})).status,200);await f.flush();
  assert.equal(p.sent.at(-1).body.attachments.length,1);assert.equal(p.sent.at(-1).body.attachments[0].filename,'reply.png');
  const publicView=await (await f.call('/api'+data.url)).json();assert.equal(publicView.attachments.find(x=>x.name==='reply.png').message_id,publicView.messages[0].id);
  const cookie=await f.login(),admin=await (await f.call('/api/admin/tickets/'+t.id,{headers:{cookie}})).json();assert.ok(admin.attachments.find(x=>x.name==='reply.png').message_id);
  const change=await f.call('/api/admin/tickets/'+t.id+'/reply',{method:'POST',headers:{cookie,'content-type':'application/json'},body:JSON.stringify({status:'resolved',revision:1})});assert.equal(change.status,200);await f.flush();assert.ok(!p.sent.at(-1).body.attachments);
  f.sql.prepare("INSERT INTO messages(id,ticket_id,role,body) VALUES('private-note',?,'internal','私密备注')").run(t.id);f.sql.prepare("INSERT INTO attachments(id,ticket_id,message_id,name,mime,bytes,object_key) VALUES('private-file',?,'private-note','private.png','image/png',?,'private-key')").run(t.id,png.length);f.blobs.set('private-key',new Blob([png]));const privateNotice=await emailContent(f.env,{...t,project_name:'测试项目'},{id:'private-note',kind:'status',body:'',status:'resolved',previous_status:'new'},'visitor');assert.ok(!privateNotice.attachments);assert.ok(!privateNotice.text.includes('private.png'));
  f.blobs.set(file.object_key,new Blob(['<html>not an image</html>']));assert.equal((await f.call(path+'?inline=1&token='+token)).status,415);
 }finally{await f.flush();globalThis.fetch=original;}
});

test('large portrait and landscape images fit the email bounds; non-image files remain ordinary attachments',async()=>{
 const portrait=Buffer.from(png),landscape=Buffer.from(png);
 portrait.writeUInt32BE(1179,16);portrait.writeUInt32BE(25560,20);
 landscape.writeUInt32BE(12000,16);landscape.writeUInt32BE(800,20);
 assert.deepEqual(imageSize(portrait),{width:1179,height:25560});
 const log=Buffer.from('debug log'),env={FILES:{async get(key){return {body:{portrait,landscape,log}[key]};}}};
 const out=await mailFiles(env,[{name:'portrait.png',object_key:'portrait'},{name:'landscape.png',object_key:'landscape'},{name:'debug.log',object_key:'log'}]);
 assert.equal(out.omitted,0);assert.equal(out.images.length,2);
 assert.deepEqual(out.images.map(({width,height})=>[width,height]),[[30,640],[520,35]]);
 assert.equal(out.attachments[2].content_id,undefined);assert.deepEqual(Buffer.from(out.attachments[2].content,'base64'),log);
 assert.equal(imageSize(Buffer.from('not an image')),null);
});
