import test from 'node:test';
import assert from 'node:assert/strict';
import {renderFeedbackMail} from '../src/mail-template.js';
const sample={heading:'用户补充了反馈',projectName:'闲鱼助手',number:'PM-20261019-DEMO01',status:'处理中',previousStatus:'处理中',statusCode:'progress',body:'插件版本：V3.1.2+2\n目前可以正常使用。',attachments:[],link:'https://pingme.pm/admin',admin:true,userEmail:'user@example.com'};
test('mail subject stays short and does not repeat an auto-generated feedback excerpt',()=>{
 const output=renderFeedbackMail(sample);assert.equal(output.subject,'[PingMe] 闲鱼助手 · 反馈交流');assert.ok(!output.subject.includes(sample.number));assert.ok(!output.subject.includes('插件版本'));assert.ok(!output.html.includes('<h1'));assert.ok(!output.html.includes('border-radius'));assert.ok(!output.html.includes('反馈摘要：'));assert.equal(output.html.match(/href="https:\/\/pingme.pm\/admin"/g).length,1);assert.ok(!output.html.includes('查看完整记录：https://'));assert.match(output.text,/目前可以正常使用/);
});
test('user content and attachment notes are escaped, and contact is role-scoped',()=>{
 const output=renderFeedbackMail({...sample,body:'<img src=x onerror=alert(1)>\n第二行',attachmentNote:'日志<&>已随信附上'});assert.ok(!output.html.includes('<img src=x'));assert.ok(output.html.includes('&lt;img'));assert.ok(output.html.includes('<br>第二行'));assert.ok(output.html.includes('日志&lt;&amp;&gt;已随信附上'));assert.ok(!output.text.includes('/api/attachments/'));assert.ok(!output.html.includes('/api/attachments/'));
 const visitor=renderFeedbackMail({...sample,admin:false});assert.ok(!visitor.html.includes('user@example.com'));assert.ok(!visitor.text.includes('user@example.com'));assert.ok(!visitor.html.includes('回复首行'));assert.ok(!visitor.html.includes(sample.number));assert.ok(!visitor.text.includes(sample.number));
 assert.throws(()=>renderFeedbackMail({...sample,link:'javascript:alert(1)'}));
});
test('status-only messages have a visible transition and need no placeholder message block',()=>{
 const output=renderFeedbackMail({...sample,heading:'反馈状态更新',status:'已解决',previousStatus:'处理中',statusCode:'resolved',body:''});assert.match(output.text,/处理中 → 已解决/);assert.match(output.html,/处理中 → 已解决/);assert.ok(!output.html.includes('undefined'));assert.ok(!output.html.includes('暂无内容'));
});
