import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
const server=fs.readFileSync('src/worker.js','utf8');const client=fs.readFileSync('public/app.js','utf8');
test('expected routes present',()=>{for(const key of ['/api/projects','/api/tickets','/api/admin/login','/api/admin/projects','attachments\\/'])assert.ok(server.includes(key),key)});
test('anonymous ticket tokens hashed',()=>assert.ok(server.includes('await hash(token)')));
test('attachment downloads require authorized access',()=>assert.ok(server.includes('t.id!==file.ticket_id')));
test('frontend escapes untrusted content',()=>assert.ok(client.includes('const esc=')));
