import React,{useState,useEffect,useRef} from 'react';
import {createRoot} from 'react-dom/client';
import {createPortal} from 'react-dom';
import {App,ConfigProvider,Collapse,Pagination,Input,InputNumber,Select,Checkbox,Button,Form,Modal,Upload,Alert,Space,Tooltip,Popconfirm,Grid} from 'antd';
import zhCN from 'antd/locale/zh_CN';
import {processProjectImage} from './project-image.js';
import './projects.css';

const visibilityOptions=[{value:'homepage_visible',label:'主页'},{value:'visible',label:'反馈'},{value:'enabled',label:'接收'}];
const visibilityValues=p=>visibilityOptions.filter(o=>p[o.value]).map(o=>o.value);
const visibilityPatch=values=>Object.fromEntries(visibilityOptions.map(o=>[o.value,values.includes(o.value)]));
function CategoryActionIcon({close=false}){return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true"><path d={close?'M6 6l12 12M6 18 18 6':'M12 4v16M4 12h16'}/></svg>;}
const defaults={slug:'',name:'',description:'',official_url:'',category:'other',sort_order:0,homepage_visible:true,visible:true,enabled:true};
const bodyOf=p=>({name:p.name,description:p.description,official_url:p.official_url,category:p.category,sort_order:p.sort_order,homepage_visible:!!p.homepage_visible,visible:!!p.visible,enabled:!!p.enabled,image_action:'keep',image_version:p.image_key||''});
function Face({project,size=32}){return project.image_url?<img className="pm-project-image" src={project.image_url} width={size} height={size} alt=""/>:<span className="pm-project-letter" style={{width:size,height:size}}>{project.name?.slice(0,1)||'P'}</span>;}
function OrderCell({project,disabled,onSave}){const [value,setValue]=useState(project.sort_order);useEffect(()=>setValue(project.sort_order),[project.sort_order]);return <InputNumber aria-label={`${project.name} 排序`} min={0} max={1000000} controls={false} value={value} disabled={disabled} onChange={setValue} onPressEnter={e=>e.currentTarget.blur()} onBlur={()=>{if(value!==null&&value!==project.sort_order)onSave(project,{sort_order:value});else setValue(project.sort_order);}}/>;}

function HeaderSearch({value,onChange,label='搜索项目'}){
 const [open,setOpen]=useState(false),input=useRef(null);
 return <div className={'pm-search-morph'+(open||value?' is-open':'')}><Button aria-label="展开搜索" title={label} type="text" onClick={()=>{setOpen(true);requestAnimationFrame(()=>input.current?.focus());}} icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></svg>}/>{(open||value)&&<Input ref={input} allowClear aria-label={label} placeholder={label} value={value} onBlur={()=>{if(!value)setOpen(false);}} onKeyDown={e=>{if(e.key==='Escape'){onChange('');setOpen(false);}}} onChange={e=>onChange(e.target.value)}/>}</div>;
}
function RefreshButton({disabled,onClick,label='刷新项目'}){return <Button aria-label={label} title={label} type="text" disabled={disabled} onClick={onClick} icon={<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M20 7v5h-5M4 17v-5h5"/><path d="M6.1 7a7 7 0 0 1 11.6-1L20 9M4 15l2.3 3A7 7 0 0 0 18 17"/></svg>}/>;}
function InboxTools({headerHost,projects,search,project,onSearch,onProject,onRefresh}){
 const [query,setQuery]=useState(search),[projectValue,setProject]=useState(project||undefined);
 return <>{createPortal(<div className="pm-header-actions"><HeaderSearch value={query} label="搜索反馈" onChange={v=>{setQuery(v);onSearch(v);}}/><RefreshButton label="刷新反馈" onClick={onRefresh}/></div>,headerHost)}<div className="pm-inbox-filters"><Select aria-label="反馈项目" placeholder="全部项目" allowClear value={projectValue} options={projects.map(p=>({value:p.slug,label:p.name}))} onChange={v=>{setProject(v);onProject(v||'');}}/></div></>;
}
const adminTheme={token:{colorPrimary:'#262626',colorInfo:'#262626',fontSize:13,controlHeight:32,borderRadius:6,colorBgContainer:'#fff',colorBorder:'#dedede',controlItemBgActive:'#f0f5fa',controlItemBgActiveHover:'#eaf0f6',controlItemBgHover:'#fafafa',fontFamily:'-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif'},components:{Select:{optionSelectedBg:'#f0f5fa',optionActiveBg:'#fafafa',optionSelectedColor:'#3f5d75'},Button:{primaryShadow:'none'},Form:{itemMarginBottom:14}}};
function AdminProvider({children}){return <ConfigProvider prefixCls="pm-ant" locale={zhCN} button={{autoInsertSpace:false}} theme={adminTheme}><App>{children}</App></ConfigProvider>;}
export function mountInboxTools(props){const root=createRoot(props.host);root.render(<AdminProvider><InboxTools {...props}/></AdminProvider>);return {dispose(){root.unmount();}};}

function Projects({state,api,setDirty,onRefresh,controller}){
 const {message,modal}=App.useApp();const screens=Grid.useBreakpoint(),desktop=!!screens.md;
 const [rows,setRows]=useState(state.adminProjects),[categories,setCategories]=useState(state.categories),[query,setQuery]=useState(''),[category,setCategory]=useState(),[status,setStatus]=useState(),[page,setPage]=useState(1),[pageSize,setPageSize]=useState(20),[editor,setEditor]=useState(null),[categoryOpen,setCategoryOpen]=useState(false),[pending,setPending]=useState(new Set()),[loadError,setLoadError]=useState('');
 const locks=useRef(new Set()),editorDirty=useRef(false),refreshRevision=useRef(0);
 useEffect(()=>()=>setDirty(false),[]);
 useEffect(()=>{const main=document.getElementById('management');main?.classList.toggle('project-page-flow',!desktop||!editor);return ()=>main?.classList.remove('project-page-flow');},[desktop,editor]);
 const dirty=value=>{editorDirty.current=value;setDirty(value);};
 const lock=(id,on)=>{on?locks.current.add(id):locks.current.delete(id);controller.busy=locks.current.size>0;setPending(new Set(locks.current));};
 async function refresh(){const revision=++refreshRevision.current;const [p,c,pub]=await Promise.all([api('/admin/projects'),api('/admin/categories'),api('/projects')]);if(revision!==refreshRevision.current)return p.projects;state.adminProjects=p.projects;state.categories=c.categories;state.projects=pub.projects;setRows(p.projects);setCategories(c.categories);onRefresh();return p.projects;}
 async function quickSave(project,patch){if(locks.current.has(project.slug))return;lock(project.slug,true);setLoadError('');try{
  // Merge against the current server row so a quick toggle never restores stale names or images.
  const current=(await api('/admin/projects')).projects.find(p=>p.slug===project.slug);if(!current)throw Error('项目已不存在，请刷新列表');
  await api('/admin/projects/'+project.slug,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({...bodyOf(current),...patch})});await refresh();message.success('已保存');
 }catch(error){setLoadError(error.message);}finally{lock(project.slug,false);}}
 async function openEditor(project){if(locks.current.size)return;setLoadError('');if(project){lock(project.slug,true);try{const current=(await api('/admin/projects')).projects.find(p=>p.slug===project.slug);if(!current)throw Error('项目已不存在');dirty(false);setEditor(current);}catch(error){setLoadError(error.message);}finally{lock(project.slug,false);}}else{dirty(false);setEditor({...defaults});}}
 const leaveEditor=()=>{if(controller.busy)return;if(editorDirty.current){modal.confirm({title:'放弃未保存的修改？',okText:'放弃修改',cancelText:'继续编辑',onOk:()=>{dirty(false);setEditor(null);}});}else setEditor(null);};
 const options=categories.map(c=>({value:c.id,label:c.name}));
 const filtered=rows.filter(p=>(!category||p.category===category)&&(!status||(status==='homepage'?!p.homepage_visible:status==='feedback'?!p.visible:!p.enabled))&&[p.name,p.slug,p.description].join(' ').toLowerCase().includes(query.toLowerCase().trim())).sort((a,b)=>(categories.find(c=>c.id===a.category)?.sort_order||0)-(categories.find(c=>c.id===b.category)?.sort_order||0)||a.sort_order-b.sort_order||a.name.localeCompare(b.name,'zh-CN'));
 const reload=async()=>{lock('list',true);try{await refresh();setLoadError('');}catch(e){setLoadError(e.message);}finally{lock('list',false);}};
 const searchControl=<HeaderSearch value={query} onChange={value=>{setQuery(value);setPage(1);}}/>;
 const refreshControl=<RefreshButton disabled={pending.size>0} onClick={reload}/>;
 const renderCard=p=><Collapse key={p.slug} className="pm-project-card" expandIconPlacement="end" items={[{key:p.slug,label:<div className="pm-card-heading"><div className="pm-project-identity"><Face project={p}/><div><div className="pm-card-title-line"><strong>{p.name}</strong><span className="pm-category-tag">{categories.find(c=>c.id===p.category)?.name||p.category}</span></div><small>/{p.slug}</small></div></div><p>{p.description||'暂无简介'}</p><div className="pm-card-meta">{[['homepage_visible','主页展示','主页隐藏'],['visible','反馈展示','反馈隐藏'],['enabled','接收开启','接收关闭']].map(([key,on,off])=><span key={key} className={'pm-status-tag '+(p[key]?'is-on':key==='enabled'?'is-closed':'is-hidden')}>{p[key]?on:off}</span>)}</div></div>,children:<div className="pm-card-config"><div className="pm-card-fields"><label><span>分类</span><Select aria-label={`${p.name} 分类`} value={p.category} options={options} disabled={pending.has(p.slug)} onChange={value=>quickSave(p,{category:value})}/></label><label><span>排序</span><OrderCell project={p} disabled={pending.has(p.slug)} onSave={quickSave}/></label></div><Checkbox.Group className="pm-card-checks" aria-label={`${p.name} 展示与接收设置`} options={visibilityOptions} value={visibilityValues(p)} disabled={pending.has(p.slug)} onChange={values=>quickSave(p,visibilityPatch(values))}/>
<div className="pm-card-actions"><Button type="text" onClick={()=>openEditor(p)} disabled={pending.has(p.slug)}>编辑</Button></div></div>}]} />;
 const groups=categories.map(c=>({...c,projects:filtered.filter(p=>p.category===c.id)})).filter(c=>c.projects.length);
 return <div className="pm-projects">
  {!editor&&createPortal(<div className="pm-header-actions">{searchControl}{refreshControl}</div>,document.getElementById('projectHeaderTools'))}
  {loadError&&<Alert type="error" showIcon closable title={loadError} onClose={()=>setLoadError('')}/>}
  {editor?<ProjectEditor key={editor.id||'new'} project={editor} options={options} api={api} setDirty={dirty} onBack={leaveEditor} setBusy={value=>lock('editor',value)} onSaved={async slug=>{try{await refresh();}catch(e){setLoadError('已保存，但列表刷新失败：'+e.message);}dirty(false);setEditor(null);message.success(editor.id?'项目已保存':'项目已创建');if(!editor.id){setQuery(slug);setCategory();setStatus();setPage(1);}}}/>:<>
   <div className="pm-list-toolbar"><div className="pm-list-filters"><Select aria-label="筛选分类" placeholder="全部分类" allowClear value={category} options={options} onChange={value=>{setCategory(value);setPage(1);}}/><Select aria-label="筛选状态" placeholder="全部状态" allowClear value={status} options={[{value:'homepage',label:'个人主页隐藏'},{value:'feedback',label:'反馈中心隐藏'},{value:'closed',label:'反馈已关闭'}]} onChange={value=>{setStatus(value);setPage(1);}}/></div><Space><Button onClick={()=>setCategoryOpen(true)} disabled={pending.size>0}>管理分类</Button><Button type="primary" onClick={()=>openEditor(null)} disabled={pending.size>0}>新增项目</Button></Space></div>
   <div className="pm-project-cards-region">{desktop?<div className="pm-project-groups">{groups.map(c=><section className="pm-project-group" key={c.id}><h2>{c.name}</h2><div className="pm-project-cards">{c.projects.map(renderCard)}</div></section>)}</div>:<div className="pm-project-cards">{filtered.slice((Math.min(page,Math.max(1,Math.ceil(filtered.length/pageSize)))-1)*pageSize,Math.min(page,Math.max(1,Math.ceil(filtered.length/pageSize)))*pageSize).map(renderCard)}</div>}{!filtered.length&&<div className="pm-project-empty">没有符合条件的项目</div>}</div>{!desktop&&<Pagination size="small" current={Math.min(page,Math.max(1,Math.ceil(filtered.length/pageSize)))} pageSize={pageSize} total={filtered.length} showSizeChanger={false} showTotal={total=>`共 ${total} 个项目`} onChange={setPage}/>}


  </>}
  <CategoryManager open={categoryOpen} categories={categories} rows={rows} api={api} onClose={()=>setCategoryOpen(false)} onSaved={refresh} setDirty={setDirty} setBusy={value=>lock('categories',value)}/>
 </div>;
}

function ProjectEditor({project,options,api,setDirty,onBack,onSaved,setBusy}){
 const {message}=App.useApp();const [form]=Form.useForm();const screens=Grid.useBreakpoint();const [saving,setSaving]=useState(false),[error,setError]=useState(''),[file,setFile]=useState(null),[source,setSource]=useState(project.image_source||''),[imageAction,setImageAction]=useState('keep'),[preview,setPreview]=useState(project.image_url||''),[imageStatus,setImageStatus]=useState('');
 useEffect(()=>{if(!file)return;const url=URL.createObjectURL(file);setPreview(url);return ()=>URL.revokeObjectURL(url);},[file]);
 const refreshRef=useRef(false);const setRefreshSource=value=>refreshRef.current=value;
 const changed=()=>setDirty(true);
 async function imagePayload(){const data={image_action:'keep',image_version:project.image_key||''};if(imageAction==='remove')return {data:{...data,image_action:'remove'}};let blob=file,link='';if(!blob&&source.trim()&&(source.trim()!==(project.image_source||'')||refreshRef.current)){
  link=source.trim();setImageStatus('正在获取图片…');const r=await fetch('/api/admin/project-image-source',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({url:link})});if(!r.ok){const d=await r.json().catch(()=>({}));throw Error(d.error||'图片获取失败');}blob=await r.blob();
 }if(!blob)return {data};setImageStatus('正在处理图片…');const image=await processProjectImage(blob);return {data:{...data,image_action:'replace',image_source:link},image};}
 async function save(values){setSaving(true);setBusy(true);setError('');try{const prepared=await imagePayload();const data={...values,...prepared.data};const payload=new FormData();payload.set('data',JSON.stringify(data));if(prepared.image)payload.set('image',prepared.image,'icon.'+(prepared.image.type==='image/webp'?'webp':'png'));await api('/admin/projects'+(project.id?'/'+project.slug:''),{method:project.id?'PATCH':'POST',body:payload});await onSaved(values.slug);}catch(e){setError(e.message);setImageStatus('');}finally{setSaving(false);setBusy(false);}}
 const resetImage=()=>{setFile(null);setSource('');setRefreshSource(false);setImageAction('remove');setPreview(project.image_path||'');setImageStatus('保存后恢复默认图片');changed();};
 return <section className="pm-editor">
  <div className="pm-editor-heading"><h2>{project.id?'编辑项目':'新增项目'}</h2>{project.id&&!!project.enabled&&<a className="pm-entry-link" href={'/'+project.slug} target="_blank" rel="noopener noreferrer">查看反馈页 ↗</a>}</div>
  <Form form={form} layout={screens.md?'horizontal':'vertical'} labelCol={screens.md?{flex:'100px'}:undefined} wrapperCol={screens.md?{flex:1}:undefined} labelAlign="left" colon={false} initialValues={{...project,visibility:visibilityValues(project)}} onValuesChange={changed} onFinish={({visibility,...values})=>save({...values,...visibilityPatch(visibility)})} disabled={saving} className="pm-edit-form" requiredMark={false}>
   {error&&<Alert type="error" showIcon title={error}/>}
   <div className="pm-form-body">
    <div className="pm-image-row"><div className="pm-image-label">项目图片</div><div className="pm-image-controls"><div className="pm-image-picker"><Upload accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml" showUploadList={false} beforeUpload={selected=>{if(selected.size>5*1024*1024){message.error('图片不能超过 5MB');return Upload.LIST_IGNORE;}setFile(selected);setSource('');setRefreshSource(false);setImageAction('replace');setImageStatus(selected.name);changed();return false;}}><button type="button" className="pm-image-upload" aria-label="上传或修改项目图片" title="上传或修改项目图片" disabled={saving}><Face project={{...project,image_url:preview}} size={60}/><svg className="pm-image-edit-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="m16 3 5 5-12 12-6 1 1-6zM14 5l5 5"/></svg></button></Upload><Button type="text" onClick={resetImage} disabled={saving||(!preview&&!source&&!file)}>恢复默认</Button></div><div className="pm-image-inputs"><div className="pm-image-link"><Input aria-label="图片链接" placeholder="图片链接 https://…" value={source} maxLength={2000} onChange={e=>{setSource(e.target.value);setFile(null);setPreview(project.image_url||'');setRefreshSource(false);setImageAction('keep');setImageStatus('');changed();}}/><Tooltip title="同一链接的图片更新后，点击这里重新获取并保存"><Button disabled={saving||!source.trim()} onClick={()=>{setRefreshSource(true);changed();form.submit();}}>更新图片</Button></Tooltip></div>{imageStatus&&<div className="pm-image-status" role="status">{imageStatus}</div>}</div></div></div>
    <div className="pm-form-grid"><Form.Item name="name" className="pm-project-name-field" label="项目名称" rules={[{required:true,message:'请输入项目名称'},{max:80}]}><Input maxLength={80} autoFocus/></Form.Item><Form.Item name="slug" label="访问路径"  rules={[{required:true,message:'请输入访问路径'},{pattern:/^[a-z0-9-]{2,50}$/,message:'使用 2–50 位小写字母、数字或连字符'}]}><Input prefix="/" readOnly={!!project.id} maxLength={50}/></Form.Item><Form.Item name="category" label="项目分类" rules={[{required:true,message:'请选择分类'}]}><Select options={options}/></Form.Item><Form.Item name="sort_order" label="排序" rules={[{required:true,message:'请输入排序'},{type:'integer',min:0,max:1000000,message:'使用 0–1000000 的整数'}]}><InputNumber min={0} max={1000000} controls={false}/></Form.Item></div>
    <Form.Item name="description" label="项目简介"><Input.TextArea maxLength={200} autoSize={{minRows:2,maxRows:4}}/></Form.Item>
    <Form.Item name="official_url" label="项目官网" rules={[{validator:(_,value)=>{if(!value)return Promise.resolve();try{const u=new URL(value);if(['http:','https:'].includes(u.protocol)&&!u.username&&!u.password)return Promise.resolve();}catch{}return Promise.reject(Error('请输入有效的 HTTP 或 HTTPS 链接'));}}]}><Input placeholder="https://…" maxLength={1000}/></Form.Item>
    <div className="pm-visibility"><Form.Item name="visibility"><Checkbox.Group aria-label="展示与接收设置" options={visibilityOptions}/></Form.Item></div>
   </div><div className="pm-editor-actions"><span>保存后两站使用同一份项目资料</span><Space><Button onClick={onBack} disabled={saving}>取消</Button><Button type="primary" htmlType="submit" loading={saving}>{project.id?'保存修改':'创建项目'}</Button></Space></div>
  </Form>
 </section>;
}

