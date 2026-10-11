import test from 'node:test';import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';import {readFileSync} from 'node:fs';import worker from '../src/worker.js';
test('password changes require the current password, persist a hash, and revoke previous sessions',async()=>{
 const db=new DatabaseSync(':memory:');db.exec(readFileSync(new URL('../schema.sql',import.meta.url),'utf8'));
 const env={ADMIN_PASSWORD:'old-test-password',SESSION_SECRET:'test-session-secret',DB:{prepare(sql){const statement=db.prepare(sql);let args=[];return{bind(...values){args=values;return this},async first(){return statement.get(...args)||null},async run(){return statement.run(...args)},async all(){return{results:statement.all(...args)}}}}}};
 const call=(path,body,cookie,method='POST')=>worker.fetch(new Request('https://pingme.pm'+path,{method,headers:{'content-type':'application/json',...(cookie?{cookie}:{})},...(body?{body:JSON.stringify(body)}:{})}),env);
 const login=await call('/api/admin/login',{password:env.ADMIN_PASSWORD});assert.equal(login.status,200);const oldCookie=login.headers.get('set-cookie').split(';')[0];
 const body={currentPassword:env.ADMIN_PASSWORD,newPassword:'猫',confirmPassword:'猫'};
 assert.equal((await call('/api/admin/password',body)).status,401);
 assert.equal((await call('/api/admin/password',{...body,currentPassword:'wrong-password'},oldCookie)).status,401);
 assert.equal((await call('/api/admin/password',{...body,confirmPassword:'mismatch'},oldCookie)).status,400);
 assert.equal((await call('/api/admin/password',{...body,newPassword:'',confirmPassword:''},oldCookie)).status,400);
 assert.equal((await call('/api/admin/password',{...body,newPassword:env.ADMIN_PASSWORD,confirmPassword:env.ADMIN_PASSWORD},oldCookie)).status,400);
 const changed=await call('/api/admin/password',body,oldCookie);assert.equal(changed.status,200);assert.match(changed.headers.get('set-cookie'),/Max-Age=0/);
 const stored=db.prepare("SELECT * FROM admin_credentials WHERE id='admin'").get();assert.equal(stored.iterations,100000);assert.match(stored.password_hash,/^[a-f0-9]{64}$/);assert.notEqual(stored.password_hash,body.newPassword);assert.equal(JSON.stringify(stored).includes(body.newPassword),false);
 assert.deepEqual(await (await call('/api/admin/me',null,oldCookie,'GET')).json(),{authenticated:false});assert.equal((await call('/api/admin/projects',null,oldCookie,'GET')).status,401);
 assert.equal((await call('/api/admin/login',{password:env.ADMIN_PASSWORD})).status,401);
 const newLogin=await call('/api/admin/login',{password:body.newPassword});assert.equal(newLogin.status,200);const newCookie=newLogin.headers.get('set-cookie').split(';')[0];assert.deepEqual(await (await call('/api/admin/me',null,newCookie,'GET')).json(),{authenticated:true});
 assert.equal((await call('/api/admin/password',body,oldCookie)).status,401);db.close();
});
