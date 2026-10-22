import {describeFile,fileSize,previewable} from './chat-files.mjs';
// Chargement à la demande : une panne de messagerie ne bloque jamais la connexion.
const PAGE=80;
const COLUMNS='id,sender_id,recipient_id,body,created_at,attachment_path,attachment_name,attachment_type,attachment_size';
const stamp=value=>new Date(value).toLocaleString('fr-CD',{timeZone:'Africa/Kinshasa',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});
export function createChat({client,profile,initialUnread={},onRead=()=>{}}){
 const $=id=>document.getElementById(id);
 const status=$('chat-status'),list=$('chat-messages'),body=$('chat-body'),form=$('chat-form');
 let people=[],recipient=null,messages=[],older=false,active=false,destroyed=false,loading=false,sending=false,channel=null,timer=null,version=0,pending=null;
 const drafts=new Map(),fileDrafts=new Map(),signedFiles=new Map();let selectedFile=null,previewUrl=null;let unread=initialUnread,readTimer=null;
 function markVisible(){if(active&&!destroyed&&!document.hidden&&messages.length&&list.scrollHeight-list.scrollTop-list.clientHeight<80)void onRead(recipient,messages[messages.length-1].id);}
 function addBadge(button,count){if(!count)return;const badge=document.createElement('span');badge.className='chat-count';badge.textContent=count>99?'99+':String(count);badge.setAttribute('aria-label',count+' messages non lus');button.append(badge);}
 function say(text,error=false){status.textContent=text;status.dataset.error=String(error);}
 async function query(request,timeout=18000){let timer;try{const result=await Promise.race([Promise.resolve(request),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('La messagerie ne répond pas. Votre brouillon est conservé.')),timeout);})]);if(result.error)throw result.error;return result.data;}finally{clearTimeout(timer);}}
 function name(id){return people.find(p=>p.id===id)?.display_name||'Membre Flamingo';}
 function writable(){return recipient===null||people.some(p=>p.id===recipient&&p.is_active);}
 function renderPeople(){
  const search=$('chat-search').value.trim().toLocaleLowerCase();const fragment=document.createDocumentFragment();
  for(const person of people.filter(p=>p.id!==profile.id&&p.display_name.toLocaleLowerCase().includes(search)).sort((a,b)=>Number(b.is_active)-Number(a.is_active)||a.display_name.localeCompare(b.display_name,'fr'))){
   const button=document.createElement('button');button.type='button';button.disabled=sending;button.className='chat-contact'+(recipient===person.id?' active':'');button.textContent=person.display_name;button.dataset.person=person.id;button.setAttribute('aria-pressed',String(recipient===person.id));
   if(!person.is_active){const hint=document.createElement('small');hint.textContent='Compte désactivé · historique';button.append(hint);}addBadge(button,unread[person.id]);fragment.append(button);
  }
  if(!fragment.childNodes.length){const empty=document.createElement('p');empty.textContent='Aucun collègue trouvé.';fragment.append(empty);}
  $('chat-people').replaceChildren(fragment);$('chat-general').classList.toggle('active',recipient===null);$('chat-general').setAttribute('aria-pressed',String(recipient===null));const badge=$('chat-general-unread');if(badge){const count=unread.general||0;badge.textContent=count>99?'99+':String(count);badge.hidden=!count;}
 }
 function heading(){
  $('chat-title').textContent=recipient===null?'Groupe général':name(recipient);
  $('chat-audience').textContent=recipient===null?'Visible par tous les comptes actifs.':'Message privé · uniquement vous et '+name(recipient)+'.';
  body.disabled=!writable();$('chat-send').disabled=sending||!writable();$('chat-attach').disabled=sending||!writable();$('chat-file-remove').disabled=sending;$('chat-general').disabled=sending;document.querySelectorAll('[data-person]').forEach(button=>button.disabled=sending);
 }
 function renderMessages({bottom=false}={}){
  const nearBottom=list.scrollHeight-list.scrollTop-list.clientHeight<80;
  const oldHeight=list.scrollHeight,oldTop=list.scrollTop;const fragment=document.createDocumentFragment();
  for(const message of messages){
   const article=document.createElement('article');article.className='chat-message'+(message.sender_id===profile.id?' mine':'');
   const header=document.createElement('header'),author=document.createElement('strong'),time=document.createElement('time'),text=document.createElement('p');
   author.textContent=message.sender_id===profile.id?'Vous':name(message.sender_id);time.dateTime=message.created_at;time.textContent=stamp(message.created_at);text.textContent=message.body;header.append(author,time);article.append(header);if(message.body)article.append(text);if(message.attachment_path)renderFile(article,message);fragment.append(article);
  }
  if(!messages.length){const empty=document.createElement('p');empty.className='empty';empty.textContent=recipient===null?'Commencez la discussion avec toute l’équipe.':'Aucun message privé pour le moment.';fragment.append(empty);}
  list.replaceChildren(fragment);$('chat-older').hidden=!older;
  if(bottom||nearBottom)list.scrollTop=list.scrollHeight;else list.scrollTop=oldTop+Math.max(0,list.scrollHeight-oldHeight);
  clearTimeout(readTimer);readTimer=setTimeout(markVisible,150);
 }
 function merge(rows){const data=new Map(messages.map(m=>[m.id,m]));for(const m of rows)data.set(m.id,m);messages=[...data.values()].sort((a,b)=>a.created_at.localeCompare(b.created_at)||a.id.localeCompare(b.id));}
 function selectedRequest(){
  let request=client.from('chat_messages').select(COLUMNS);
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
  drafts.set(recipient,body.value);if(selectedFile)fileDrafts.set(recipient,selectedFile);else fileDrafts.delete(recipient);recipient=id;version++;messages=[];older=false;pending=null;body.value=drafts.get(recipient)||'';selectFile(fileDrafts.get(recipient)||null);renderPeople();heading();renderMessages({bottom:true});say('Chargement des messages…');
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
  event.preventDefault();if(sending||!writable())return;const text=body.value.trim();if(!text&&!selectedFile)return;
  const target=recipient,selected=version,draft=body.value,file=selectedFile;
  if(!pending||pending.body!==text||pending.recipient_id!==target||pending.file!==file)pending={id:crypto.randomUUID(),body:text,recipient_id:target,file,uploaded:false};
  const attempt=pending,message={id:attempt.id,body:text,recipient_id:target};sending=true;heading();say(file?'Chargement du fichier… Gardez cette page ouverte.':'Envoi en cours…');
  try{
   if(file){
    const info=describeFile(file),path=profile.id+'/'+attempt.id+'/file.'+info.ext;
    if(!attempt.uploaded){
     try{await query(client.storage.from('chat-attachments').upload(path,new Blob([file],{type:info.type}),{contentType:info.type,upsert:false}),125000);}
     catch(error){
      if(String(error.statusCode)!=='409'&&!/already exists|duplicate/i.test(error.message||''))throw error;
      const objects=await query(client.storage.from('chat-attachments').list(profile.id+'/'+attempt.id,{limit:10,search:'file.'+info.ext}));
      if(!objects.some(o=>o.name==='file.'+info.ext&&Number(o.metadata?.size)===info.size&&o.metadata?.mimetype===info.type))throw Error('Le fichier existant ne correspond pas. Retirez la pièce jointe puis sélectionnez-la à nouveau.');
     }
     attempt.uploaded=true;
    }
    Object.assign(message,{attachment_path:path,attachment_name:info.name,attachment_type:info.type,attachment_size:info.size});
   }
   if(destroyed)return;
   let saved;
   try{saved=await query(client.from('chat_messages').insert(message).select(COLUMNS).single());}
   catch(error){if(error.code!=='23505')throw error;saved=await query(client.from('chat_messages').select(COLUMNS).eq('id',message.id).single());}
   if(destroyed)return;pending=null;drafts.delete(target);fileDrafts.delete(target);
   if(recipient===target){if(body.value===draft)body.value='';selectFile(null);merge([saved]);renderMessages({bottom:true});say('Message envoyé.');}
  }catch(error){if(!destroyed&&selected===version)say('Message non envoyé. Votre brouillon et votre fichier sont conservés. '+(error.message||'Réessayez.'),true);}
  finally{sending=false;if(!destroyed)heading();}
 };
 function selectFile(file){
  if(previewUrl){URL.revokeObjectURL(previewUrl);previewUrl=null;}
  selectedFile=file;body.required=!file;$('chat-file-preview').hidden=!file;$('chat-file-image').hidden=true;$('chat-file-image').removeAttribute('src');
  if(file){const info=describeFile(file);$('chat-file-name').textContent=info.name+' · '+fileSize(info.size);if(previewable(info.type)){previewUrl=URL.createObjectURL(file);$('chat-file-image').src=previewUrl;$('chat-file-image').hidden=false;}}
  $('chat-file').value='';
 }
 async function signed(path,download){
  const cached=signedFiles.get(path);if(cached&&cached.until>Date.now())return cached.promise;
  const promise=query(client.storage.from('chat-attachments').createSignedUrl(path,300,download?{download}:undefined)).then(data=>data.signedUrl);
  signedFiles.set(path,{until:Date.now()+240000,promise});try{return await promise;}catch(error){signedFiles.delete(path);throw error;}
 }
 function renderFile(article,message){
  const card=document.createElement('a');card.className='chat-file-card';card.textContent=message.attachment_name+' · '+fileSize(Number(message.attachment_size));card.target='_blank';card.rel='noopener noreferrer';card.setAttribute('aria-label','Ouvrir '+message.attachment_name);card.href='#';card.onclick=event=>{if(card.getAttribute('href')==='#'){event.preventDefault();say('Le fichier est en cours de chargement. Réessayez dans un instant.');}};
  if(previewable(message.attachment_type)){const image=document.createElement('img');image.loading='lazy';image.alt=message.attachment_name;image.className='chat-photo';card.prepend(image);signed(message.attachment_path).then(url=>{if(!destroyed){image.src=url;card.href=url;}}).catch(()=>{image.remove();card.textContent+=' · Cliquez sur Actualiser pour réessayer.';});}
  else signed(message.attachment_path,message.attachment_name).then(url=>{if(!destroyed)card.href=url;}).catch(()=>{card.textContent+=' · Fichier indisponible';});
  article.append(card);
 }
 function discardPending(){if(pending?.uploaded&&pending.file){const info=describeFile(pending.file);void client.storage.from('chat-attachments').remove([profile.id+'/'+pending.id+'/file.'+info.ext]).catch(()=>{});}pending=null;}
 $('chat-attach').onclick=()=>{if(!sending&&writable())$('chat-file').click();};
 $('chat-file').onchange=()=>{try{const file=$('chat-file').files[0];if(file){describeFile(file);discardPending();selectFile(file);say('Fichier prêt. Ajoutez un message si vous le souhaitez, puis Envoyer.');}}catch(error){$('chat-file').value='';say(error.message,true);}};
 $('chat-file-remove').onclick=()=>{if(sending)return;discardPending();selectFile(null);fileDrafts.delete(recipient);};
 list.onscroll=()=>{clearTimeout(readTimer);readTimer=setTimeout(markVisible,150);};
 document.addEventListener('visibilitychange',onVisible);
 return{show,hide,updateUnread(counts){unread=counts;renderPeople();markVisible();},destroy(){clearTimeout(readTimer);destroyed=true;hide();body.value='';selectFile(null);fileDrafts.clear();signedFiles.clear();messages=[];list.replaceChildren();$('chat-people').replaceChildren();drafts.clear();document.removeEventListener('visibilitychange',onVisible);}};
}
