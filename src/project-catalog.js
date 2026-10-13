import { withImage } from './project-images.js';
export const projectFields='p.id,p.slug,p.name,p.description,p.official_url,p.category,p.sort_order,p.homepage_visible,p.visible,p.enabled,p.image_key,p.image_path';
export const projectOrder='c.sort_order,p.sort_order,p.name,p.slug';
export async function categories(env){return (await env.DB.prepare('SELECT id,name,description,sort_order FROM project_categories ORDER BY sort_order,name,id').all()).results;}
export async function projectRows(env,where='1=1'){
 return (await env.DB.prepare(`SELECT ${projectFields},COALESCE(c.name,'其他项目') category_name FROM projects p LEFT JOIN project_categories c ON c.id=p.category WHERE ${where} ORDER BY ${projectOrder}`).all()).results.map(withImage);
}
export async function catalogResponse(request,env){
 const [groups,projects]=await Promise.all([categories(env),projectRows(env,'p.homepage_visible=1')]);
 const data={categories:groups,projects:projects.map(p=>({...p,image_url:p.image_url?new URL(p.image_url,request.url).href:'',feedback_url:new URL('/'+p.slug,request.url).href}))};
 const body=JSON.stringify(data),digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(body)),etag='"'+Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,'0')).join('')+'"';
 const headers={'content-type':'application/json; charset=utf-8','cache-control':'public, max-age=60, s-maxage=60','access-control-allow-origin':'*','access-control-expose-headers':'ETag','x-content-type-options':'nosniff',etag};
 return request.headers.get('if-none-match')===etag?new Response(null,{status:304,headers}):new Response(body,{headers});
}
export async function saveCategory(request,env,id=null){
 if(request.headers.get('origin')!==new URL(request.url).origin)return {error:'请从本站后台保存分类',status:403};
 const body=await request.json().catch(()=>null);if(!body)return {error:'分类格式错误',status:400};
 id=id||String(body.id||'').trim().toLowerCase();const name=String(body.name||'').trim(),description=String(body.description||'').trim(),order=Number(body.sort_order);
 if(!/^[a-z0-9-]{2,40}$/.test(id)||!name||name.length>60||description.length>200||!Number.isSafeInteger(order)||order<0||order>1000000)return {error:'请检查分类标识、名称和排序',status:400};
 if(request.method==='POST'){const existing=await env.DB.prepare('SELECT id FROM project_categories WHERE id=?').bind(id).first();if(existing)return {error:'分类标识已存在',status:409};await env.DB.prepare('INSERT INTO project_categories(id,name,description,sort_order) VALUES(?,?,?,?)').bind(id,name,description,order).run();}
 else {const result=await env.DB.prepare('UPDATE project_categories SET name=?,description=?,sort_order=? WHERE id=?').bind(name,description,order,id).run();if((result.meta?.changes??result.changes)===0)return {error:'分类不存在',status:404};}
 return {ok:true};
}
export async function deleteCategory(request,env,id){
 if(request.headers.get('origin')!==new URL(request.url).origin)return {error:'请从本站后台删除分类',status:403};
 if(id==='other')return {error:'默认分类不能删除',status:400};
 const result=await env.DB.prepare('DELETE FROM project_categories WHERE id=? AND NOT EXISTS(SELECT 1 FROM projects WHERE category=?)').bind(id,id).run();
 return (result.meta?.changes??result.changes)?{ok:true}:{error:'分类仍有项目或已不存在，请先调整项目分类',status:409};
}
