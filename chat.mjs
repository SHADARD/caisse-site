// Chargement à la demande : une panne de messagerie ne bloque jamais la connexion.
const PAGE=80;
const stamp=value=>new Date(value).toLocaleString('fr-CD',{timeZone:'Africa/Kinshasa',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});
export function createChat({client,profile}){
 const $=id=>document.getElementById(id);
 const status=$('chat-status'),list=$('chat-messages'),body=$('chat-body'),form=$('chat-form');
 let people=[],recipient=null,messages=[],older=false,active=false,destroyed=false,loading=false,sending=false,channel=null,timer=null,version=0,pending=null;
 const drafts=new Map();
 function say(text,error=false){status.textContent=text;status.dataset.error=String(error);}
 async function query(request){let timer;try{const result=await Promise.race([Promise.resolve(request),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('La messagerie ne répond pas. Votre brouillon est conservé.')),18000);})]);if(result.error)throw result.error;return result.data;}finally{clearTimeout(timer);}}
 function name(id){return people.find(p=>p.id===id)?.display_name||'Membre Flamingo';}
 function writable(){return recipient===null||people.some(p=>p.id===recipient&&p.is_active);}
 function renderPeople(){
  const search=$('chat-search').value.trim().toLocaleLowerCase();const fragment=document.createDocumentFragment();
  for(const person of people.filter(p=>p.id!==profile.id&&p.display_name.toLocaleLowerCase().includes(search)).sort((a,b)=>Number(b.is_active)-Number(a.is_active)||a.display_name.localeCompare(b.display_name,'fr'))){
   const button=document.createElement('button');button.type='button';button.className='chat-contact'+(recipient===person.id?' active':'');button.textContent=person.display_name;button.dataset.person=person.id;button.setAttribute('aria-pressed',String(recipient===person.id));
   if(!person.is_active){const hint=document.createElement('small');hint.textContent='Compte désactivé · historique';button.append(hint);}fragment.append(button);
  }
  if(!fragment.childNodes.length){const empty=document.createElement('p');empty.textContent='Aucun collègue trouvé.';fragment.append(empty);}
  $('chat-people').replaceChildren(fragment);$('chat-general').classList.toggle('active',recipient===null);$('chat-general').setAttribute('aria-pressed',String(recipient===null));
 }
 function heading(){
  $('chat-title').textContent=recipient===null?'Groupe général':name(recipient);
  $('chat-audience').textContent=recipient===null?'Visible par tous les comptes actifs.':'Message privé · uniquement vous et '+name(recipient)+'.';
  body.disabled=!writable();$('chat-send').disabled=sending||!writable();
 }
 function renderMessages({bottom=false}={}){
  const nearBottom=list.scrollHeight-list.scrollTop-list.clientHeight<80;
  const oldHeight=list.scrollHeight,oldTop=list.scrollTop;const fragment=document.createDocumentFragment();
  for(const message of messages){
   const article=document.createElement('article');article.className='chat-message'+(message.sender_id===profile.id?' mine':'');
   const header=document.createElement('header'),author=document.createElement('strong'),time=document.createElement('time'),text=document.createElement('p');
   author.textContent=message.sender_id===profile.id?'Vous':name(message.sender_id);time.dateTime=message.created_at;time.textContent=stamp(message.created_at);text.textContent=message.body;header.append(author,time);article.append(header,text);fragment.append(article);
  }
  if(!messages.length){const empty=document.createElement('p');empty.className='empty';empty.textContent=recipient===null?'Commencez la discussion avec toute l’équipe.':'Aucun message privé pour le moment.';fragment.append(empty);}
  list.replaceChildren(fragment);$('chat-older').hidden=!older;
  if(bottom||nearBottom)list.scrollTop=list.scrollHeight;else list.scrollTop=oldTop+Math.max(0,list.scrollHeight-oldHeight);
 }
 function merge(rows){const data=new Map(messages.map(m=>[m.id,m]));for(const m of rows)data.set(m.id,m);messages=[...data.values()].sort((a,b)=>a.created_at.localeCompare(b.created_at)||a.id.localeCompare(b.id));}
 function selectedRequest(){
  let request=client.from('chat_messages').select('id,sender_id,recipient_id,body,created_at');
  if(recipient===null)return request.is('recipient_id',null);
  return request.or(`and(sender_id.eq.${profile.id},recipient_id.eq.${recipient}),and(sender_id.eq.${recipient},recipient_id.eq.${profile.id})`);
 }
 async function load({previous=false}={}){
  if(!active||destroyed||loading)return;loading=true;const current=version;
  try{
   let request=selectedRequest().order('created_at',{ascending:false}).order('id',{ascending:false}).limit(PAGE);
   if(previous&&messages.length){const first=messages[0];request=request.or(`created_at.lt.${first.created_at},and(created_at.eq.${first.created_at},id.lt.${first.id})`);}
   const rows=await query(request);if(current!==version||!active||destroyed)return;
   if(previous||messages.length===0)older=rows.length===PAGE;
   merge(rows);renderMessages();say('Messages enregistrés · heure de Kinshasa');
  }catch(error){if(current===version&&active)say(error.code==='42P01'?'La messagerie doit encore être activée par votre responsable.':'Chargement impossible. '+(error.message||'Réessayez.'),true);}
  finally{loading=false;if(current!==version&&active&&!destroyed)queueMicrotask(()=>void load());}
 }
 async function choose(id){
  if(id===recipient&&messages.length)return;
  drafts.set(recipient,body.value);recipient=id;version++;messages=[];older=false;pending=null;body.value=drafts.get(recipient)||'';renderPeople();heading();renderMessages({bottom:true});say('Chargement des messages…');
  // Une requête de l’ancienne discussion peut encore être en cours ; attendre sans mélanger les résultats.
  if(!loading)await load();
 }
 async function loadPeople(){people=await query(client.from('chat_people').select('id,display_name,is_active').order('display_name'));if(destroyed)return;renderPeople();heading();}
 function stop(){if(timer){clearInterval(timer);timer=null;}if(channel){void client.removeChannel(channel).catch(()=>{});channel=null;}}
 function subscribe(){
  if(channel||typeof client.channel!=='function')return;
  // Les changements sont filtrés par les mêmes politiques RLS que la lecture REST.
  channel=client.channel('flamingo-chat-'+profile.id).on('postgres_changes',{event:'INSERT',schema:'public',table:'chat_messages'},()=>{if(active)void load();}).subscribe(state=>{if(!active)return;if(['CHANNEL_ERROR','TIMED_OUT','CLOSED'].includes(state))say('Actualisation automatique toutes les 20 secondes.');if(state==='SUBSCRIBED')void load();});
 }
 async function show(){
  if(destroyed)return;active=true;
  try{await loadPeople();if(!active||destroyed)return;await load();subscribe();if(!timer)timer=setInterval(()=>{if(active&&!document.hidden)void load();},20000);}
  catch(error){say('La messagerie est indisponible. '+(error.message||'Réessayez.'),true);}
 }
 function hide(){active=false;version++;stop();}
 function onVisible(){if(active&&!document.hidden){void loadPeople().then(()=>load()).catch(error=>say(error.message,true));}}
 $('chat-people').onclick=event=>{const button=event.target.closest('[data-person]');if(button)void choose(button.dataset.person);};
 $('chat-general').onclick=()=>void choose(null);
 $('chat-search').oninput=renderPeople;
 $('chat-refresh').onclick=()=>void show();
 $('chat-older').onclick=()=>void load({previous:true});
 body.onkeydown=event=>{if((event.ctrlKey||event.metaKey)&&event.key==='Enter'){event.preventDefault();form.requestSubmit();}};
 form.onsubmit=async event=>{
  event.preventDefault();if(sending||!writable())return;const text=body.value.trim();if(!text)return;
  const target=recipient;const selected=version;const draft=body.value;
  if(!pending||pending.body!==text||pending.recipient_id!==target)pending={id:crypto.randomUUID(),body:text,recipient_id:target};
  const message={...pending};sending=true;heading();say('Envoi en cours…');
  try{
   let saved;
   try{saved=await query(client.from('chat_messages').insert(message).select('id,sender_id,recipient_id,body,created_at').single());}
   catch(error){if(error.code!=='23505')throw error;saved=await query(client.from('chat_messages').select('id,sender_id,recipient_id,body,created_at').eq('id',message.id).single());}
   if(destroyed)return;pending=null;drafts.delete(target);
   if(selected===version){if(body.value===draft)body.value='';merge([saved]);renderMessages({bottom:true});say('Message envoyé.');}
  }catch(error){if(!destroyed&&selected===version)say('Message non envoyé. Votre brouillon est conservé. '+(error.message||'Réessayez.'),true);}
  finally{sending=false;if(!destroyed)heading();}
 };
 document.addEventListener('visibilitychange',onVisible);
 return{show,hide,destroy(){destroyed=true;hide();body.value='';messages=[];list.replaceChildren();$('chat-people').replaceChildren();drafts.clear();document.removeEventListener('visibilitychange',onVisible);}};
}
