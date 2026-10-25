import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {fixture} from './helpers/mail-fixture.js';
import {THEMES} from '../src/themes.js';

const put=(f,cookie,body,origin='http://localhost')=>f.call('/api/admin/theme',{method:'PUT',headers:{cookie,origin,'content-type':'application/json'},body:JSON.stringify(body)});

test('site starts on the original theme and the public endpoint only exposes asset paths',async()=>{
 const f=fixture();
 const res=await f.call('/api/theme');
 assert.equal(res.status,200);assert.match(res.headers.get('cache-control'),/max-age=30/);
 const {theme}=await res.json();
 assert.deepEqual(theme,{id:'default',themeColor:'#ffffff',css:[],adminCss:[],js:[]});
});

test('admin switches theme with version checks and the change is public immediately',async()=>{
 const f=fixture();const cookie=await f.login();
 const me=await (await f.call('/api/admin/me',{headers:{cookie}})).json();
 assert.equal(me.snapshot.theme.id,'default');assert.equal(me.snapshot.theme.version,0);
 assert.deepEqual(me.snapshot.theme.themes.map(t=>t.id),THEMES.map(t=>t.id));
 assert.equal('css' in me.snapshot.theme.themes[0],false);

 const saved=await put(f,cookie,{id:'glass',version:0});
 assert.equal(saved.status,200);
 const body=await saved.json();
 assert.equal(body.id,'glass');assert.equal(body.version,1);assert.equal(body.assets.id,'glass');assert.ok(body.assets.css.length);
 assert.equal((await (await f.call('/api/theme')).json()).theme.id,'glass');

 assert.equal((await put(f,cookie,{id:'default',version:0})).status,409,'stale first save is rejected');
 assert.equal((await put(f,cookie,{id:'default',version:5})).status,409,'stale version is rejected');
 const back=await put(f,cookie,{id:'default',version:1});
 assert.equal(back.status,200);assert.equal((await back.json()).version,2);
 assert.equal((await (await f.call('/api/theme')).json()).theme.id,'default');
});

test('theme writes need a session, same origin and a known theme',async()=>{
 const f=fixture();const cookie=await f.login();
 assert.equal((await put(f,'',{id:'glass',version:0})).status,401);
 assert.equal((await put(f,cookie,{id:'glass',version:0},'https://evil.example')).status,403);
 assert.equal((await put(f,cookie,{id:'nope',version:0})).status,400);
 assert.equal((await put(f,cookie,{id:'glass',version:-1})).status,400);
 assert.equal((await (await f.call('/api/theme')).json()).theme.id,'default');
});

test('preview returns any known theme without saving it',async()=>{
 const f=fixture();
 const res=await f.call('/api/theme?preview=glass');
 assert.equal(res.status,200);assert.equal(res.headers.get('cache-control'),'no-store');
 assert.equal((await res.json()).theme.id,'glass');
 assert.equal((await f.call('/api/theme?preview=nope')).status,404);
 assert.equal((await (await f.call('/api/theme')).json()).theme.id,'default');
});

test('an unknown saved theme falls back to the original instead of breaking pages',async()=>{
 const f=fixture();
 f.sql.exec(`INSERT INTO site_settings(key,value,version) VALUES('theme','{"id":"removed"}',3)`);
 assert.equal((await (await f.call('/api/theme')).json()).theme.id,'default');
});

test('every theme file listed in the registry exists',()=>{
 for(const t of THEMES)for(const href of [...t.css,...t.adminCss,...t.js]){
  assert.match(href,/^\/themes\/[a-z0-9-]+\/[a-z0-9.-]+\.(css|js)\?v=[A-Za-z0-9.-]+$/);
  assert.ok(existsSync(new URL('../public'+href.split('?')[0],import.meta.url)),href);
 }
});
