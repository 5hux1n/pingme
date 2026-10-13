export function createProjectImageEditor({root,project,esc,glyph,onChange}){
 const $=selector=>root.querySelector(selector);let mode=project.image_source?'link':'upload',file=null,force=false,remove=false,previewUrl='';
 const markup=`<fieldset class="project-image-field"><legend>项目图片</legend><div class="project-image-options" role="group" aria-label="图片来源"><button type="button" data-image-mode="upload" aria-pressed="${mode==='upload'}">上传图片</button><button type="button" data-image-mode="link" aria-pressed="${mode==='link'}">图片链接</button></div><div class="project-image-preview" id="projectImagePreview">${glyph(project)}</div><div id="projectImageUpload" ${mode==='upload'?'':'hidden'}><label class="sr-only" for="projectImageFile">选择项目图片</label><input id="projectImageFile" type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"/><small>PNG、JPG、WebP、GIF 或 SVG，最多 5MB；动图保存为静态图片。</small></div><div id="projectImageLink" ${mode==='link'?'':'hidden'}><label class="sr-only" for="projectImageSource">图片链接</label><input id="projectImageSource" type="url" placeholder="https://example.com/icon.png" value="${esc(project.image_source||'')}" maxlength="2000"/><small>使用图片直链。保存后从本站加载图片。</small><button type="button" class="outline" id="refreshProjectImage">重新获取图片</button></div><div class="project-image-actions"><button type="button" class="outline" id="removeProjectImage">恢复默认图片</button><span id="projectImageStatus" role="status" aria-live="polite"></span></div></fieldset>`;
 function release(){if(previewUrl){URL.revokeObjectURL(previewUrl);previewUrl='';}}
 async function process(blob){
  if(!blob.size||blob.size>5*1024*1024)throw Error('图片不能超过 5MB');
  if(!['image/png','image/jpeg','image/webp','image/gif','image/svg+xml'].includes(blob.type))throw Error('请选择 PNG、JPG、WebP、GIF 或 SVG 图片');
  const url=URL.createObjectURL(blob),image=new Image();
  try{image.src=url;await image.decode();const width=image.naturalWidth,height=image.naturalHeight;if(!width||!height||width>4096||height>4096||width*height>16*1024*1024)throw Error('图片尺寸过大，请使用 4096 像素以内的图片');
   const scale=Math.min(1,144/width,144/height),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(width*scale));canvas.height=Math.max(1,Math.round(height*scale));const context=canvas.getContext('2d');context.imageSmoothingQuality='high';context.drawImage(image,0,0,canvas.width,canvas.height);
   const result=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',.9));if(!result||result.size>128*1024)throw Error('图片处理失败，请换一张图片');return result;
  }catch(error){if(error.name==='EncodingError')throw Error('无法读取图片，请选择有效的图片文件');throw error;}finally{URL.revokeObjectURL(url);}
 }
 function mount(){
  root.querySelectorAll('[data-image-mode]').forEach(button=>button.onclick=()=>{mode=button.dataset.imageMode;remove=false;root.querySelectorAll('[data-image-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));$('#projectImageUpload').hidden=mode!=='upload';$('#projectImageLink').hidden=mode!=='link';onChange();});
  $('#projectImageFile').onchange=event=>{release();file=event.target.files[0]||null;remove=false;if(file){previewUrl=URL.createObjectURL(file);$('#projectImagePreview').innerHTML=`<img src="${previewUrl}" alt="待保存的项目图片" width="48" height="48"/>`;$('#projectImageStatus').textContent='保存时自动处理图片';}onChange();};
  $('#projectImageSource').oninput=()=>{remove=false;force=false;onChange();};
  $('#refreshProjectImage').onclick=()=>{force=true;remove=false;$('#projectImageStatus').textContent='保存时重新获取图片';onChange();};
  $('#removeProjectImage').onclick=()=>{release();remove=true;file=null;force=false;$('#projectImageFile').value='';$('#projectImageSource').value='';$('#projectImagePreview').innerHTML=glyph({...project,image_url:''});$('#projectImageStatus').textContent='保存后恢复默认图片';onChange();};
 }
 async function prepare(){
  const version=project.image_key||'',data={image_action:'keep',image_version:version};
  if(remove)return {data:{...data,image_action:'remove'}};
  let blob,source='';
  if(mode==='upload'){if(!file)return {data};blob=file;}
  else {source=$('#projectImageSource').value.trim();if(!source)return {data:{...data,image_action:project.image_source?'remove':'keep'}};if(source===project.image_source&&project.image_url&&!force)return {data};
   $('#projectImageStatus').textContent='正在获取图片…';let response;try{response=await fetch('/api/admin/project-image-source',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({url:source})});}catch{throw Error('图片获取失败，请检查网络后重试');}
   if(!response.ok){const error=await response.json().catch(()=>({}));throw Error(error.error||'图片获取失败');}blob=await response.blob();
  }
  $('#projectImageStatus').textContent='正在处理图片…';const image=await process(blob);return {data:{...data,image_action:'replace',image_source:source},image};
 }
 return {markup,mount,prepare,dispose:release};
}
