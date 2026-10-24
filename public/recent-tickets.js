// Remembers the private links of feedback submitted or opened in this browser,
// so a visitor who comes back to a project's form can be pointed at the
// conversation already in progress instead of starting a new ticket.
// Holding the token is the proof of ownership; nothing is looked up by email.
const KEY='pingme:tickets',MAX=20,TTL=90*24*60*60*1000;
export const ACTIVE_STATUSES=new Set(['new','progress','resolved']);
const TOKEN=/^(?:[A-Za-z0-9]{12}|[a-f0-9]{64})$/;
const SLUG=/^[a-z0-9-]{1,50}$/;

export function tokenFromUrl(url){const m=String(url||'').match(/\/t\/([^/?#]+)/);return m&&TOKEN.test(m[1])?m[1]:'';}

export function createTicketStore(storage=globalThis.localStorage,now=()=>Date.now()){
 const read=()=>{try{const list=JSON.parse(storage?.getItem(KEY)||'[]');return Array.isArray(list)?list.filter(e=>e&&TOKEN.test(e.token)&&SLUG.test(e.slug)&&now()-Number(e.at)<TTL):[];}catch{return [];}};
 const write=list=>{try{storage?.setItem(KEY,JSON.stringify(list.slice(0,MAX)));}catch{/* Storage can be full, blocked or absent; the site works without it. */}};
 return {
  list:read,
  remember({token,slug,number=''}){if(!TOKEN.test(token||'')||!SLUG.test(slug||''))return;write([{token,slug,number:String(number).slice(0,32),at:now()},...read().filter(e=>e.token!==token)]);},
  forget(token){write(read().filter(e=>e.token!==token));},
  forProject(slug){return read().filter(e=>e.slug===slug);}
 };
}

// The most recent message from either side, ignoring automatic status changes.
export function lastSpeaker(messages){for(let i=(messages||[]).length-1;i>=0;i--){const role=messages[i]?.role;if(role==='admin'||role==='visitor')return role;}return '';}
