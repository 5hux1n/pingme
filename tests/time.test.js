import test from 'node:test';
import assert from 'node:assert/strict';
import {formatBeijingTime as time} from '../public/time.js';
test('SQLite UTC timestamps convert to Beijing time including date and year rollover',()=>{
 assert.equal(time('2026-10-19 00:36:34'),'2026-10-19 08:36');
 assert.equal(time('2026-12-31 20:17:31',{seconds:true}),'2027-01-01 04:17:31');
 assert.equal(time('2026-10-18 16:00:00'),'2026-10-19 00:00');
});
test('explicit offsets are respected without applying UTC conversion twice',()=>{
 assert.equal(time('2026-10-19T00:36:34Z'),'2026-10-19 08:36');
 assert.equal(time('2026-10-19T08:36:34+08:00'),'2026-10-19 08:36');
 assert.equal(time('2026-10-19T02:36:34+02:00'),'2026-10-19 08:36');
 for(const value of ['',null,undefined,'invalid'])assert.equal(time(value),'');
});
