import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/worker.js';
test('admin login issues a valid HMAC session cookie', async () => {
  const env = { ADMIN_PASSWORD: 'test-password', SESSION_SECRET: 'unit-test-session-secret', DB: { prepare() { return { bind() { return this; }, async run() { return {}; }, async first() { return { count: 1 }; } }; } } };
  const login = await worker.fetch(new Request('https://pingme.pm/api/admin/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: env.ADMIN_PASSWORD }) }), env);
  assert.equal(login.status, 200);
  const cookie = login.headers.get('set-cookie');
  assert.match(cookie, /HttpOnly; Secure; SameSite=Strict/);
  const auth = await worker.fetch(new Request('https://pingme.pm/api/admin/me', { headers: { cookie: cookie.split(';')[0] } }), env);
  assert.deepEqual(await auth.json(), { authenticated: true });
});
