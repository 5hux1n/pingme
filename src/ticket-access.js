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
