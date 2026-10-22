import {formatBeijingTime} from './time.js?v=20261019-beijing-time';
import {feedbackFiles} from './feedback-media.js?v=20261019-feedback-files';
import { createAdmin } from './admin.js?v=20261022-site-logos';
const root=document.getElementById('app');
const state={projects:[],categories:[]};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const $=(sel)=>root.querySelector(sel);
async function api(path,opts={}){const r=await fetch('/api'+path,{credentials:'same-origin',...opts});let data;try{data=await r.json()}catch{throw Error('服务暂时不可用')}if(!r.ok){const error=Error(data.error||'请求失败');error.status=r.status;throw error;}return data;}
const go=p=>{if(location.pathname.startsWith('/admin')&&!admin.leave())return;history.pushState({},'',p);render()};
window.addEventListener('popstate',()=>render());
const brand=()=>`<span class="brand-logo"><img class="brand-light" src="/brand/pingme-wordmark.svg" alt="pingme." width="112" height="50"/></span>`;
function nav(){return `<div class="shell"><header class="nav"><a href="/" class="logo" data-link aria-label="PingMe 首页">${brand()}</a><div class="navright"><a href="/" data-link>首页</a><a href="/about" data-link class="quiet">联系</a><a href="https://shuxin.my/" target="_blank" rel="noopener noreferrer" class="quiet">博客</a></div></header></div>`;}
function layout(html){root.innerHTML=(html.includes('id="management"')?'':nav())+html;root.querySelectorAll('[data-link]').forEach(a=>a.onclick=e=>{e.preventDefault();go(new URL(a.href).pathname)});}

