import {backend,monthlyArchive,jsonResponse} from './server/business-archives.mjs';

Deno.serve(async(request: Request)=>{
 if(request.method!=='POST')return jsonResponse(405,{error:'Méthode non autorisée.'});
 const authorization=request.headers.get('authorization')||'';
 if(!/^Bearer [a-f0-9]{64}$/.test(authorization))return jsonResponse(401,{error:'Accès non autorisé.'});
 const env={SUPABASE_URL:Deno.env.get('SUPABASE_URL'),SUPABASE_SERVICE_ROLE_KEY:Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),ARCHIVE_CRON_SECRET:''};
 try{
  // Seul le service serveur peut lire ce secret chiffré dans Vault.
  const client=backend(env);
  const secret=await client.rpc('flamingo_archive_schedule_secret',{});
  if(typeof secret!=='string'||secret.length!==64)return jsonResponse(503,{error:'Planificateur non configuré.'});
  const supplied=authorization.slice(7);let mismatch=0;
  for(let i=0;i<secret.length;i++)mismatch|=secret.charCodeAt(i)^supplied.charCodeAt(i);
  if(mismatch)return jsonResponse(401,{error:'Accès non autorisé.'});
  env.ARCHIVE_CRON_SECRET=secret;
  // La période est calculée par le serveur ; aucun contenu externe n’est accepté.
  return await monthlyArchive(new Request(request.url,{method:'POST',headers:{Authorization:authorization,'Content-Type':'application/json'},body:'{}'}),env);
 }catch{return jsonResponse(500,{error:'La sauvegarde mensuelle a échoué. Vérifiez les journaux et la configuration.'});}
});
