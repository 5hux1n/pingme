import test from 'node:test';
import assert from 'node:assert/strict';
import {renderFeedbackMail} from '../src/mail-template.js';
const sample={heading:'用户补充了反馈',projectName:'闲鱼助手',number:'PM-20261019-DEMO01',status:'沟通中',previousStatus:'沟通中',statusCode:'progress',body:'插件版本：V3.1.2+2\n目前可以正常使用。',attachments:[],link:'https://pingme.pm/admin',admin:true,userEmail:'user@example.com'};
test('mail subject stays short and does not repeat an auto-generated feedback excerpt',()=>{
 const output=renderFeedbackMail(sample);assert.equal(output.subject,'[Pingme] 收到一条关于【闲鱼助手】的反馈补充。');assert.ok(!output.subject.includes(sample.number));assert.ok(!output.subject.includes('插件版本'));assert.ok(!output.html.includes('<h1'));assert.ok(output.html.includes('text-decoration:none;mso-padding-alt'));assert.ok(output.html.includes('查看反馈详情'));assert.ok(!output.html.includes('反馈摘要：'));assert.equal(output.html.match(/href="https:\/\/pingme.pm\/admin"/g).length,1);assert.ok(!output.html.includes('查看完整记录：https://'));assert.match(output.text,/目前可以正常使用/);
});
test('user content and attachment notes are escaped, and contact is role-scoped',()=>{
 const output=renderFeedbackMail({...sample,body:'<img src=x onerror=alert(1)>\n第二行',attachmentNote:'日志<&>已随信附上'});assert.ok(!output.html.includes('<img src=x'));assert.ok(output.html.includes('&lt;img'));assert.ok(output.html.includes('<br>第二行'));assert.ok(output.html.includes('日志&lt;&amp;&gt;已随信附上'));assert.ok(!output.text.includes('/api/attachments/'));assert.ok(!output.html.includes('/api/attachments/'));
 const visitor=renderFeedbackMail({...sample,admin:false});assert.ok(!visitor.html.includes('user@example.com'));assert.ok(!visitor.text.includes('user@example.com'));assert.ok(!visitor.html.includes('回复首行'));assert.ok(!visitor.html.includes(sample.number));assert.ok(!visitor.text.includes(sample.number));
 assert.throws(()=>renderFeedbackMail({...sample,link:'javascript:alert(1)'}));
});
test('status-only messages have a visible transition and need no placeholder message block',()=>{
 const output=renderFeedbackMail({...sample,heading:'反馈状态更新',status:'待解决',previousStatus:'沟通中',statusCode:'resolved',body:''});assert.match(output.text,/当前状态：待解决/);assert.match(output.html,/当前状态：待解决/);assert.match(output.text,/您的反馈记录已由开发者把状态更新为“待解决”，感谢您的反馈记录！/);assert.ok(!output.html.includes('undefined'));assert.ok(!output.html.includes('暂无内容'));
});

test('inline pictures use CID, constrained dimensions and fluid width without exposing private URLs',()=>{
 const output=renderFeedbackMail({...sample,images:[{contentId:'feedback-image-0',width:295,height:640}]});
 assert.ok(output.html.includes('src="cid:feedback-image-0"'));
 assert.ok(output.html.includes('width="295" height="640"'));
 assert.ok(output.html.includes('max-width:100%;height:auto;max-height:640px;object-fit:contain'));
 assert.ok(!output.html.includes('/api/attachments/'));
});

test('all five notification types use their specified real subjects',()=>{
 const subjects={
  '收到新反馈':'[Pingme] 收到一条关于【闲鱼助手】的新反馈。',
  '用户补充了反馈':'[Pingme] 收到一条关于【闲鱼助手】的反馈补充。',
  '反馈已提交':'[Pingme] 已经收到您的反馈，请等待开发者审核处理',
  '开发者回复了反馈':'[Pingme] 您反馈的关于【闲鱼助手】的问题，开发者已经答复了！',
  '反馈状态更新':'[Pingme] 您有一条关于【闲鱼助手】的反馈被开发者调整了状态，请及时查看。'
 };
 for(const [heading,subject] of Object.entries(subjects))assert.equal(renderFeedbackMail({...sample,heading}).subject,subject);
 assert.ok(!/[\r\n]/.test(renderFeedbackMail({...sample,projectName:'项目\r\nBcc: test'}).subject));
});