function CategoryRow({category,count,api,onSaved,onDirty,onBusy,isNew,onCreated,blocked}){
 const {message}=App.useApp();const [draft,setDraft]=useState(category),[saving,setSaving]=useState(false),[error,setError]=useState('');
 useEffect(()=>{setDraft(category);onDirty(category.id||'new',false);},[category.id,category.name,category.description,category.sort_order]);
 const change=patch=>{setDraft(d=>({...d,...patch}));onDirty(category.id||'new',true);};
 async function save(){if(!draft.name.trim()||!/^[a-z0-9-]{2,40}$/.test(draft.id)||!Number.isInteger(draft.sort_order)||draft.sort_order<0||draft.sort_order>1000000){setError('请填写分类标识、名称及有效排序');return;}setSaving(true);onBusy(true);setError('');try{await api('/admin/categories'+(isNew?'':'/'+category.id),{method:isNew?'POST':'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify(draft)});await onSaved();onDirty(category.id||'new',false);if(isNew)onCreated();message.success('分类已保存');}catch(e){setError(e.message);}finally{setSaving(false);onBusy(false);}}
 async function remove(){setSaving(true);onBusy(true);try{await api('/admin/categories/'+category.id,{method:'DELETE'});await onSaved();onDirty(category.id,false);message.success('分类已删除');}catch(e){setError(e.message);}finally{setSaving(false);onBusy(false);}}
 return <div className="pm-category-row" role="group" aria-label={isNew?'新增分类':category.name}><label className="pm-category-name"><span>分类名称</span><Input aria-label={isNew?'新增分类名称':`${category.name} 名称`} placeholder="分类名称" value={draft.name} maxLength={60} disabled={saving||blocked} onChange={e=>change({name:e.target.value})}/></label><label className="pm-category-order"><span>排序</span><InputNumber aria-label={isNew?'新增分类排序':`${category.name} 排序`} controls={false} min={0} max={1000000} value={draft.sort_order} disabled={saving||blocked} onChange={value=>change({sort_order:value})}/></label><label className="pm-category-description"><span>分组说明</span><Input.TextArea aria-label={isNew?'新增分类说明':`${category.name} 分组说明`} placeholder="个人主页的分组说明（选填）" value={draft.description} maxLength={200} autoSize={{minRows:2,maxRows:3}} disabled={saving||blocked} onChange={e=>change({description:e.target.value})}/></label><Space className="pm-category-actions"><Button type={isNew?'primary':'default'} loading={saving} disabled={blocked&&!saving} onClick={save}>{isNew?'添加':'保存'}</Button>{!isNew&&category.id!=='other'&&<Tooltip title={count?'先将分类内的项目移到其他分类':undefined}><span><Popconfirm title="删除这个空分类？" onConfirm={remove} okText="删除" cancelText="取消" disabled={count>0||saving||blocked}><Button danger type="text" disabled={count>0||saving||blocked}>删除</Button></Popconfirm></span></Tooltip>}</Space>{error&&<div className="pm-category-error" role="alert">{error}</div>}</div>;

}
function CategoryManager({open,categories,rows,api,onClose,onSaved,setDirty,setBusy}){
 const {modal}=App.useApp();const changes=useRef(new Set());const [creating,setCreating]=useState(false),[busy,setLocalBusy]=useState(false);const newCategory=useRef({id:'',name:'',description:'',sort_order:0}),categoryBody=useRef(null);
 useEffect(()=>{if(creating)categoryBody.current?.scrollTo({top:0});},[creating]);
 useEffect(()=>{if(!open){changes.current.clear();setCreating(false);}},[open]);
 const dirty=(id,value)=>{value?changes.current.add(id):changes.current.delete(id);setDirty(changes.current.size>0);};
 const lock=value=>{setLocalBusy(value);setBusy(value);};
 const close=()=>{if(busy)return;if(changes.current.size)modal.confirm({title:'放弃未保存的分类修改？',okText:'放弃修改',cancelText:'继续编辑',onOk:()=>{changes.current.clear();setDirty(false);onClose();}});else onClose();};
 const addCategory=()=>{newCategory.current={id:'category-'+crypto.randomUUID().slice(0,8),name:'',description:'',sort_order:(categories.at(-1)?.sort_order||0)+10};setCreating(true);};
 return <Modal title={<div className="pm-category-heading"><span>管理分类</span><Button type="text" aria-label="新增分类" title="新增分类" onClick={addCategory} disabled={busy||creating} icon={<CategoryActionIcon/>}/></div>} open={open} closeIcon={<CategoryActionIcon close/>} onCancel={close} footer={<div className="pm-category-footer"><Button onClick={close} disabled={busy}>完成</Button></div>} width={920} className="pm-category-modal" maskClosable={false} destroyOnHidden>
  <div className="pm-category-body" ref={categoryBody}>
  {creating&&<CategoryRow category={newCategory.current} blocked={busy} isNew api={api} onSaved={onSaved} onDirty={dirty} onBusy={lock} onCreated={()=>setCreating(false)}/>}
  {categories.map(c=><CategoryRow key={c.id} category={c} blocked={busy} count={rows.filter(p=>p.category===c.id).length} api={api} onSaved={onSaved} onDirty={dirty} onBusy={lock}/>)}</div>
 </Modal>;

}

export function mountProjects({host,state,api,setDirty,onRefresh}){
 const root=createRoot(host),controller={busy:false};
 root.render(<AdminProvider><Projects {...{state,api,setDirty,onRefresh,controller}}/></AdminProvider>);
 return {isSaving:()=>controller.busy,dispose(){root.unmount();host.remove();setDirty(false);}};
}
