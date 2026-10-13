export async function processProjectImage(blob){
  if(!blob.size||blob.size>5*1024*1024)throw Error('图片不能超过 5MB');
  if(!['image/png','image/jpeg','image/webp','image/gif','image/svg+xml'].includes(blob.type))throw Error('请选择 PNG、JPG、WebP、GIF 或 SVG 图片');
  const url=URL.createObjectURL(blob),image=new Image();
  try{image.src=url;await image.decode();const width=image.naturalWidth,height=image.naturalHeight;if(!width||!height||width>4096||height>4096||width*height>16*1024*1024)throw Error('图片尺寸过大，请使用 4096 像素以内的图片');
   const scale=Math.min(1,144/width,144/height),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(width*scale));canvas.height=Math.max(1,Math.round(height*scale));const context=canvas.getContext('2d');context.imageSmoothingQuality='high';context.drawImage(image,0,0,canvas.width,canvas.height);
   const result=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',.9));if(!result||result.size>128*1024)throw Error('图片处理失败，请换一张图片');return result;
  }catch(error){if(error.name==='EncodingError')throw Error('无法读取图片，请选择有效的图片文件');throw error;}finally{URL.revokeObjectURL(url);}
 }
