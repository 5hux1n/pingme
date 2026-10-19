const formatter=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
export function formatBeijingTime(value,{seconds=false}={}){
 if(value===null||value===undefined||value==='')return '';
 let input=value;
 if(typeof input==='string'){
  input=input.trim();
  // SQLite CURRENT_TIMESTAMP has no suffix but is always UTC.
  if(/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(input))input=input.replace(' ','T')+'Z';
 }
 const date=new Date(input);if(!Number.isFinite(date.getTime()))return '';
 const p=Object.fromEntries(formatter.formatToParts(date).map(part=>[part.type,part.value]));
 return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}${seconds?':'+p.second:''}`;
}
