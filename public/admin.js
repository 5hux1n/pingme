import { createAboutEditor } from './admin-about.js?v=20261014-mobile-page-scroll';
export function createAdmin({root,state,api,jsonOpt,esc,layout,glyph,detailMarkup,statuses}) {
 const $=selector=>root.querySelector(selector);
 const PAGE_SIZE=20;
 let searchTimer,ticketController,projectWorkspace,projectStyles,inboxWorkspace,projectModule;
 const ticketCache=new Map();
 function loadComponents(){if(!projectModule)projectModule=Promise.all([import('./admin-projects.js?v=20261014-mobile-page-scroll'),loadProjectStyles()]).then(([module])=>module).catch(error=>{projectModule=null;throw error;});return projectModule;}
 function prime(snapshot){if(!snapshot)return;state.adminProjects=snapshot.projects;state.categories=snapshot.categories;view.projectsLoaded=true;ticketCache.set('',snapshot.tickets);view.ticketsLoadedAt=Date.now();aboutEditor.prime(snapshot.about);}
 function clearSession(){view.request++;view.ticketRequest++;view.detailRequest++;ticketController?.abort();clearTimeout(searchTimer);state.filterStatus='';state.filterProject='';state.search='';view.projectsLoaded=false;state.adminProjects=[];state.adminTickets=[];ticketCache.clear();aboutEditor.clear();}
 function ticketKey(){return new URLSearchParams({status:state.filterStatus,project:state.filterProject,q:state.search}).toString();}
 function cachedTickets(){return ticketCache.get(ticketKey())??(!state.filterStatus&&!state.filterProject&&!state.search?ticketCache.get(''):undefined);}
 function loadProjectStyles(){if(!projectStyles)projectStyles=new Promise((resolve,reject)=>{const link=document.createElement('link');link.rel='stylesheet';link.href='/admin-projects.css?v=20261014-mobile-page-scroll';link.onload=resolve;link.onerror=()=>{link.remove();projectStyles=null;reject(Error('样式加载失败，请刷新重试'));};document.head.append(link);});return projectStyles;}
 const icon=name=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${({inbox:'<path d="M4 4h16v16H4z"/><path d="M4 14h5l2 3h2l2-3h5"/>',projects:'<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',about:'<circle cx="12" cy="8" r="4"/><path d="M5 21v-2a7 7 0 0 1 14 0v2"/>',key:'<circle cx="8" cy="9" r="5"/><path d="m12 13 8 8m-4-4 3-3m-6 0 3-3"/>',logout:'<path d="M10 4H4v16h6m5-13 5 5-5 5m-6-5h11"/>',arrow:'<path d="m9 5 7 7-7 7"/>',search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/>'})[name]||''}</svg>`;
 const view={ticketPage:1,dirty:false,request:0,ticketRequest:0,detailRequest:0,projectsLoaded:false,ticketsLoadedAt:0,listScroll:0};
 const empty=(title,text)=>`<div class="manage-empty"><h2>${esc(title)}</h2><p>${esc(text)}</p></div>`;
 const labelKinds={bug:'反馈 BUG',unavailable:'功能不可用',update:'期待更新',suggestion:'提出建议',idea:'功能建议',question:'使用疑问',other:'其他反馈'};
 const canLeave=()=>{if(projectWorkspace?.isSaving()){window.alert('正在保存，请稍候。');return false;}return !view.dirty||window.confirm('修改尚未保存，是否放弃修改？');};
 function closeProjects(){projectWorkspace?.dispose();$('#projectWorkspace')?.remove();projectWorkspace=null;$('#manageSplit')?.classList.remove('project-workspace');}
 function resetProjects(){inboxWorkspace?.dispose();inboxWorkspace=null;closeProjects();view.dirty=false;}
 window.addEventListener('beforeunload',event=>{if(view.dirty||projectWorkspace?.isSaving()){event.preventDefault();event.returnValue='';}});
 const aboutEditor=createAboutEditor({root,api,esc,setDirty:value=>view.dirty=value,isDirty:()=>view.dirty,isActive:()=>state.adminTab==='about'&&!!$('#management'),canLeave});
 function shell(){
  if($('#management'))return;
  layout(`<main id="management" class="management"><aside class="manage-sidebar"><a class="manage-brand" href="/" data-link aria-label="PingMe 首页"><img src="/brand/pingme-wordmark.svg" alt="pingme." width="112" height="50"/></a><span class="manage-sidebar-title">管理后台</span><nav aria-label="后台导航"><button type="button" id="navInbox">${icon('inbox')}收件箱</button><button type="button" id="navProjects">${icon('projects')}项目管理</button><button type="button" id="navAbout">${icon('about')}关于页面</button></nav><div class="manage-account"><a href="/" data-link>查看反馈中心 ↗</a><button type="button" id="changePassword">${icon('key')}修改密码</button><button type="button" id="logout">${icon('logout')}退出登录</button></div></aside><section class="management-main"><header class="manage-header"><div><h1 id="manageTitle"></h1><span id="manageSummary"></span></div><div id="projectHeaderTools"></div><div class="manage-header-actions"><button type="button" class="outline" id="manageCategories" hidden>管理分类</button><button type="button" class="primary" id="addProject" hidden>＋ 新增项目</button></div></header><div class="manage-split" id="manageSplit"><section class="manage-list" aria-label="管理列表"><div class="manage-list-tools" id="manageTools"></div><div class="manage-columns" id="manageColumns" aria-hidden="true"></div><div class="manage-rows" id="manageRows"></div><div class="manage-pagination" id="managePager"></div></section><section class="manage-detail" id="manageDetail" aria-label="详情"></section></div></section></main>`);
  $('#navInbox').onclick=()=>switchTab('inbox');$('#navProjects').onclick=()=>switchTab('projects');$('#navAbout').onclick=()=>switchTab('about');
  $('#changePassword').onclick=()=>{if(canLeave())passwordDialog();};
  $('#logout').onclick=async()=>{if(!canLeave())return;try{await api('/admin/logout',{method:'POST'});resetProjects();view.dirty=false;clearSession();state.adminTicket=null;state.adminTab='inbox';await page();}catch(e){$('#manageDetail').innerHTML=empty('退出失败',e.message);}};
 }
 function passwordDialog(){
  $('#passwordDialog')?.remove();
  const dialog=document.createElement('dialog');dialog.id='passwordDialog';dialog.className='password-dialog';dialog.setAttribute('aria-labelledby','passwordTitle');
  dialog.innerHTML=`<header><h2 id="passwordTitle">修改密码</h2><button type="button" id="closePassword" aria-label="关闭修改密码">✕</button></header><p>修改成功后需要重新登录。</p><form id="passwordForm"><div class="field"><label for="currentPassword">当前密码</label><input id="currentPassword" name="currentPassword" type="password" autocomplete="current-password" required maxlength="200"/></div><div class="field"><label for="newPassword">新密码</label><input id="newPassword" name="newPassword" type="password" autocomplete="new-password" required maxlength="128"/></div><div class="field"><label for="confirmPassword">确认新密码</label><input id="confirmPassword" name="confirmPassword" type="password" autocomplete="new-password" required maxlength="128"/></div><div id="passwordError" role="alert"></div><div class="password-actions"><button class="primary" type="submit">修改密码</button><button class="outline" type="button" id="cancelPassword">取消</button></div></form>`;
  root.append(dialog);let saving=false;const close=()=>{if(!saving)dialog.close();};$('#closePassword').onclick=close;$('#cancelPassword').onclick=close;dialog.onclick=e=>{if(e.target===dialog)close();};dialog.oncancel=e=>{if(saving)e.preventDefault();};dialog.onclose=()=>dialog.remove();
  $('#passwordForm').onsubmit=async e=>{e.preventDefault();const form=e.target,button=form.querySelector('[type=submit]');const body=Object.fromEntries(new FormData(form));$('#passwordError').textContent='';if(body.newPassword!==body.confirmPassword){$('#passwordError').textContent='两次输入的新密码不一致';return;}saving=true;button.disabled=true;$('#closePassword').disabled=true;$('#cancelPassword').disabled=true;button.textContent='正在修改…';
   try{await api('/admin/password',jsonOpt(body));view.dirty=false;state.adminTicket=null;dialog.close();clearSession();await page();if($('#loginError')){$('#loginError').setAttribute('role','status');$('#loginError').innerHTML='<div class="alert login-success">密码已修改，请使用新密码登录。</div>';}}
   catch(ex){if(dialog.isConnected){$('#passwordError').textContent=ex.message;button.disabled=false;$('#closePassword').disabled=false;$('#cancelPassword').disabled=false;button.textContent='修改密码';saving=false;}}
  };
  dialog.showModal();
 }
 function header(){
  const tab=state.adminTab;$('#management').dataset.tab=tab;$('#manageTitle').textContent=tab==='projects'?'项目管理':tab==='about'?'关于页面':'收件箱';$('#manageSummary').textContent='';if(tab!=='about')$('#resetAbout')?.remove();
  $('#addProject').hidden=true;$('#manageCategories').hidden=true;
  for(const [id,value] of [['navInbox','inbox'],['navProjects','projects'],['navAbout','about']]){$('#'+id).classList.toggle('active',tab===value);$('#'+id).setAttribute('aria-current',tab===value?'page':'false');}
 }
 async function switchTab(tab){if(state.adminTab===tab)return;if(!canLeave())return;resetProjects();clearTimeout(searchTimer);ticketController?.abort();view.detailRequest++;state.adminTab=tab;await render();}
 async function page(){
  loadComponents().catch(()=>{});
  const auth=await api('/admin/me').catch(()=>({authenticated:false}));
  if(!auth.authenticated){resetProjects();clearSession();layout(`<main class="shell center"><h1>管理后台</h1><p>登录后可处理反馈和管理项目。</p><form id="login"><div class="field"><label class="sr-only" for="adminPassword">管理员密码</label><input id="adminPassword" name="password" type="password" autocomplete="current-password" placeholder="管理员密码" required/></div><div id="loginError" role="alert"></div><button class="primary">登录</button></form></main>`);$('#login').onsubmit=async e=>{e.preventDefault();const button=e.target.querySelector('button');button.disabled=true;$('#loginError').textContent='';$('#loginError').setAttribute('role','alert');try{const result=await api('/admin/login',jsonOpt({password:e.target.elements.password.value}));prime(result.snapshot);await render();}catch(ex){$('#loginError').innerHTML=`<div class="alert">${esc(ex.message)}</div>`;button.disabled=false;}};return;}
  prime(auth.snapshot);await render();
 }
 async function render(){
  shell();const revision=++view.request;header();
  if(state.adminTab==='projects'){
   if(projectWorkspace)return;
   $('#manageSplit').classList.add('project-workspace');const host=document.createElement('div');host.id='projectWorkspace';host.innerHTML='';$('#manageSplit').append(host);
   try{const [module]=await Promise.all([loadComponents(),ensureProjects()]);
    if(revision!==view.request||state.adminTab!=='projects'||!host.isConnected){host.remove();return;}
    header();projectWorkspace=module.mountProjects({host,state,api,setDirty:value=>view.dirty=value,onRefresh:header});
   }catch(e){if(host.isConnected)host.innerHTML=empty('项目管理加载失败',e.message);}
   return;
  }
  if(state.adminTab==='about'){await aboutEditor.open();return;}
  $('#manageSplit').dataset.detail='false';$('#manageColumns').innerHTML='';$('#manageTools').innerHTML='';$('#manageRows').innerHTML='';$('#managePager').innerHTML='';$('#manageDetail').innerHTML=empty('选择一条反馈','查看详情、更新状态或回复。');
  const cached=cachedTickets();if(cached){state.adminTickets=cached;renderTicketList();}
  try{await Promise.all([ensureProjects().then(()=>{if(revision===view.request&&state.adminTab==='inbox')return inboxTools();}),cached&&Date.now()-view.ticketsLoadedAt<30000?Promise.resolve():refreshTickets()]);}
  catch(e){if(revision===view.request&&$('#manageRows'))$('#manageRows').innerHTML=empty('加载失败',e.message);}
  if($('#management'))header();
 }
 async function ensureProjects(){if(view.projectsLoaded)return;const [projects,categories]=await Promise.all([api('/admin/projects'),api('/admin/categories')]);state.adminProjects=projects.projects;state.categories=categories.categories;view.projectsLoaded=true;}
 function pagination(total,page,key){
  const pages=Math.max(1,Math.ceil(total/PAGE_SIZE));$('#managePager').innerHTML=`<span>${total?`${(page-1)*PAGE_SIZE+1}–${Math.min(page*PAGE_SIZE,total)} / ${total}`:'0 条结果'}</span><div><button type="button" id="prevPage" aria-label="上一页" ${page<=1?'disabled':''}>上一页</button><span>${page} / ${pages}</span><button type="button" id="nextPage" aria-label="下一页" ${page>=pages?'disabled':''}>下一页</button></div>`;
  const change=delta=>{view[key]+=delta;renderTicketList();$('#manageRows').scrollTop=0;};$('#prevPage').onclick=()=>change(-1);$('#nextPage').onclick=()=>change(1);
 }
 function showDetail(){view.listScroll=$('#manageRows').scrollTop;$('#manageSplit').dataset.detail='true';$('#manageDetail').scrollTop=0;}
 function back(){view.dirty=false;view.detailRequest++;$('#manageSplit').dataset.detail='false';$('#manageRows').scrollTop=view.listScroll;const selector='[data-ticket="'+state.adminTicket+'"]';$(selector)?.focus({preventScroll:true});}
 async function inboxTools(){
  inboxWorkspace?.dispose();inboxWorkspace=null;
  $('#manageTools').innerHTML=`<div class="manage-status-tabs" role="group" aria-label="反馈状态"><button type="button" data-status="" aria-pressed="${!state.filterStatus}">全部反馈</button>${Object.entries(statuses).map(([value,label])=>`<button type="button" data-status="${value}" aria-pressed="${state.filterStatus===value}"><i class="status-dot ${value}"></i>${label}</button>`).join('')}</div><div id="inboxFilters"></div><p class="manage-list-status" id="ticketListStatus" role="status" aria-live="polite"></p>`;
  root.querySelectorAll('[data-status]').forEach(button=>button.onclick=()=>{clearTimeout(searchTimer);state.filterStatus=button.dataset.status;view.ticketPage=1;root.querySelectorAll('[data-status]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));refreshTickets();});
  const host=$('#inboxFilters');const module=await loadComponents();if(state.adminTab!=='inbox'||!host.isConnected)return;
  inboxWorkspace=module.mountInboxTools({host,headerHost:$('#projectHeaderTools'),projects:state.adminProjects,statuses,search:state.search,project:state.filterProject,status:state.filterStatus,
   onSearch:value=>{state.search=value;clearTimeout(searchTimer);ticketController?.abort();view.ticketRequest++;view.ticketPage=1;searchTimer=setTimeout(()=>{if(state.adminTab==='inbox')refreshTickets()},250);},
   onProject:value=>{clearTimeout(searchTimer);state.filterProject=value;view.ticketPage=1;refreshTickets();},
   onRefresh:()=>{clearTimeout(searchTimer);refreshTickets();}
  });
 }
 async function refreshTickets(){
  ticketController?.abort();ticketController=new AbortController();const revision=++view.ticketRequest,key=ticketKey();
  if($('#ticketListStatus'))$('#ticketListStatus').textContent='正在加载…';$('#manageRows')?.setAttribute('aria-busy','true');
  try{const data=await api('/admin/tickets?'+new URLSearchParams({status:state.filterStatus,project:state.filterProject,q:state.search}),{signal:ticketController.signal});if(revision!==view.ticketRequest||state.adminTab!=='inbox'||!$('#management'))return;ticketCache.clear();ticketCache.set(key,data.tickets);view.ticketsLoadedAt=Date.now();state.adminTickets=data.tickets;header();renderTicketList();if($('#ticketListStatus'))$('#ticketListStatus').textContent='';}
  catch(e){if(e.name==='AbortError'||revision!==view.ticketRequest)return;if(state.adminTab==='inbox'&&$('#ticketListStatus'))$('#ticketListStatus').textContent='加载失败：'+e.message;}
  finally{if(revision===view.ticketRequest)$('#manageRows')?.setAttribute('aria-busy','false');}
 }
 function renderTicketList(){
  const tickets=state.adminTickets;view.ticketPage=Math.min(view.ticketPage,Math.max(1,Math.ceil(tickets.length/PAGE_SIZE)));
  $('#manageColumns').innerHTML='<span>反馈</span><span>项目</span><span>状态</span><span>最近更新</span><span></span>';
  $('#manageRows').innerHTML=tickets.slice((view.ticketPage-1)*PAGE_SIZE,view.ticketPage*PAGE_SIZE).map(t=>`<button type="button" class="manage-row manage-ticket" data-ticket="${esc(t.id)}"><span class="manage-row-text"><strong>${esc(t.title)}</strong><small>${esc(t.number)} · ${esc(labelKinds[t.kind]||t.kind)}</small></span><span class="manage-ticket-project">${esc(t.project_name)}</span><span class="manage-status-pill ${esc(t.status)}"><i class="status-dot ${esc(t.status)}"></i>${esc(statuses[t.status]||t.status)}</span><time class="manage-ticket-time">${esc(t.updated_at.slice(5,16))}</time><span class="manage-row-arrow">${icon('arrow')}</span></button>`).join('')||empty('暂无反馈',state.search||state.filterStatus||state.filterProject?'当前筛选条件下没有结果。':'访客提交的反馈会显示在这里。');
  root.querySelectorAll('[data-ticket]').forEach(b=>b.onclick=()=>{if(!canLeave())return;view.dirty=false;loadTicket(b.dataset.ticket)});pagination(tickets.length,view.ticketPage,'ticketPage');
 }
 async function loadTicket(id,open=true){
  state.adminTicket=id;const revision=++view.detailRequest;if(open)showDetail();$('#manageDetail').innerHTML='<button type="button" class="manage-mobile-back" id="backLoadingTicket">返回反馈列表</button>'+empty('正在加载反馈','');$('#backLoadingTicket').onclick=back;
  try{const data=await api('/admin/tickets/'+id);if(revision!==view.detailRequest||state.adminTab!=='inbox'||state.adminTicket!==id||!$('#manageDetail'))return;const t=data.ticket;$('#manageDetail').innerHTML=`<button type="button" class="manage-mobile-back" id="backToTickets">返回反馈列表</button><div class="manage-ticket-kind">${esc(labelKinds[t.kind]||t.kind)}</div>${detailMarkup(data,'',true)}<form id="ticketStatusForm" class="manage-ticket-status"><div class="field"><label for="updateStatus">处理状态</label><select id="updateStatus">${Object.entries(statuses).map(([v,l])=>`<option value="${v}" ${t.status===v?'selected':''}>${l}</option>`).join('')}</select></div><button class="outline" type="submit">更新状态</button></form><p id="ticketStatusMessage" role="status"></p><form id="adminReply"><div class="field"><label for="adminReplyBody">回复或内部备注</label><textarea id="adminReplyBody" name="body" required placeholder="输入内容…"></textarea></div><label class="manage-internal"><input type="checkbox" name="internal"/> 内部备注（仅管理员可见）</label><div id="replyStatus" role="status"></div><button class="primary">发送回复</button></form>`;
   $('#backToTickets').onclick=()=>{if(canLeave())back();};$('#adminReply').oninput=()=>{view.dirty=true;$('#adminReply button.primary').textContent=$('#adminReply').elements.internal.checked?'保存备注':'发送回复';};$('#ticketStatusForm').onsubmit=async e=>{e.preventDefault();const button=e.target.querySelector('button');button.disabled=true;try{await api('/admin/tickets/'+id,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({status:$('#updateStatus').value})});$('#ticketStatusMessage').textContent='处理状态已更新';$('#manageDetail .stat').textContent=statuses[$('#updateStatus').value];await refreshTickets();}catch(ex){$('#ticketStatusMessage').textContent=ex.message;}finally{button.disabled=false;}};
   $('#adminReply').onsubmit=async e=>{e.preventDefault();const form=e.target,button=form.querySelector('button');button.disabled=true;try{await api('/admin/tickets/'+id+'/reply',jsonOpt({body:form.elements.body.value,internal:form.elements.internal.checked}));view.dirty=false;await loadTicket(id,false);await refreshTickets();$('#replyStatus').textContent='内容已保存';}catch(ex){$('#replyStatus').innerHTML=`<p class="alert">${esc(ex.message)}</p>`;button.disabled=false;}};
  }catch(ex){if(revision===view.detailRequest&&state.adminTab==='inbox'&&state.adminTicket===id&&$('#manageDetail')){$('#manageDetail').innerHTML='<button type="button" class="manage-mobile-back" id="backFailedTicket">返回反馈列表</button>'+empty('加载失败',ex.message);$('#backFailedTicket').onclick=back;}}
 }
 return {page,leave(){if(!canLeave())return false;resetProjects();return true;}};
}
