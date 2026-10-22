// Session propre à Flamingo : aucune suppression des données des autres applications.
export function sessionKeys(url){
 const ref=new URL(url).hostname.split('.')[0];
 return {current:'flamingo-'+ref+'-auth-v2',legacy:'sb-'+ref+'-auth-token'};
}
export function clearProjectSession(url){
 const keys=sessionKeys(url);
 for(const storage of [localStorage,sessionStorage])for(const key of Object.values(keys))for(const suffix of ['','-code-verifier','-user'])storage.removeItem(key+suffix);
}
export async function networkFetch(input,options={},timeout=15000){
 const controller=new AbortController();const parent=options.signal;const abort=()=>controller.abort();
 if(parent?.aborted)abort();else parent?.addEventListener('abort',abort,{once:true});
 const uploading=options.method?.toUpperCase()==='POST'&&String(input).includes('/storage/v1/object/chat-attachments/');
 const timer=setTimeout(abort,uploading?120000:timeout);
 try{return await fetch(input,{...options,signal:controller.signal});}
 finally{clearTimeout(timer);parent?.removeEventListener('abort',abort);}
}
export async function boundedAuthLock(name,_timeout,fn){
 if(!navigator.locks?.request)return await fn();
 const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),6000);
 try{return await navigator.locks.request(name,{mode:'exclusive',signal:controller.signal},async()=>{clearTimeout(timer);return await fn();});}
 catch(error){if(error.name==='AbortError')throw Error('Une autre fenêtre retient la session. Fermez les autres onglets Flamingo puis réessayez.');throw error;}
 finally{clearTimeout(timer);}
}
export async function logoutCurrentDevice(client,cfg){
 const keys=sessionKeys(cfg.supabaseUrl);let token;
 for(const key of [keys.current,keys.legacy]){
  try{token=JSON.parse(localStorage.getItem(key)||'null')?.access_token;if(token)break;}catch{}
 }
 try{Promise.resolve(client?.auth.stopAutoRefresh()).catch(()=>{});}catch{}
 clearProjectSession(cfg.supabaseUrl);
 try{
  // Révoquer la session courante sans dépendre des verrous du SDK.
  if(token)await networkFetch(cfg.supabaseUrl+'/auth/v1/logout?scope=local',{method:'POST',headers:{apikey:cfg.supabaseKey,Authorization:'Bearer '+token},keepalive:true},3000);
 }catch{ /* Sans réseau, la session locale reste effacée. */ }
 finally{clearProjectSession(cfg.supabaseUrl);}
}
