import {renderFeedbackMail} from '../src/mail-template.js';
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
const out=process.argv[2]||join(tmpdir(),'pingme-mail-preview');await mkdir(out,{recursive:true});
const base={projectName:'闲鱼助手',number:'PM-20261019-DEMO01',status:'处理中',previousStatus:'处理中',statusCode:'progress',link:'https://pingme.pm/t/Ab7kP2mN9xQ4',attachments:[],userEmail:'user@example.com',preview:true};
const variants={
 'admin-reply':{heading:'用户补充了反馈',body:'插件版本：V3.1.2+2（arm64 / arm64e）\n闪退未再出现，目前可以正常使用。',admin:true,link:'https://pingme.pm/admin'},
 'visitor-reply':{heading:'开发者回复了反馈',body:'此条反馈已处理，状态已更新为“已解决”。如仍有问题，欢迎继续追加说明。感谢您的支持！',status:'已解决',statusCode:'resolved',admin:false},
 'status-only':{heading:'反馈状态更新',body:'',status:'已关闭',statusCode:'closed',admin:false},
 'created':{heading:'反馈已提交',body:'已收到您的反馈，后续答复会发送到此邮箱。\n\n您提交的内容：\n手机型号：iPhone 7 Plus\n系统版本：iOS 15.8.8\n\n进入首页后出现闪退，希望协助排查。',status:'待处理',previousStatus:'待处理',statusCode:'new',admin:false}
};
for(const [name,variant] of Object.entries(variants)){
 const result=renderFeedbackMail({...base,...variant});
 await writeFile(join(out,name+'.html'),result.html);await writeFile(join(out,name+'.json'),JSON.stringify(result,null,2));
}
await writeFile(join(out,'index.html'),'<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>PingMe 邮件模板预览</title><body style="font:16px/2 sans-serif;max-width:600px;margin:40px auto;padding:20px"><h1>邮件模板预览</h1><p>演示内容，不发送通知或写入反馈记录。</p><ul>'+Object.keys(variants).map(name=>'<li><a href="'+name+'.html">'+({'admin-reply':'管理员：用户补充反馈','visitor-reply':'用户：开发者答复','status-only':'用户：仅状态变更','created':'用户：提交成功'}[name])+'</a></li>').join('')+'</ul></body></html>');
console.log('Preview HTML generated in '+out);
