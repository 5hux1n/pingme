const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function feedbackFiles(files=[],token=''){
 if(!files.length)return '';
 return `<div class="feedback-files">${files.map(file=>{
  const query=new URLSearchParams(token?{token}:{}),base='/api/attachments/'+encodeURIComponent(file.id),download=base+(query.toString()?'?'+query:'');query.set('inline','1');
  const picture=/^image\/(png|jpeg|gif|webp)$/.test(file.mime)||/\.(png|jpe?g|gif|webp)$/i.test(file.name);
  if(picture)return `<figure class="feedback-picture"><a href="${esc(base+'?'+query)}" target="_blank" rel="noopener noreferrer" aria-label="查看原图"><img src="${esc(base+'?'+query)}" alt="反馈图片" loading="lazy" decoding="async"></a><figcaption><span title="${esc(file.name)}">${esc(file.name)}</span><a href="${esc(download)}" download>下载</a></figcaption></figure>`;
  return `<a class="feedback-file" href="${esc(download)}" download><span>${esc(file.name)}</span><small>${Math.ceil(file.bytes/1024)} KB · 下载</small></a>`;
 }).join('')}</div>`;
}
