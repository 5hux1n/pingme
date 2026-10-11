import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import worker from '../src/worker.js';
test('project management saves website links, preserves legacy fields, and rejects unsafe URLs', async () => {
 const db=new DatabaseSync(':memory:');db.exec(readFileSync(new URL('../schema.sql',import.meta.url),'utf8'));db.exec("UPDATE projects SET color='#123456',icon='X' WHERE slug='codexm'");
 const env={SESSION_SECRET:'local-test-secret',DB:{prepare(sql){let args=[];const stmt=db.prepare(sql);return{bind(...values){args=values;return this},async run(){return stmt.run(...args)},async first(){return stmt.get(...args)||null},async all(){return{results:stmt.all(...args)}}}}}};
 const stamp=String(Date.now()+86400000);const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(env.SESSION_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign']);const signature=Buffer.from(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(stamp))).toString('hex');
 const request=(path,method,body)=>worker.fetch(new Request('https://pingme.pm'+path,{method,headers:{cookie:`pm_session=${stamp}.${signature}`,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}),env);
 const body={name:'CodexM',description:'updated',visible:true,enabled:true,official_url:'https://example.com/codexm',color:'#ffffff',icon:'unused'};
 assert.equal((await request('/api/admin/projects/codexm','PATCH',body)).status,200);
 let row=db.prepare("SELECT * FROM projects WHERE slug='codexm'").get();assert.equal(row.official_url,body.official_url);assert.equal(row.color,'#123456');assert.equal(row.icon,'X');assert.equal(row.id,'codexm');
 assert.equal((await request('/api/admin/projects/codexm','PATCH',{...body,official_url:'javascript:alert(1)'})).status,400);assert.equal(db.prepare("SELECT official_url FROM projects WHERE slug='codexm'").get().official_url,body.official_url);
 const legacy={...body};delete legacy.official_url;assert.equal((await request('/api/admin/projects/codexm','PATCH',legacy)).status,200);assert.equal(db.prepare("SELECT official_url FROM projects WHERE slug='codexm'").get().official_url,body.official_url);
 assert.equal((await request('/api/admin/projects/codexm','PATCH',{...body,official_url:''})).status,200);assert.equal(db.prepare("SELECT official_url FROM projects WHERE slug='codexm'").get().official_url,'');
 assert.equal((await request('/api/admin/projects','POST',{...body,name:'New project',slug:'new-project',official_url:'https://example.com/new'})).status,201);
 const response=await request('/api/projects/new-project','GET');assert.equal((await response.json()).project.official_url,'https://example.com/new');db.close();
});
