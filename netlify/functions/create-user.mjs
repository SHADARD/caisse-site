const response=(status,body)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
export default async function(request,env=globalThis.process?.env||{}){
 if(request.method!=='POST')return response(405,{error:'Méthode non autorisée.'});
 const url=env.SUPABASE_URL,key=env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!key)return response(503,{error:'La création des comptes doit être configurée sur le serveur.'});
 const bearer=request.headers.get('authorization')||'';
 if(!bearer.startsWith('Bearer '))return response(401,{error:'Connexion requise.'});
 const headers={apikey:key,Authorization:bearer};
 try{
  const identity=await fetch(url+'/auth/v1/user',{headers});
  if(!identity.ok)return response(401,{error:'Session expirée. Reconnectez-vous.'});
  const user=await identity.json();
  const who=await fetch(url+'/rest/v1/profiles?id=eq.'+encodeURIComponent(user.id)+'&select=role',{headers});
  if(!who.ok)return response(403,{error:'Accès refusé.'});
  const own=await who.json();if(own[0]?.role!=='super')return response(403,{error:'Seul le super utilisateur peut créer des comptes.'});
  const body=await request.json();
  const {username,display_name,password,role,site_id}=body;
  if(typeof username!=='string'||!/^[a-z0-9][a-z0-9._-]{2,39}$/.test(username)||typeof display_name!=='string'||!display_name.trim()||display_name.length>100||typeof password!=='string'||password.length<12||password.length>128||!['site','admin'].includes(role)||(role==='site'&& !/^[a-f0-9-]{36}$/.test(site_id||'')))return response(400,{error:'Vérifiez les champs : identifiant de 3 à 40 caractères, nom et mot de passe de 12 caractères minimum.'});
  const serviceHeaders={apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json'};
  const created=await fetch(url+'/auth/v1/admin/users',{method:'POST',headers:serviceHeaders,body:JSON.stringify({email:username+'@users.caisse.invalid',password,email_confirm:true})});
  if(!created.ok){return response(400,{error:created.status===422?'Cet identifiant est déjà utilisé ou les informations sont invalides.':'Impossible de créer le compte.'});}
  const account=await created.json();
  let saved=false;
  try{
   const savedProfile=await fetch(url+'/rest/v1/profiles',{method:'POST',headers:serviceHeaders,body:JSON.stringify({id:account.id,username,display_name:display_name.trim(),role,site_id:role==='site'?site_id:null})});
   if(!savedProfile.ok){const err=await savedProfile.json();throw new Error(err.message?.includes('Deux comptes')?'Deux comptes administrateurs maximum.':'Impossible de créer le profil. Vérifiez le site et l’identifiant.');}
   saved=true;return response(201,{message:'Compte créé. Transmettez ses identifiants à l’utilisateur séparément.'});
  }catch(error){if(!saved){const removed=await fetch(url+'/auth/v1/admin/users/'+encodeURIComponent(account.id),{method:'DELETE',headers:serviceHeaders});if(!removed.ok)return response(500,{error:'Création incomplète. Faites vérifier les utilisateurs dans Supabase avant de réessayer.'});}return response(400,{error:error.message});}
 }catch{return response(500,{error:'Impossible de joindre le service de comptes. Réessayez ultérieurement.'});}
}
