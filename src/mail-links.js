import {readAbout,publicAbout} from './about-settings.js';

// 用户通知邮件底部「关注更新」：项目官网 + 关于页里的个人主页、越狱源、TG 频道。
// 读取失败时返回 undefined，模板会退回内置的个人站点，不影响发信。
const host=href=>{try{return new URL(href).host.replace(/^www\./,'');}catch{return '';}};
const web=href=>{try{const u=new URL(href);return ['https:','http:'].includes(u.protocol)&&!u.username&&!u.password;}catch{return false;}};

export async function loadMailLinks(env,projectSlug,projectName){
 try{
  const [project,{personal}]=await Promise.all([env.DB.prepare('SELECT official_url FROM projects WHERE slug=?').bind(projectSlug).first(),readAbout(env)]);
  const about=publicAbout(personal),links=[],official=project?.official_url;
  if(web(official)&&host(official)!=='pingme.pm')links.push({label:(projectName||'项目')+' 官网',value:host(official),href:official,primary:true});
  const pick=(list,test)=>(list||[]).find(item=>item.mode==='link'&&web(item.href)&&test(item));
  const home=pick(about.sites,item=>item.icon==='homepage'),apt=pick(about.sites,item=>item.icon==='apt'),tg=pick(about.communities,item=>item.icon==='telegram'&&/频道|channel/i.test(item.platform));
  if(home)links.push({label:'个人主页',value:host(home.href),href:home.href});
  if(apt)links.push({label:'越狱源',value:host(apt.href),href:apt.href});
  if(tg)links.push({label:'TG 频道',value:tg.value||host(tg.href),href:tg.href});
  return links;
 }catch{return undefined;}
}
