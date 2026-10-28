import test from 'node:test';
import assert from 'node:assert/strict';
import {renderFeedbackMail} from '../src/mail-template.js';
const sample={heading:'用户补充了反馈',projectName:'闲鱼助手',number:'PM-20261019-DEMO01',status:'沟通中',previousStatus:'沟通中',statusCode:'progress',body:'插件版本：V3.1.2+2\n目前可以正常使用。',attachments:[],link:'https://pingme.pm/admin',admin:true,userEmail:'user@example.com'};
const links=[{label:'闲鱼助手 官网',value:'xianyu.example.com',href:'https://xianyu.example.com/',primary:true},{label:'个人主页',value:'mjh.im',href:'https://mjh.im'},{label:'TG 频道',value:'@junhongdev',href:'https://t.me/junhongdev'}];

test('mail subject stays short and does not repeat an auto-generated feedback excerpt',()=>{
 const output=renderFeedbackMail(sample);assert.equal(output.subject,'[PingMe] 【闲鱼助手】用户补充了反馈');assert.ok(!output.subject.includes(sample.number));assert.ok(!output.subject.includes('插件版本'));
 assert.ok(output.html.includes('在后台处理'));assert.equal(output.html.match(/href="https:\/\/pingme.pm\/admin"/g).length,2);assert.ok(output.html.includes('v:roundrect'));
 assert.match(output.text,/目前可以正常使用/);assert.match(output.text,/在后台处理：https:\/\/pingme.pm\/admin/);
});
test('user content and attachment notes are escaped, and contact is role-scoped',()=>{
 const output=renderFeedbackMail({...sample,body:'<img src=x onerror=alert(1)>\n第二行',attachmentNote:'日志<&>已随信附上'});assert.ok(!output.html.includes('<img src=x'));assert.ok(output.html.includes('&lt;img'));assert.ok(output.html.includes('<br>第二行'));assert.ok(output.html.includes('日志&lt;&amp;&gt;已随信附上'));assert.ok(!output.html.includes('/api/attachments/'));
 assert.ok(output.html.includes('user@example.com'));assert.ok(output.html.includes(sample.number));assert.ok(output.html.includes('状态：已完结'));
 const visitor=renderFeedbackMail({...sample,admin:false});assert.ok(!visitor.html.includes('user@example.com'));assert.ok(!visitor.text.includes('user@example.com'));assert.ok(!visitor.html.includes('回复第一行'));assert.ok(!visitor.html.includes(sample.number));assert.ok(!visitor.text.includes(sample.number));
 assert.throws(()=>renderFeedbackMail({...sample,link:'javascript:alert(1)'}));
 assert.throws(()=>renderFeedbackMail({...sample,admin:false,links:[{label:'x',href:'javascript:alert(1)'}]}));
});
test('status-only messages show the transition and a friendly default line',()=>{
 const output=renderFeedbackMail({...sample,admin:false,heading:'反馈状态更新',status:'待解决',previousStatus:'沟通中',statusCode:'resolved',body:''});
 assert.match(output.text,/当前状态：待解决（之前：沟通中）/);assert.match(output.text,/开发者已将这条反馈标记为“待解决”/);assert.ok(output.html.includes('pm-bar-on'));assert.ok(!output.html.includes('undefined'));
 const closed=renderFeedbackMail({...sample,admin:false,heading:'反馈状态更新',status:'不受理',previousStatus:'待审核',statusCode:'closed',body:''});
 assert.match(closed.text,/回复这封邮件即可重新提交审核/);assert.ok(closed.html.includes('pm-c-closed'));
});
test('inline pictures use CID and fluid width without exposing private URLs',()=>{
 const output=renderFeedbackMail({...sample,images:[{contentId:'feedback-image-0',width:295,height:640},{contentId:'evil"><script>',width:10,height:10}]});
 assert.ok(output.html.includes('src="cid:feedback-image-0"'));assert.ok(output.html.includes('width="295" height="640"'));assert.ok(output.html.includes('max-width:100%;height:auto;max-height:640px'));assert.ok(!output.html.includes('<script>'));
});
test('all five notification types use their own subjects',()=>{
 const subjects={
  '收到新反馈':'[PingMe] 【闲鱼助手】收到一条新反馈',
  '用户补充了反馈':'[PingMe] 【闲鱼助手】用户补充了反馈',
  '反馈已提交':'[PingMe] 已收到您关于【闲鱼助手】的反馈',
  '开发者回复了反馈':'[PingMe] 【闲鱼助手】开发者回复了您的反馈',
  '反馈状态更新':'[PingMe] 【闲鱼助手】您的反馈状态已更新'
 };
 for(const [heading,subject] of Object.entries(subjects))assert.equal(renderFeedbackMail({...sample,heading}).subject,subject);
 assert.ok(!/[\r\n]/.test(renderFeedbackMail({...sample,projectName:'项目\r\nBcc: test'}).subject));
});
test('follow-up links appear only in visitor mail',()=>{
 const visitor=renderFeedbackMail({...sample,admin:false,heading:'开发者回复了反馈',links});
 assert.ok(visitor.html.includes('关注更新'));assert.ok(visitor.html.includes('href="https://xianyu.example.com/"'));assert.ok(visitor.html.includes('@junhongdev'));assert.match(visitor.text,/TG 频道  https:\/\/t.me\/junhongdev/);
 const fallback=renderFeedbackMail({...sample,admin:false,heading:'开发者回复了反馈'});assert.ok(fallback.html.includes('apt.mjh.im'));
 const none=renderFeedbackMail({...sample,admin:false,heading:'开发者回复了反馈',links:[]});assert.ok(!none.html.includes('关注更新'));
 const admin=renderFeedbackMail({...sample,links});assert.ok(!admin.html.includes('关注更新'));
});