const glyph=p=>p.image_url?`<img class="glyph project-icon" src="${esc(p.image_url)}" alt="" width="44" height="44" decoding="async"/>`:`<span class="glyph" style="background:var(--primary)">${esc(p.name?.slice(0,1)||'P')}</span>`;
const projectCard=p=>`<button type="button" class="project-entry project" data-project="${esc(p.slug)}" aria-label="向 ${esc(p.name)} 提交反馈">${glyph(p)}<span><span class="projectname">${esc(p.name)}</span>${p.description?`<span class="projectdesc" style="display:block">${esc(p.description)}</span>`:''}</span><span class="arrow" aria-hidden="true">→</span></button>`;
function home(){layout(`<main class="shell project-directory"><section class="directory-intro"><div><h1>项目反馈</h1><p>选择项目，提交问题、功能建议或使用疑问。</p></div></section><section class="directory-projects" aria-label="项目选择"><div class="directory-toolbar"><div class="project-categories" role="group" aria-label="项目分类"><button type="button" data-category="all" aria-pressed="true">全部</button>${state.categories.map(c=>`<button type="button" data-category="${esc(c.id)}" aria-pressed="false">${esc(c.name)}</button>`).join('')}</div><div class="directory-search"><div class="search-morph" data-expanded="false" data-ready="false"><button type="button" class="search-trigger" aria-label="搜索项目" aria-controls="projectSearch" aria-expanded="false"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4.5 4.5"/></svg></button><label class="search-input-label"><span class="sr-only">搜索项目</span><input id="projectSearch" type="search" placeholder="搜索项目名称或功能" autocomplete="off"/></label></div></div></div><div id="projectResults"></div></section></main><footer class="shell foot"><span>Powered by <a href="https://github.com/5hux1n/Pingme" target="_blank" rel="noopener noreferrer">PingMe.PM</a></span></footer>`);
 let category='all';
 const update=()=>{
  const query=$('#projectSearch').value.trim().toLowerCase();
  const projects=state.projects.filter(p=>(category==='all'||p.category===category)&&[p.name,p.description,p.slug,p.official_url].join(' ').toLowerCase().includes(query));
  const groups=state.categories.map(c=>({...c,items:projects.filter(p=>p.category===c.id)})).filter(c=>c.items.length);
  $('#projectResults').innerHTML=groups.map(c=>`<section class="directory-group"><div class="directory-group-heading"><h2>${esc(c.name)}</h2><span>${c.items.length} 个项目</span></div><div class="project-grid">${c.items.map(projectCard).join('')}</div></section>`).join('')||`<div class="empty-projects"><h3>${query?'未找到匹配项目':'暂无开放项目'}</h3><p>${query?'换个关键词，或选择其他分类。':'请稍后再来查看。'}</p></div>`;
  $('#projectResults').querySelectorAll('[data-project]').forEach(button=>button.onclick=()=>go('/'+button.dataset.project));
  $('#projectResults').querySelectorAll('[data-link]').forEach(link=>link.onclick=e=>{e.preventDefault();go(new URL(link.href).pathname)});
 };
 const search=$('.search-morph'),searchInput=$('#projectSearch'),searchTrigger=$('.search-trigger');
 let revealTimer;
 const revealSearch=()=>{if(search.isConnected&&search.dataset.expanded==='true')search.dataset.ready='true';};
 const openSearch=()=>{
  if(search.dataset.expanded==='true'){searchInput.focus();return;}
  clearTimeout(revealTimer);search.dataset.expanded='true';searchTrigger.setAttribute('aria-expanded','true');
  searchInput.focus();
  if(matchMedia('(prefers-reduced-motion: reduce)').matches)revealSearch();
  else revealTimer=setTimeout(revealSearch,400);
 };
 const closeSearch=()=>{
  clearTimeout(revealTimer);search.dataset.ready='false';search.dataset.expanded='false';searchTrigger.setAttribute('aria-expanded','false');
 };
 searchTrigger.onclick=()=>{if(search.dataset.expanded==='true'){searchInput.value='';update();closeSearch();}else openSearch();};
 search.addEventListener('transitionend',event=>{if(event.target===search&&event.propertyName==='width')revealSearch();});
 search.addEventListener('focusout',event=>{if(!search.contains(event.relatedTarget)&&!searchInput.value.trim())closeSearch();});
 searchInput.addEventListener('keydown',event=>{
  if(event.key==='Escape'&&matchMedia('(min-width:661px)').matches){event.preventDefault();searchInput.value='';update();closeSearch();searchTrigger.focus();}
 });
 searchInput.oninput=update;
 root.querySelectorAll('[data-category]').forEach(button=>button.onclick=()=>{category=button.dataset.category;root.querySelectorAll('[data-category]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));update();});
 update();
}
function appFace(item,showAccount=false){return `<span class="app-icon" data-icon="${esc(item.icon)}" style="--contact-icon:url('/icons/${esc(item.icon)}.svg')" aria-hidden="true"></span><span class="app-name">${esc(item.platform)}</span>${showAccount?`<span class="app-account">${esc(item.value)}</span>`:''}`;}
function personalApp(item,showAccount=false){
 const external=/^https?:\/\//.test(item.href||'');
 const face=appFace(item,showAccount);
 const tile=item.href?`<a class="app-tile" href="${esc(item.href)}" ${external?'target="_blank" rel="noopener noreferrer"':''} aria-label="${esc(item.action||'访问')} ${esc(item.platform)}" title="${esc(item.value)}">${face}</a>`:`<button class="app-tile" type="button" data-copy="${esc(item.value)}" aria-label="复制${esc(item.platform)}" title="点击复制 ${esc(item.value)}">${face}</button>`;
 return `<div class="app-slot">${tile}</div>`;
}
async function about(){
 let personal;try{personal=(await api('/about')).personal;}catch(e){if(location.pathname==='/about')layout(`<main class="shell center"><h1>关于页面暂时无法加载</h1><p>${esc(e.message)}</p><a href="/about">重新加载</a></main>`);return;}if(location.pathname!=='/about')return;
 layout(`<main class="shell personal-page"><aside class="personal-profile"><img class="personal-avatar" src="${esc(personal.avatar)}" alt="${esc(personal.name)} 的头像" width="96" height="96"/><h1>${esc(personal.name)}</h1><p class="personal-bio">${esc(personal.bio)}</p>${personal.homeUrl?`<a class="profile-home" href="${esc(personal.homeUrl)}" target="_blank" rel="noopener noreferrer">${esc(personal.homeLabel)}</a>`:''}<a class="profile-feedback" href="/" data-link>${esc(personal.feedbackLabel)} <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex:none"><path d="m9 14-5-5 5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-2"/></svg></a></aside><div class="personal-sections"><section class="personal-section" aria-labelledby="contact-heading"><h2 id="contact-heading">${esc(personal.contactTitle)}</h2><div class="app-grid">${personal.contacts.map(item=>personalApp(item,true)).join('')}</div><p class="copy-status" id="copyStatus" role="status" aria-live="polite"></p></section><section class="personal-section" aria-labelledby="community-heading"><h2 id="community-heading">${esc(personal.communityTitle)}</h2><div class="app-grid">${personal.communities.map(item=>personalApp(item,true)).join('')}</div></section><section class="personal-section" aria-labelledby="sites-heading"><h2 id="sites-heading">${esc(personal.sitesTitle)}</h2><div class="app-grid">${personal.sites.map(item=>personalApp(item)).join('')}</div></section><section class="personal-section support-section" aria-labelledby="support-heading"><div class="support-heading"><h2 id="support-heading">${esc(personal.supportTitle)}</h2><p>${esc(personal.supportText)}</p></div><div class="app-grid support-grid">${personal.support.map((item,index)=>`<${item.qr?`button type="button" data-appreciation="${index}"`:'a'} class="app-tile support-link" ${item.qr?`aria-label="查看${esc(item.platform)}码"`:`href="${esc(item.href)}" target="_blank" rel="noopener noreferrer" aria-label="访问 ${esc(item.platform)}"`}>${appFace(item)}</${item.qr?'button':'a'}>`).join('')}</div></section></div><dialog id="appreciationDialog" class="appreciation-dialog" aria-labelledby="appreciation-title"><div class="appreciation-content"><header><h2 id="appreciation-title"></h2><button type="button" id="closeAppreciation" aria-label="关闭收款码">✕</button></header><img id="paymentCode" alt="" width="530" height="530"/><p id="paymentInstruction"></p><a id="savePaymentCode" class="outline">保存收款码</a></div></dialog></main><footer class="shell foot"><span>Powered by <a href="https://github.com/5hux1n/Pingme" target="_blank" rel="noopener noreferrer">PingMe.PM</a></span></footer>`);
 const dialog=$('#appreciationDialog');
 root.querySelectorAll('[data-appreciation]').forEach(button=>button.onclick=()=>{
  const item=personal.support[Number(button.dataset.appreciation)];
  $('#appreciation-title').textContent=item.platform;
  const image=$('#paymentCode');image.src=item.qr;image.alt=personal.name+' 的'+item.platform+'码';image.width=item.scanner==='支付宝'?950:530;image.height=image.width;
  $('#paymentInstruction').textContent='使用'+item.scanner+'扫一扫，或保存图片后在'+item.scanner+'中识别。';
  const save=$('#savePaymentCode');save.href=item.qr;save.download=item.download;save.textContent=item.scanner==='微信'?'保存赞赏码':'保存收款码';
  dialog.showModal();
 });
 $('#closeAppreciation').onclick=()=>dialog.close();dialog.onclick=e=>{if(e.target===dialog)dialog.close()};
 root.querySelectorAll('[data-copy]').forEach(button=>button.onclick=async()=>{
  try{await navigator.clipboard.writeText(button.dataset.copy);button.dataset.copied='true';const label=button.querySelector('[data-copy-label]');if(label)label.textContent='已复制';$('#copyStatus').textContent='已复制 '+button.dataset.copy;setTimeout(()=>{if(button.isConnected){delete button.dataset.copied;if(label)label.textContent='复制地址'}},1800);}
  catch{$('#copyStatus').textContent='复制失败，请手动选择账号复制。';}
 });
}
async function formPage(slug){
 const cached=state.projects.find(project=>project.slug===slug);
 layout(`<main class="shell page"><button class="back" id="goback">← 返回项目选择</button><div id="formArea" class="muted">${cached?'':'正在加载项目…'}</div></main>`);
 $('#goback').onclick=()=>go('/');let p=cached;
 if(!p){const host=$('#formArea');try{p=(await api('/projects/'+encodeURIComponent(slug))).project;}catch(e){if(host.isConnected)host.textContent=e.message;return;}}
 if(location.pathname!=='/'+slug)return;
const projectUrl=p.official_url;
const projectLink=projectUrl?`<a class="project-website" href="${esc(projectUrl)}" target="_blank" rel="noopener noreferrer">${/^https?:\/\/(?:www\.)?github\.com(?:\/|$)/i.test(projectUrl)?'查看 GitHub 仓库':'项目官网'} <span aria-hidden="true">↗</span></a>`:'';
$('#formArea').outerHTML=`<div class="formgrid"><aside class="aside">${glyph(p)}<h1>${esc(p.name)}</h1><p>${esc(p.description)}</p>${projectLink}</aside><div class="formbody"><h2>提交反馈</h2><form id="feedbackForm"><input type="hidden" name="project" value="${esc(p.slug)}"/><div class="field"><label for="email">邮箱 *</label><input id="email" name="email" type="email" required autocomplete="email" maxlength="254" placeholder="用于接收提交回执和后续回复"/><small>提交后可直接回复邮件继续交流，也可通过私密链接查看反馈。</small></div><div class="field"><label for="body">描述 *</label><small id="feedbackDescriptionHelp" class="form-description-help">请尽可能写清楚您的手机型号、系统版本、越狱环境、App 版本、插件版本等信息，最好可以提供截图、录屏、日志文件等，可以更快的解决问题！</small><textarea id="body" name="body" required aria-describedby="feedbackDescriptionHelp" placeholder="请描述遇到的问题、希望增加的功能或改进建议"></textarea></div><div class="field"><label>附件（选填）</label><label class="upload" for="filesInput">↑ &nbsp; 点击选择文件，或拖拽、粘贴截图<br><small>图片、视频、日志、ZIP、PDF · 最多 5 个 · 每个 10MB</small><input id="filesInput" type="file" multiple accept=".png,.jpg,.jpeg,.webp,.gif,.heic,.mp4,.mov,.webm,.txt,.log,.crash,.ips,.json,.zip,.pdf"/></label><div class="files" id="fileList"></div></div><div id="formError" role="alert"></div><div class="submitrow"><button class="primary" type="submit">提交反馈</button></div></form></div></div>`;
let files=[];const fileInput=$('#filesInput'),list=$('#fileList');function showFiles(){list.innerHTML=files.map((f,i)=>`<span class="chip">${esc(f.name)} <button type="button" data-remove="${i}" aria-label="删除附件">×</button></span>`).join('');list.querySelectorAll('[data-remove]').forEach(b=>b.onclick=()=>{files.splice(Number(b.dataset.remove),1);showFiles();});}function addFiles(items){for(const f of items){if(files.length>=5)break;if(files.some(x=>x.name===f.name&&x.size===f.size))continue;files.push(f);}showFiles();}fileInput.onchange=()=>{addFiles([...fileInput.files]);fileInput.value=''};const drop=$('.upload');drop.ondragover=e=>e.preventDefault();drop.ondrop=e=>{e.preventDefault();addFiles([...e.dataTransfer.files])};$('#body').onpaste=e=>{const ff=[...e.clipboardData.files];if(ff.length){e.preventDefault();addFiles(ff)}};


$('#feedbackForm').onsubmit=async e=>{e.preventDefault();const btn=$('#feedbackForm button[type=submit]'),error=$('#formError');error.innerHTML='';const data=new FormData(e.target);for(const f of files)data.append('files',f,f.name);btn.disabled=true;btn.textContent='正在提交…';try{const res=await api('/tickets',{method:'POST',body:data});history.replaceState({},'',res.url);success(res.url,res.warning);}catch(ex){error.innerHTML=`<div class="alert">${esc(ex.message)}</div>`;btn.disabled=false;btn.textContent='提交反馈';}};
}
function success(url,warning=''){layout(`<main class="shell center fade"><div class="check">✓</div><h1>反馈已提交</h1><p>反馈已保存，确认邮件正在发送到你填写的邮箱。<br>可直接回复邮件继续交流，也可以保存私密查询链接。</p>${warning?`<p role="alert">${esc(warning)}</p>`:''}<div class="actions"><button class="primary" id="look">查看反馈详情 →</button><button class="outline" id="copy">复制私密链接</button></div></main>`);$('#look').onclick=()=>go(url);$('#copy').onclick=async()=>{await navigator.clipboard.writeText(location.origin+url);$('#copy').textContent='已复制';};}
const statuses={new:'待审核',progress:'沟通中',resolved:'待解决',closed:'不受理',completed:'已完结'};
const roles={visitor:'提交者',admin:'开发者回复',internal:'内部备注',system:'状态变更'};
function detailMarkup(data,token='',admin=false){const t=data.ticket;return `<div><span class="stat">${esc(statuses[t.status]||t.status)}</span><h1>${t.kind==='feedback'?'反馈详情':esc(t.title)}</h1><p class="meta">${esc(t.project_name)} · ${esc(formatBeijingTime(t.created_at,{seconds:true}))}（北京时间） ${t.app_version?' · '+esc(t.app_version):''} ${t.platform?' · '+esc(t.platform):''}</p><div class="contentbox">${esc(t.body)}${feedbackFiles(data.attachments.filter(f=>!f.message_id),token)}</div><h3 style="margin-top:35px">沟通过程</h3>${data.messages.filter(m=>admin||m.role!=='internal').map(m=>`<div class="msg ${esc(m.role)}"><b>${esc(roles[m.role]||m.role)} · ${esc(formatBeijingTime(m.created_at,{seconds:true}))}</b><p>${esc(m.body)}</p>${feedbackFiles(data.attachments.filter(f=>f.message_id===m.id),token)}</div>`).join('')||'<p class="muted">暂无回复</p>'}</div>`;}
async function publicDetail(token){layout(`<main class="shell detail fade"><button class="back" id="goback">← 返回首页</button><div id="dArea">正在加载…</div></main>`);$('#goback').onclick=()=>go('/');try{const data=await api('/t/'+token);if(location.pathname!=='/t/'+token)return;$('#dArea').innerHTML=detailMarkup(data,token)+`<form id="replyForm" style="margin-top:35px"><div class="field"><label>补充说明 / 回复开发者</label>${data.ticket.status==='closed'?'<small>补充新线索后，这条反馈将重新标记为待审核。</small>':''}<textarea name="body" placeholder="还想补充什么？"></textarea></div><div class="field"><label>补充附件（选填）</label><input type="file" name="files" multiple accept=".png,.jpg,.jpeg,.webp,.gif,.heic,.mp4,.mov,.webm,.txt,.log,.crash,.ips,.json,.zip,.pdf"/></div><div id="replyError"></div><button class="primary">发送回复 →</button></form>`;const form=$('#replyForm');if(form)form.onsubmit=async e=>{e.preventDefault();const btn=form.querySelector('button');btn.disabled=true;try{await api('/t/'+token+'/reply',{method:'POST',body:new FormData(form)});publicDetail(token);}catch(ex){$('#replyError').innerHTML=`<div class="alert">${esc(ex.message)}</div>`;btn.disabled=false;}};}catch(ex){$('#dArea').innerHTML=`<div class="alert">${esc(ex.message)}</div>`;}}
const admin = createAdmin({root,api,esc,onCatalogChanged:()=>{publicReady=false;}});
const adminPage=()=>admin.page();
let publicReady=false,publicRequest;
async function loadPublic(){if(publicReady)return;if(!publicRequest)publicRequest=api('/projects').then(p=>{state.projects=p.projects;state.categories=p.categories;publicReady=true;}).finally(()=>publicRequest=null);return publicRequest;}
async function render(){const path=decodeURIComponent(location.pathname);if(path==='/admin'||path.startsWith('/admin/'))return adminPage();if(!publicReady){try{await loadPublic();}catch{state.projects=[];}if(location.pathname!==path)return;}if(path==='/about')return about();if(path.startsWith('/t/'))return publicDetail(path.slice(3));if(path==='/'||path==='/index.html')return home();if(/^\/[a-z0-9-]+$/.test(path))return formPage(path.slice(1));layout('<main class="shell center">页面不存在。 <a href="/" data-link>返回首页</a></main>');}
render();
