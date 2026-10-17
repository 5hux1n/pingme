import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
test('mail migration preserves existing feedback and does not invent addresses or send history',()=>{
 const db=new DatabaseSync(':memory:');db.exec("CREATE TABLE projects(id TEXT PRIMARY KEY);INSERT INTO projects VALUES('old-project');CREATE TABLE tickets(id TEXT PRIMARY KEY,number TEXT,project_id TEXT,contact TEXT,status TEXT,access_hash TEXT);INSERT INTO tickets VALUES('legacy','PM-OLD','old-project','原联系方式','resolved','existing-private-hash');");
 db.exec(readFileSync(new URL('../migrations/20261018-mail-conversations.sql',import.meta.url),'utf8'));
 const old=db.prepare('SELECT * FROM tickets').get();assert.equal(old.status,'resolved');assert.equal(old.access_hash,'existing-private-hash');assert.equal(old.contact,'原联系方式');assert.equal(old.email,'');assert.equal(old.revision,0);assert.equal(db.prepare('SELECT count(*) n FROM notification_jobs').get().n,0);assert.equal(db.prepare('SELECT count(*) n FROM mail_threads').get().n,0);
 db.close();
});
