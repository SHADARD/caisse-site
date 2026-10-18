import {backend,jsonResponse} from '../../server/business-archives.mjs';
export default async function(request,env=globalThis.process?.env||{}){
 if(request.method!=='POST')return jsonResponse(405,{error:'Méthode non autorisée.'});
 try{
  const client=backend(env);const {auth}=await client.verifySuper(request);
  const body=await request.json();
  if(!['site','user'].includes(body.kind)||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(body.id||''))return jsonResponse(400,{error:'Sélection invalide.'});
  // La transaction retire immédiatement tous les droits, même aux JWT existants.
  const removed=await client.rpc('remove_managed_entity',{p_kind:body.kind,p_id:body.id},auth);
  let authBlocked=true;
  for(const id of removed.disabled_users||[]){
   try{const r=await fetch(client.url+'/auth/v1/admin/users/'+encodeURIComponent(id),{method:'PUT',headers:{...client.headers(),'Content-Type':'application/json'},body:JSON.stringify({ban_duration:'876000h'})});if(!r.ok)authBlocked=false;}catch{authBlocked=false;}
  }
  return jsonResponse(200,{message:(body.kind==='site'?'Site supprimé. Les comptes associés sont désactivés.':'Utilisateur supprimé. Son accès est désactivé.')+' Les rapports et archives sont conservés.'+(!authBlocked?' Le blocage des droits est effectif ; le verrouillage Auth complémentaire devra être revérifié.':'')});
 }catch(error){return jsonResponse(error.status||400,{error:error.message||'Suppression impossible.'});}
}
