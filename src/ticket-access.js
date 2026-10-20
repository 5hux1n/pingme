const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
export const validTicketToken=token=>/^(?:[A-Za-z0-9]{12}|[a-f0-9]{64})$/.test(token||'');
export function shortTicketToken(){
 let token='';
 // Reject the remainder of 256 / 62 so every character has equal probability.
 while(token.length<12)for(const byte of crypto.getRandomValues(new Uint8Array(24))){
  if(byte<248)token+=alphabet[byte%62];
  if(token.length===12)break;
 }
 return token;
}

export function ticketNumber(now=new Date()){
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
 const date=['year','month','day'].map(type=>parts.find(p=>p.type===type).value).join('');
 let value;do{value=crypto.getRandomValues(new Uint32Array(1))[0];}while(value>=4294000000);
 return 'PM'+date+String(value%1000000).padStart(6,'0');
}
