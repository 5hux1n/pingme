export function createAboutEditor({root,api,esc,setDirty,isDirty,isActive,canLeave}) {
 const $=selector=>root.querySelector(selector);
 const sections=[['profile','个人资料'],['contacts','联系方式'],['communities','社交账号'],['sites','个人站点'],['support','支持开发']];
 const titles={contacts:'contactTitle',communities:'communityTitle',sites:'sitesTitle',support:'supportTitle'};
 const icons=[['wechat','微信'],['qq','QQ'],['email','邮箱'],['telegram','Telegram'],['x','X'],['douyin','抖音'],['github','GitHub'],['nodeseek','NodeSeek'],['website','网站'],['rss','博客'],['alipay','支付宝'],['paypal','PayPal'],['coffee','Ko-fi']];
 let draft,snapshot,version=0,loading=0,selected='profile';const opened=new Set();
 const field=(name,label,value,max=200,required=false,textarea=false)=>`<div class="field"><label for="about-${esc(name)}">${esc(label)}</label>${textarea?`<textarea id="about-${esc(name)}" name="${esc(name)}" maxlength="${max}" ${required?'required':''}>${esc(value??'')}</textarea>`:`<input id="about-${esc(name)}" name="${esc(name)}" value="${esc(value??'')}" maxlength="${max}" ${required?'required':''}/>`}</div>`;
 function collect(){const form=$('#aboutEditor');if(!form)return;for(const input of form.querySelectorAll('[name]')){const path=input.name.split('.');if(path.length===1)draft[path[0]]=input.value;else draft[path[0]][Number(path[1])][path[2]]=input.type==='checkbox'?input.checked:input.value;}}
 function menus(){
  $('#manageTools').innerHTML=sections.map(([id,title])=>`<button type="button" class="manage-row ${selected===id?'selected':''}" data-about-section="${id}" aria-pressed="${selected===id}"><span class="manage-row-text"><strong>${title}</strong></span></button>`).join('');
  root.querySelectorAll('[data-about-section]').forEach(button=>button.onclick=()=>{collect();selected=button.dataset.aboutSection;menus();editor();});
 }
 function refreshButton(){
  $('#projectHeaderTools').innerHTML='<button type="button" id="resetAbout" class="manage-heading-refresh" aria-label="刷新关于页面" title="刷新关于页面"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 7v5h-5M4 17v-5h5"/><path d="M6.1 7a7 7 0 0 1 11.6-1L20 9M4 15l2.3 3A7 7 0 0 0 18 17"/></svg></button>';
  $('#resetAbout').onclick=()=>{if(canLeave())open(true);};
 }
 const actionIcon=kind=>`<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${kind==='up'?'<path d="m6 14 6-6 6 6"/>':kind==='down'?'<path d="m6 10 6 6 6-6"/>':'<path d="M3 6h18M9 6V4h6v2M5 6l1 14h12l1-14M10 10v6M14 10v6"/>'}</svg>`;
 function itemFields(item,index,section){
  const prefix=section+'.'+index,mode=item.mode||(item.qr?'qr':item.href?'link':'copy');
  return `<details class="about-entry-card" data-about-entry="${prefix}" ${opened.has(prefix)?'open':''}><summary><strong>${esc(item.platform||'新条目')}</strong><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg></summary><div class="about-card-body"><div class="about-entry-actions"><button type="button" class="outline" data-section="${section}" data-move="${index}" data-direction="-1" title="上移" aria-label="上移条目 ${index+1}" ${index===0?'disabled':''}>${actionIcon('up')}</button><button type="button" class="outline" data-section="${section}" data-move="${index}" data-direction="1" title="下移" aria-label="下移条目 ${index+1}" ${index===draft[section].length-1?'disabled':''}>${actionIcon('down')}</button><button type="button" class="outline danger" data-section="${section}" data-remove="${index}" title="删除" aria-label="删除条目 ${index+1}">${actionIcon('delete')}</button></div><div class="pair">${field(prefix+'.platform','平台名称',item.platform,60,true)}${field(prefix+'.value','账号 / 显示说明',item.value)}</div><div class="pair"><div class="field"><label for="about-${prefix}-icon">图标</label><select id="about-${prefix}-icon" name="${prefix}.icon">${icons.map(([value,label])=>`<option value="${value}" ${item.icon===value?'selected':''}>${label}</option>`).join('')}</select></div><div class="field"><label for="about-${prefix}-mode">点击行为</label><select id="about-${prefix}-mode" name="${prefix}.mode" data-mode-select><option value="link" ${mode==='link'?'selected':''}>打开链接</option>${section==='support'?`<option value="qr" ${mode==='qr'?'selected':''}>显示二维码</option>`:`<option value="copy" ${mode==='copy'?'selected':''}>复制账号 / 内容</option>`}</select></div></div>${mode==='link'?field(prefix+'.href','链接地址',item.href,1000,true)+field(prefix+'.action','链接操作文案（选填）',item.action,60):mode==='qr'?field(prefix+'.qr','二维码图片地址',item.qr,1000,true)+`<div class="pair">${field(prefix+'.scanner','扫码应用',item.scanner,40,true)}${field(prefix+'.download','下载文件名（选填）',item.download,100)}</div>`:''}<label class="about-visible"><input type="checkbox" name="${prefix}.visible" ${item.visible!==false?'checked':''}/> 在关于页显示</label></div></details>`;
 }
 function fieldsFor(id){
  const profile=id==='profile';
  return profile?`${field('name','显示名称',draft.name,80,true)}${field('bio','个人简介',draft.bio,500,false,true)}${field('avatar','头像图片地址',draft.avatar,1000,true)}<p class="about-field-note">图片可使用站内路径或 HTTPS 地址。</p>${field('homeUrl','个人主页地址（留空隐藏入口）',draft.homeUrl,1000)}<div class="pair">${field('homeLabel','主页入口文案',draft.homeLabel,40,true)}${field('feedbackLabel','返回反馈文案',draft.feedbackLabel,40,true)}</div>`:`${field(titles[id],'分组标题',draft[titles[id]],40,true)}${id==='support'?field('supportText','支持开发说明',draft.supportText,300,false,true):''}<div class="about-entry-grid">${draft[id].map((item,index)=>itemFields(item,index,id)).join('')}</div><button type="button" class="outline" data-add-about="${id}" ${draft[id].length>=20?'disabled':''}>新增条目</button>`;
 }
 function editor(){
  $('#manageDetail').innerHTML=`<form id="aboutEditor"><div class="about-form-scroll"><h2 class="about-panel-title">${sections.find(([id])=>id===selected)[1]}</h2>${fieldsFor(selected)}</div><div class="about-save-footer"><p id="aboutSaveStatus" role="status" aria-live="polite">${isDirty()?'有未保存的修改':''}</p><div class="manage-editor-actions"><button type="submit" class="primary">保存关于页面</button></div></div></form>`;
  root.querySelectorAll('[data-about-entry]').forEach(card=>card.addEventListener('toggle',()=>{if(!card.isConnected)return;card.open?opened.add(card.dataset.aboutEntry):opened.delete(card.dataset.aboutEntry);}));
  const form=$('#aboutEditor');form.oninput=()=>{collect();setDirty(true);$('#aboutSaveStatus').textContent='有未保存的修改';};
  form.addEventListener('invalid',event=>{const card=event.target.closest('[data-about-entry]');if(card){card.open=true;opened.add(card.dataset.aboutEntry);}},true);
  root.querySelectorAll('[data-mode-select]').forEach(select=>select.onchange=()=>{collect();setDirty(true);editor();});
  const modify=action=>{collect();action();setDirty(true);editor();};
  root.querySelectorAll('[data-add-about]').forEach(button=>button.onclick=()=>modify(()=>{const id=button.dataset.addAbout;opened.add(id+'.'+draft[id].length);draft[id].push({platform:'',value:'',icon:'website',mode:'link',href:'',visible:true});}));
  root.querySelectorAll('[data-remove]').forEach(button=>button.onclick=()=>modify(()=>draft[button.dataset.section].splice(Number(button.dataset.remove),1)));
  root.querySelectorAll('[data-move]').forEach(button=>button.onclick=()=>modify(()=>{const a=Number(button.dataset.move),b=a+Number(button.dataset.direction);const items=draft[button.dataset.section];[items[a],items[b]]=[items[b],items[a]];}));
  form.onsubmit=async event=>{
   event.preventDefault();collect();const saveRevision=loading;const controls=[...form.querySelectorAll('input,textarea,select,button'),...root.querySelectorAll('[data-about-section]'),$('#resetAbout')].map(control=>[control,control.disabled]);controls.forEach(([control])=>control.disabled=true);$('#aboutSaveStatus').classList.remove('alert');$('#aboutSaveStatus').textContent='正在保存…';
   try{const data=await api('/admin/about',{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({personal:draft,version})});if(!isActive()||saveRevision!==loading)return;snapshot=structuredClone(data);draft=data.personal;version=data.version;setDirty(false);if(isActive()){menus();editor();$('#aboutSaveStatus').textContent='关于页面已保存';}}
   catch(error){if(isActive()&&$('#aboutSaveStatus')){$('#aboutSaveStatus').classList.add('alert');$('#aboutSaveStatus').textContent=error.message;}}
   finally{controls.forEach(([control,disabled])=>{if(control.isConnected)control.disabled=disabled;});}
  };
 }
 async function open(refresh=false){const revision=++loading;refreshButton();$('#manageSplit').dataset.detail='true';$('#manageColumns').innerHTML='';$('#manageTools').innerHTML='';$('#managePager').innerHTML='';$('#manageRows').innerHTML='';
  const show=data=>{draft=structuredClone(data.personal);version=data.version;setDirty(false);menus();editor();};
  if(snapshot){show(snapshot);if(!refresh)return;}else $('#manageDetail').innerHTML='';
  const controls=refresh?[...($('#aboutEditor')?.querySelectorAll('input,textarea,select,button')||[]),...root.querySelectorAll('[data-about-section]'),$('#resetAbout')].map(control=>[control,control.disabled]):[];controls.forEach(([control])=>control.disabled=true);
  try{const data=await api('/admin/about');if(revision!==loading||!isActive())return;snapshot=structuredClone(data);show(data);}
  catch(error){if(revision===loading&&isActive()){if(snapshot){$('#aboutSaveStatus').textContent='刷新失败：'+error.message;}else{$('#manageDetail').innerHTML=`<div class="manage-empty"><h2>加载失败</h2><p>${esc(error.message)}</p><button type="button" class="outline" id="retryAbout">重试</button></div>`;$('#retryAbout')?.addEventListener('click',()=>open(true));}}}
  finally{controls.forEach(([control,disabled])=>{if(control.isConnected)control.disabled=disabled;});if(revision===loading&&isActive()&&$('#resetAbout'))$('#resetAbout').disabled=false;}
 }
 return {open,prime(data){snapshot=structuredClone(data);},clear(){loading++;snapshot=null;draft=null;version=0;opened.clear();}};
}
