export function createChatNotifications({client,profile,onCounts=()=>{}}){
 let stopped=false,fetching=false,again=false,channel=null,timer=null,debounce=null;
 const marked=new Map(),marking=new Map();let counts={};
 function paint(){
  const total=Object.values(counts).reduce((sum,n)=>sum+n,0);const badge=document.getElementById('chat-unread');
  if(badge){badge.textContent=total>99?'99+':String(total);badge.hidden=total===0;badge.parentElement.setAttribute('aria-label',total?'Messages, '+total+' non lus':'Messages');}
  onCounts({...counts});
 }
 async function rpc(name,args={}){let limit;try{const result=await Promise.race([client.rpc(name,args),new Promise((_,reject)=>{limit=setTimeout(()=>reject(Error('Notifications indisponibles')),15000);})]);if(result.error)throw result.error;return result.data;}finally{clearTimeout(limit);}}
 async function refresh(){
  if(stopped)return;if(fetching){again=true;return;}fetching=true;
  try{const rows=await rpc('chat_unread_counts');if(stopped)return;counts=Object.fromEntries((rows||[]).map(r=>[r.conversation_key,Math.max(0,Number(r.unread_count)||0)]));paint();}
  catch{ /* Conserver le dernier compteur et réessayer au prochain passage. */ }
  finally{fetching=false;if(again&&!stopped){again=false;void refresh();}}
 }
 function schedule(){if(stopped)return;clearTimeout(debounce);debounce=setTimeout(()=>void refresh(),150);}
 function visible(){if(!document.hidden)schedule();}
 async function markRead(peer,message){
  const key=peer||'general';if(stopped||marked.get(key)===message||marking.get(key)===message)return;marking.set(key,message);
  // Ne jamais publier de texte de message : seul le curseur de lecture est enregistré.
  try{await rpc('mark_chat_read',{p_peer:peer,p_message:message});if(stopped)return;marked.set(key,message);await refresh();}catch{}finally{if(marking.get(key)===message)marking.delete(key);}
 }
 function start(){
  if(stopped)return;void refresh();
  if(typeof client.channel==='function')channel=client.channel('flamingo-unread-'+profile.id)
   .on('postgres_changes',{event:'INSERT',schema:'public',table:'chat_messages'},schedule)
   .on('postgres_changes',{event:'*',schema:'public',table:'chat_read_state',filter:'user_id=eq.'+profile.id},schedule)
   .subscribe(state=>{if(state==='SUBSCRIBED')schedule();});
  timer=setInterval(()=>{if(!document.hidden)void refresh();},20000);document.addEventListener('visibilitychange',visible);window.addEventListener('online',visible);
 }
 function destroy(){stopped=true;clearTimeout(debounce);clearInterval(timer);if(channel)void client.removeChannel(channel).catch(()=>{});document.removeEventListener('visibilitychange',visible);window.removeEventListener('online',visible);counts={};paint();}
 return{start,refresh,markRead,destroy};
}
