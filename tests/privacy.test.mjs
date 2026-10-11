import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/worker.js';
test('visitor ticket API excludes internal notes', async () => {
  const env = { DB: { prepare(sql) { return { bind() { return this; }, async first() { return { id: 'ticket', number: 'PM-test', title: 'Feedback', status: 'new' }; }, async all() { return { results: sql.includes('FROM messages') ? [{ id: 'public', role: 'admin', body: 'Public reply' }, { id: 'private', role: 'internal', body: 'Private note' }] : [] }; } }; } } };
  const response = await worker.fetch(new Request('https://pingme.pm/api/t/' + 'a'.repeat(64)), env);
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.deepEqual(payload.messages, [{ id: 'public', role: 'admin', body: 'Public reply' }]);
});
