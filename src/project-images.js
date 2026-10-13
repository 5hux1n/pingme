const MAX_SOURCE=5*1024*1024;
const MAX_OUTPUT=128*1024;
const keyPattern=/^project-icons\/[a-f0-9-]{36}\.(webp|png)$/;
export const imageUrl=key=>keyPattern.test(key||'')?'/api/project-images/'+key.slice('project-icons/'.length):'';
export const withImage=project=>{const {image_key,...data}=project;return {...data,image_url:imageUrl(image_key)};};
export function validImageSource(value){
 try{const u=new URL(value);const h=u.hostname.toLowerCase().replace(/^\[|\]$/g,'');return ['http:','https:'].includes(u.protocol)&&!u.username&&!u.password&&(!u.port||['80','443'].includes(u.port))&&h.includes('.')&&!h.endsWith('.local')&&!h.endsWith('.internal')&&!h.endsWith('.localhost')&&!privateAddress(h)&&h!=='localhost';}catch{return false;}
}
function privateAddress(address){
 const a=address.toLowerCase();if(a.includes(':'))return !/^[23][0-9a-f]{3}:/.test(a);
 if(!/^\d+\.\d+\.\d+\.\d+$/.test(a))return false;
 const [x,y]=a.split('.').map(Number);return x===0||x===10||x===127||x>=224||x===169&&y===254||x===172&&y>=16&&y<=31||x===192&&y===168||x===100&&y>=64&&y<=127||x===198&&[18,19].includes(y);
}
async function checkHost(host,signal){
 if(/^\d+\.\d+\.\d+\.\d+$/.test(host))return;
 const records=await Promise.all(['A','AAAA'].map(async type=>{const response=await fetch('https://cloudflare-dns.com/dns-query?'+new URLSearchParams({name:host,type}),{headers:{accept:'application/dns-json'},signal});if(!response.ok)throw Error('无法解析图片域名');return (await response.json()).Answer||[];}));
 const addresses=records.flat().filter(r=>r.type===1||r.type===28).map(r=>r.data);if(!addresses.length||addresses.some(privateAddress))throw Error('请使用公开网站的图片地址');
}
export async function fetchImageSource(value){
 if(!validImageSource(value))throw Error('图片链接必须是公开网站的 HTTP 或 HTTPS 地址');
 const signal=AbortSignal.timeout(15000);let url=value;
 for(let i=0;i<5;i++){
  if(!validImageSource(url))throw Error('图片跳转地址不可用');await checkHost(new URL(url).hostname,signal);
  const response=await fetch(url,{redirect:'manual',signal,headers:{accept:'image/png,image/jpeg,image/webp,image/gif,image/svg+xml', 'user-agent':'PingMe image importer'}});
  if(response.status>=300&&response.status<400){const location=response.headers.get('location');await response.body?.cancel();if(!location)throw Error('图片地址跳转失败');url=new URL(location,url).href;continue;}
  if(!response.ok){await response.body?.cancel();throw Error('图片下载失败（'+response.status+'）');}
  const type=(response.headers.get('content-type')||'').split(';')[0].trim().toLowerCase();
  if(!['image/png','image/jpeg','image/webp','image/gif','image/svg+xml'].includes(type)){await response.body?.cancel();throw Error('链接没有返回支持的图片，请使用图片直链');}
  if(Number(response.headers.get('content-length')||0)>MAX_SOURCE){await response.body?.cancel();throw Error('图片不能超过 5MB');}
  const reader=response.body.getReader(),chunks=[];let size=0;
  try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>MAX_SOURCE){await reader.cancel();throw Error('图片不能超过 5MB');}chunks.push(value);}}finally{reader.releaseLock();}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}if(!size)throw Error('图片内容为空');return {bytes,type};
 }
 throw Error('图片地址跳转次数过多');
}
function outputDimensions(bytes){
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),ascii=(a,b)=>String.fromCharCode(...bytes.slice(a,b));
 if(bytes.length>=24&&ascii(1,4)==='PNG'&&bytes[0]===137&&ascii(12,16)==='IHDR')return {width:view.getUint32(16),height:view.getUint32(20),type:'image/png',ext:'png'};
 if(bytes.length<30||ascii(0,4)!=='RIFF'||ascii(8,12)!=='WEBP')throw Error('图片处理格式不正确，请重新选择图片');
 const chunk=ascii(12,16);let width,height;
 if(chunk==='VP8X'){width=1+bytes[24]+(bytes[25]<<8)+(bytes[26]<<16);height=1+bytes[27]+(bytes[28]<<8)+(bytes[29]<<16);if(bytes[20]&2)throw Error('请使用静态图片');}
 else if(chunk==='VP8L'&&bytes[20]===47){width=1+bytes[21]+((bytes[22]&63)<<8);height=1+(bytes[22]>>6)+(bytes[23]<<2)+((bytes[24]&15)<<10);}
 else if(chunk==='VP8 '&&bytes[23]===157&&bytes[24]===1&&bytes[25]===42){width=view.getUint16(26,true)&16383;height=view.getUint16(28,true)&16383;}
 else throw Error('无法读取处理后的图片');
 return {width,height,type:'image/webp',ext:'webp'};
}
export async function readProjectBody(request){
 if(Number(request.headers.get('content-length')||0)>256*1024)throw Error('处理后的图片过大');
 if(!(request.headers.get('content-type')||'').startsWith('multipart/form-data'))return {body:await request.json(),image:null};
 const form=await request.formData(),body=JSON.parse(form.get('data')||'{}');let image=null;
 if(body.image_action==='replace'){
  const file=form.get('image');if(!(file instanceof File)||!file.size||file.size>MAX_OUTPUT)throw Error('请选择有效图片');
  const bytes=new Uint8Array(await file.arrayBuffer()),info=outputDimensions(bytes);if(!info.width||!info.height||info.width>144||info.height>144)throw Error('图片需要先缩放到 144 像素以内');
  image={bytes,...info};
 }
 return {body,image};
}
export async function saveProject(request,env,slug=null){
 const url=new URL(request.url);if(request.headers.get('origin')!==url.origin)return {error:'请从本站后台保存项目',status:403};
 let body,image;try{({body,image}=await readProjectBody(request));}catch(e){return {error:e.message||'表单格式错误',status:400};}
 const name=String(body.name??'').trim().slice(0,80),description=String(body.description??'').trim().slice(0,200),official=body.official_url===undefined?null:String(body.official_url).trim().slice(0,1000);
 if(!name)return {error:'项目名称不能为空',status:400};
 if(official){try{const u=new URL(official);if(!['http:','https:'].includes(u.protocol)||u.username||u.password)throw Error();}catch{return {error:'官网地址必须是有效的 HTTP 或 HTTPS 链接',status:400};}}
 const creating=slug===null;slug=creating?String(body.slug??'').trim().toLowerCase():slug;
 if(!/^[a-z0-9-]{2,50}$/.test(slug))return {error:'项目路径不合法',status:400};
 const existing=await env.DB.prepare('SELECT id,image_key,image_source FROM projects WHERE slug=?').bind(slug).first();
 if(creating&&existing)return {error:'项目路径已存在',status:409};if(!creating&&!existing)return {error:'项目不存在',status:404};
 const action=body.image_action||'keep';if(!['keep','replace','remove'].includes(action))return {error:'图片操作不正确',status:400};
 if(!creating&&body.image_version!==undefined&&body.image_version!==(existing.image_key||''))return {error:'项目图片已被其他页面修改，请重新加载项目',status:409};
 if(action==='replace'&&!image)return {error:'请选择处理后的图片',status:400};
 const source=String(body.image_source??'').trim();if(action==='replace'&&source&&!validImageSource(source))return {error:'图片来源地址无效',status:400};
 let key=existing?.image_key||'',sourceUrl=existing?.image_source||'',newKey='';
 if(action==='replace'){newKey='project-icons/'+crypto.randomUUID()+'.'+image.ext;await env.FILES.put(newKey,image.bytes,{httpMetadata:{contentType:image.type,cacheControl:'public, max-age=31536000, immutable'}});key=newKey;sourceUrl=source;}
 if(action==='remove'){key='';sourceUrl='';}
 try{
  if(creating)await env.DB.prepare('INSERT INTO projects(id,slug,name,description,official_url,visible,enabled,image_key,image_source) VALUES(?,?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(),slug,name,description,official||'',body.visible?1:0,body.enabled?1:0,key,sourceUrl).run();
  else {const result=await env.DB.prepare('UPDATE projects SET name=?,description=?,official_url=COALESCE(?,official_url),visible=?,enabled=?,image_key=?,image_source=? WHERE slug=? AND image_key=?').bind(name,description,official,body.visible?1:0,body.enabled?1:0,key,sourceUrl,slug,existing.image_key||'').run();if((result.meta?.changes??result.changes)===0){if(newKey)await env.FILES.delete(newKey);return {error:'项目已被其他页面修改，请重新加载后保存',status:409};}}
 }catch(e){if(newKey)await env.FILES.delete(newKey);throw e;}
 if(existing?.image_key&&existing.image_key!==key)await env.FILES.delete(existing.image_key).catch(e=>console.error('Old project image cleanup failed',e));
 return {ok:true,slug,image_url:imageUrl(key)};
}
export async function serveProjectImage(request,env){
 const name=new URL(request.url).pathname.split('/').pop(),key='project-icons/'+name;if(!keyPattern.test(key))return new Response('Not found',{status:404});
 const active=await env.DB.prepare('SELECT id FROM projects WHERE image_key=?').bind(key).first();if(!active)return new Response('Not found',{status:404,headers:{'cache-control':'no-store'}});
 const object=await env.FILES.get(key);if(!object)return new Response('Not found',{status:404});
 const headers=new Headers({'x-content-type-options':'nosniff','content-security-policy':"default-src 'none'",'cache-control':'public, max-age=31536000, immutable','etag':object.httpEtag});object.writeHttpMetadata(headers);
 return new Response(request.method==='HEAD'?null:object.body,{headers});
}
