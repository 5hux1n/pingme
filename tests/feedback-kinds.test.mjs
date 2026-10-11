import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/worker.js';
test('feedback API stores the new categories and accepts existing clients', async () => {
  for (const kind of ['bug','unavailable','update','suggestion','idea','question','other','invalid']) {
    let storedKind;
    const env = { TURNSTILE_REQUIRED: 'false', DB: { prepare(sql) { return { bind(...args) { if(sql.startsWith('INSERT INTO tickets')) storedKind=args[3];return this; }, async first() { return sql.includes('FROM rate_limits')?{count:1}:{id:'codexm',slug:'codexm',name:'CodexM'}; }, async run() { return {success:true}; } }; } } };
    const form = new FormData();for(const [name,value] of Object.entries({project:'codexm',kind,title:'Feedback title',body:'Detailed feedback'}))form.set(name,value);
    const response=await worker.fetch(new Request('https://pingme.pm/api/tickets',{method:'POST',body:form}),env);
    assert.equal(response.status,kind==='invalid'?400:201,kind);
    assert.equal(storedKind,kind==='invalid'?undefined:kind);
  }
});
