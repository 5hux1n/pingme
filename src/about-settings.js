import { personal as initialPersonal } from '../public/about-data.js';
export const aboutDefaults={...initialPersonal,homeUrl:'https://mjh.im',homeLabel:'前往个人主页',feedbackLabel:'返回项目反馈',contactTitle:'联系我',communityTitle:'社交账号',sitesTitle:'个人站点',supportTitle:'支持开发',supportText:'通过以下方式支持我的项目，您的支持是我最大的动力。'};
const icons=new Set(['binance','okx','alipay','coffee','douyin','email','github','nodeseek','paypal','qq','rss','telegram','website','wechat','whatsapp','weibo','xiaohongshu','bilibili','homepage','apt','x']);
function text(value,max,label,required=false){if(typeof value!=='string'||value.length>max)throw Error(label+'格式或长度不正确');const result=value.trim();if(required&&!result)throw Error('请填写'+label);return result;}
function validUrl(value,{image=false,relative=false,mail=false}={}){
 if(!value)return true;if(/[\u0000-\u0020\\]/.test(value))return false;
 if(relative&&value.startsWith('/')&&!value.startsWith('//'))return true;
 try{const u=new URL(value);if(mail&&u.protocol==='mailto:')return !!u.pathname&&u.pathname.includes('@');return (image?u.protocol==='https:':['https:','http:'].includes(u.protocol))&&!!u.hostname&&!u.username&&!u.password;}catch{return false;}
}
export function normalizeAbout(raw){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('关于页面配置格式错误');
 const result={};
 for(const [key,max,label,required] of [['name',80,'显示名称',true],['bio',500,'个人简介'],['avatar',1000,'头像地址',true],['homeUrl',1000,'个人主页地址'],['homeLabel',40,'主页入口文案',true],['feedbackLabel',40,'返回反馈文案',true],['contactTitle',40,'联系方式标题',true],['communityTitle',40,'社交账号标题',true],['sitesTitle',40,'个人站点标题',true],['supportTitle',40,'支持开发标题',true],['supportText',300,'支持开发说明']])result[key]=text(raw[key],max,label,required);
 if(!validUrl(result.avatar,{image:true,relative:true})||!validUrl(result.homeUrl))throw Error('头像请使用站内路径或 HTTPS 地址；主页请使用 HTTP / HTTPS 地址');
 for(const key of ['contacts','communities','sites','support']){
  if(!Array.isArray(raw[key])||raw[key].length>20)throw Error('每个分组最多配置 20 个条目');
  result[key]=raw[key].map(item=>{
   if(!item||typeof item!=='object'||Array.isArray(item))throw Error('条目格式错误');
   const mode=item.mode||(item.qr?'qr':item.href?'link':'copy');
   if(!(key==='support'?['link','qr']:['link','copy']).includes(mode))throw Error('条目操作方式不正确');
   const out={platform:text(item.platform,60,'平台名称',true),value:text(item.value??'',200,'账号或说明'),icon:text(item.icon,20,'图标',true),visible:item.visible!==false,mode};
   if(!icons.has(out.icon))throw Error('请选择支持的图标');
   if(mode==='link'){out.href=text(item.href??'',1000,'链接地址',true);if(!validUrl(out.href,{mail:key!=='support'}))throw Error('链接必须使用 HTTP、HTTPS 或邮箱 mailto 地址');out.action=text(item.action??'',60,'链接操作文案');}
   if(mode==='copy'){if(!out.value)throw Error('复制条目需要填写账号或内容');out.copy=true;}
   if(mode==='qr'){out.qr=text(item.qr??'',1000,'二维码地址',true);if(!validUrl(out.qr,{image:true,relative:true}))throw Error('二维码请使用站内路径或 HTTPS 地址');out.scanner=text(item.scanner??'',40,'扫码应用',true);out.download=text(item.download??'',100,'下载文件名').replace(/[\/\\]/g,'_')||out.platform+'.png';}
   return out;
  });
 }
 return result;
}
export async function readAbout(env){const row=await env.DB.prepare("SELECT value,version FROM site_settings WHERE key='about'").first();return {personal:row?JSON.parse(row.value):structuredClone(aboutDefaults),version:row?.version||0};}
export function publicAbout(personal){return {...personal,...Object.fromEntries(['contacts','communities','sites','support'].map(key=>[key,personal[key].filter(item=>item.visible!==false)]))};}
