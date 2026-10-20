import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './helpers/mail-fixture.js';
test('inbox project choices cover all feedback regardless of page, search or status and exclude empty projects',async()=>{
 const f=fixture();
 f.sql.exec("INSERT INTO projects(id,slug,name) VALUES('older','older','较早反馈项目'),('empty','empty','无反馈项目')");
 const add=f.sql.prepare("INSERT INTO tickets(id,number,project_id,kind,title,body,access_hash,updated_at) VALUES(?,?,?,'feedback','描述','内容',?,?)");
 for(let n=0;n<51;n++)add.run(crypto.randomUUID(),'PM20261021'+String(n).padStart(6,'0'),'demo','hash-'+n,'2026-10-21 00:00:00');
 add.run(crypto.randomUUID(),'PM20261020000000','older','old-hash','2026-10-20 00:00:00');
 const cookie=await f.login(),headers={cookie};
 const me=await (await f.call('/api/admin/me',{headers})).json();
 assert.equal(me.snapshot.tickets.length,50);assert.equal(me.snapshot.tickets.some(t=>t.project_slug==='older'),false);
 assert.deepEqual(me.snapshot.feedbackProjects.map(p=>p.slug).sort(),['demo','older']);assert.ok(me.snapshot.projects.some(p=>p.slug==='empty'));
 const filtered=await (await f.call('/api/admin/tickets?limit=1&project=demo&status=closed&q=not-found',{headers})).json();
 assert.equal(filtered.total,0);assert.deepEqual(filtered.feedbackProjects.map(p=>p.slug).sort(),['demo','older']);
});
