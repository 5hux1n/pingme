const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const lines=value=>escape(value).replace(/\r\n?/g,'\n').replace(/\n/g,'<br>');
const url=value=>{const u=new URL(value);if(!['https:','http:'].includes(u.protocol)||u.username||u.password)throw Error('Invalid mail link');return u.href;};

// Ordinary correspondence, with the latest message ahead of supporting metadata.
export function renderFeedbackMail({heading,projectName,number,status,previousStatus,statusCode,body='',images=[],attachmentNote='',link,admin=false,userEmail='',preview=false}){
 link=url(link);const logo=new URL('/brand/pingme-mail.png',link).href;
 const transition=previousStatus&&previousStatus!==status?previousStatus+' → '+status:status;
 const project=String(projectName||'PingMe'),subject='[PingMe] '+Array.from(project.replace(/[\r\n]+/g,' ')).slice(0,60).join('')+' · 反馈交流';
 const replyHint=admin?'直接回复此邮件即可答复用户。':'您可以直接回复此邮件进行补充反馈信息或者提供附件。邮件内容会追加到反馈记录。';
 const commandHint=admin?'需同时更新状态时，在回复首行填写“状态：已完结”。':'';
 const contact=admin&&userEmail?'用户邮箱：'+userEmail:'';
 const note=preview?'演示邮件，未创建或修改反馈记录。':'';
 const content=body||'您的反馈记录已由开发者把状态更新为“'+status+'”，感谢您的反馈记录！';
 const action='查看反馈详情';
 const reference=admin&&number?'参考编号：'+number:'';
 const text=[project+' · '+heading,'当前状态：'+status,content,contact,images.length?'图片请在邮件正文或反馈页面中查看。':'',attachmentNote,action+'：'+link,replyHint,commandHint,reference,'PingMe · 请勿转发此邮件。',note].filter(Boolean).join('\n\n');
 const preheader=project+' · '+transition+' · '+content.replace(/\s+/g,' ').slice(0,90);
 const html=`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(heading)}</title></head>
<body style="margin:0;padding:0;width:100%;background-color:#ffffff;color:#252a30;font-family:-apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',Arial,sans-serif;-webkit-text-size-adjust:100%">
<div style="display:none!important;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all">${escape(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse"><tr><td align="center" style="padding:28px 22px">
<!--[if mso]><table role="presentation" width="580" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:580px;border-collapse:collapse;text-align:left"><tr><td style="word-break:break-word">
<p style="margin:0 0 22px"><img src="${escape(logo)}" alt="PingMe" width="120" height="32" style="display:block;width:120px;height:32px;border:0"></p>
<p style="margin:0 0 22px;font-size:13px;line-height:1.8;color:#747b83"><strong style="color:#252a30;font-size:15px">${escape(project)}</strong> · ${escape(heading)}<br><span style="display:inline-block;margin-top:8px;padding:2px 8px;border-radius:5px;background:#f0f3f6;color:#465564;font-size:12px;line-height:22px">当前状态：${escape(status)}</span></p>
<div style="font-size:16px;line-height:1.9;color:#252a30;overflow-wrap:anywhere;word-break:break-word">${lines(content)}</div>
${images.filter(image=>/^feedback-image-\d+$/.test(image.contentId)).map(image=>`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;table-layout:fixed;border-collapse:collapse;margin-top:18px"><tr><td align="left" style="padding:0"><img src="cid:${image.contentId}" alt="反馈图片" width="${image.width}"${image.height?` height="${image.height}"`:''} style="display:block;width:${image.width}px;max-width:100%;height:auto;max-height:640px;object-fit:contain;border:0"></td></tr></table>`).join('')}
${attachmentNote?`<p style="margin:18px 0 0;font-size:12px;line-height:1.8;color:#747b83">${escape(attachmentNote)}</p>`:''}
${contact?`<p style="margin:24px 0 0;font-size:12px;line-height:21px;color:#747b83;word-break:break-word">用户邮箱：<a href="mailto:${escape(encodeURIComponent(userEmail))}" style="color:#747b83;text-decoration:none">${escape(userEmail)}</a></p>`:''}
<p style="margin:20px 0 0;font-size:14px;line-height:1.8"><a href="${escape(link)}" style="display:inline-block;background:#263b50;border:1px solid #263b50;border-radius:5px;color:#ffffff;font-size:14px;line-height:22px;padding:10px 18px;text-align:center;text-decoration:none;mso-padding-alt:10px 18px">${action}</a></p>
<p style="margin:22px 0 0;font-size:12px;line-height:1.8;color:#747b83">${escape(replyHint)}${commandHint?'<br>'+escape(commandHint):''}</p>
<p style="margin:24px 0 0;font-size:11px;line-height:1.8;color:#8a9097">${reference?escape(reference)+'<br>':''}PingMe · 请勿转发此邮件。${note?'<br>'+escape(note):''}</p>
</td></tr></table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr></table></body></html>`;
 return {subject,text,html};
}
