import test from 'node:test';
import assert from 'node:assert/strict';
import {STATUS,changeTicket} from '../src/ticket-events.js';
import {parseAdminReply,emailContent} from '../src/mail.js';
import {fixture} from './helpers/mail-fixture.js';
test('all five statuses persist and round-trip through email status commands',async()=>{
 const f=fixture();
 f.sql.prepare("INSERT INTO tickets(id,number,project_id,kind,title,body,email,access_hash) VALUES('status-demo','PM-STATUS','demo','feedback','反馈','描述','user@example.com','status-access')").run();
 assert.deepEqual(Object.values(STATUS),['待审核','沟通中','待解决','不受理','已完结']);
 for(const [status,label] of Object.entries(STATUS)){
  assert.deepEqual(parseAdminReply('状态：'+label+'\n答复内容'),{status,body:'答复内容'});
  const current=f.rows("SELECT * FROM tickets WHERE id='status-demo'")[0];
  const result=await changeTicket(f.env,current,{status,body:'更新为'+label});
  assert.equal(result.ticket.status,status);
  assert.equal(f.rows("SELECT * FROM tickets WHERE id='status-demo'")[0].status,status);
  const event=f.sql.prepare('SELECT * FROM ticket_events WHERE id=?').get(result.eventId);
  const mail=await emailContent(f.env,{...current,project_name:'测试项目',project_slug:'demo'},event,'visitor');
  assert.ok(mail.html.includes('>'+label+'<'));assert.ok(mail.text.includes('当前状态：'+label));
 }
});
