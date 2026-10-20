export function rasterMime(bytes){
 const b=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes);
 if(b.length>=8&&[137,80,78,71,13,10,26,10].every((v,i)=>b[i]===v))return 'image/png';
 if(b.length>=3&&b[0]===255&&b[1]===216&&b[2]===255)return 'image/jpeg';
 const text=(start,end)=>String.fromCharCode(...b.slice(start,end));
 if(b.length>=6&&['GIF87a','GIF89a'].includes(text(0,6)))return 'image/gif';
 if(b.length>=12&&text(0,4)==='RIFF'&&text(8,12)==='WEBP')return 'image/webp';
 return '';
}
// Read image dimensions without decoding the bitmap in Worker memory.
export function imageSize(bytes,mime=rasterMime(bytes)){
 const b=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes),v=new DataView(b.buffer,b.byteOffset,b.byteLength);
 let width=0,height=0;
 try{
  if(mime==='image/png'&&b.length>=24){width=v.getUint32(16);height=v.getUint32(20);}
  else if(mime==='image/gif'&&b.length>=10){width=v.getUint16(6,true);height=v.getUint16(8,true);}
  else if(mime==='image/jpeg'){
   for(let i=2;i+4<b.length;){
    if(b[i++]!==255)continue;while(b[i]===255)i++;const marker=b[i++];
    if(marker===217||marker===218)break;if(marker===216||marker===1||(marker>=208&&marker<=215))continue;
    const length=v.getUint16(i);if(length<2||i+length>b.length)break;
    if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker)&&length>=7){height=v.getUint16(i+3);width=v.getUint16(i+5);break;}i+=length;
   }
  }else if(mime==='image/webp'){
   for(let i=12;i+8<=b.length;){
    const kind=String.fromCharCode(...b.subarray(i,i+4)),length=v.getUint32(i+4,true),start=i+8;
    if(start+length>b.length)break;
    if(kind==='VP8X'&&length>=10){width=1+b[start+4]+(b[start+5]<<8)+(b[start+6]<<16);height=1+b[start+7]+(b[start+8]<<8)+(b[start+9]<<16);break;}
    if(kind==='VP8 '&&length>=10){width=v.getUint16(start+6,true)&16383;height=v.getUint16(start+8,true)&16383;break;}
    if(kind==='VP8L'&&length>=5){const bits=v.getUint32(start+1,true);width=1+(bits&16383);height=1+((bits>>>14)&16383);break;}
    i=start+length+(length%2);
   }
  }
 }catch{return null;}
 return width>0&&height>0?{width,height}:null;
}
const encode=bytes=>{let binary='';for(let i=0;i<bytes.length;i+=16384)binary+=String.fromCharCode(...bytes.subarray(i,i+16384));return btoa(binary);};
// Bound raw bytes as well as the resulting request to stay inside Worker memory limits.
export async function mailFiles(env,files,{budget=15*1024*1024}={}){
 const attachments=[],images=[];let total=0,omitted=0;
 for(const file of files){
  if(file.bytes>10*1024*1024||file.bytes>budget-total){omitted++;continue;}
  try{
   const object=await env.FILES.get(file.object_key);if(!object){omitted++;continue;}
   const bytes=new Uint8Array(await new Response(object.body).arrayBuffer());
   if(bytes.length>10*1024*1024||bytes.length>budget-total){omitted++;continue;}
   const mime=rasterMime(bytes),attachment={filename:String(file.name).replace(/[\r\n]/g,'').slice(0,150)||'attachment',content:encode(bytes)};
   if(mime){
    const contentId='feedback-image-'+images.length;
    attachment.content_id=contentId;attachment.content_type=mime;
    const size=imageSize(bytes,mime),scale=size?Math.min(1,520/size.width,640/size.height):1;
    images.push({contentId,width:size?Math.max(1,Math.round(size.width*scale)):520,height:size?Math.max(1,Math.round(size.height*scale)):null});
   }
   attachments.push(attachment);total+=bytes.length;
  }catch{omitted++;}
 }
 return {attachments,images,omitted};
}
