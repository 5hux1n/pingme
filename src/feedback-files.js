export function rasterMime(bytes){
 const b=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes);
 if(b.length>=8&&[137,80,78,71,13,10,26,10].every((v,i)=>b[i]===v))return 'image/png';
 if(b.length>=3&&b[0]===255&&b[1]===216&&b[2]===255)return 'image/jpeg';
 const text=(start,end)=>String.fromCharCode(...b.slice(start,end));
 if(b.length>=6&&['GIF87a','GIF89a'].includes(text(0,6)))return 'image/gif';
 if(b.length>=12&&text(0,4)==='RIFF'&&text(8,12)==='WEBP')return 'image/webp';
 return '';
}
const encode=bytes=>{let binary='';for(let i=0;i<bytes.length;i+=16384)binary+=String.fromCharCode(...bytes.subarray(i,i+16384));return btoa(binary);};
// Bound raw bytes as well as the resulting request to stay inside Worker memory limits.
export async function mailFiles(env,files,{budget=15*1024*1024}={}){
 const attachments=[];let total=0,omitted=0;
 for(const file of files){
  if(file.bytes>10*1024*1024||file.bytes>budget-total){omitted++;continue;}
  try{
   const object=await env.FILES.get(file.object_key);if(!object){omitted++;continue;}
   const bytes=new Uint8Array(await new Response(object.body).arrayBuffer());
   if(bytes.length>10*1024*1024||bytes.length>budget-total){omitted++;continue;}
   attachments.push({filename:String(file.name).replace(/[\r\n]/g,'').slice(0,150)||'attachment',content:encode(bytes)});total+=bytes.length;
  }catch{omitted++;}
 }
 return {attachments,omitted};
}
