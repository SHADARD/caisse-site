import {makeSummary,createSummaryPdf} from './archive-pdf.mjs';
import {reportingCycle} from '../domain.mjs';
const BUCKET='business-archives';
export function jsonResponse(status,body){return new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});}
function fail(message,status=400){const error=new Error(message);error.status=status;throw error;}
export function backend(env){
 const url=env.SUPABASE_URL,key=env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!key)fail('La sauvegarde doit être configurée sur le serveur.',503);
 const parsed=new URL(url);if(parsed.protocol!=='https:'||parsed.pathname!=='/')fail('URL Supabase incorrecte.',503);
 const headers=auth=>({apikey:key,Authorization:auth||'Bearer '+key});
 async function rpc(name,data,auth){
  const response=await fetch(url+'/rest/v1/rpc/'+name,{method:'POST',headers:{...headers(auth),'Content-Type':'application/json'},body:JSON.stringify(data)});
  const body=await response.json();
  if(!response.ok){if(response.status===404||body.code==='PGRST202')fail('Installez la migration 002-archives-reset.sql dans Supabase avant d’utiliser les archives.',503);fail(body.message||'Opération de sauvegarde refusée.',response.status===401||response.status===403?403:409);}
  return body;
 }
 async function verifySuper(request){
  const auth=request.headers.get('authorization')||'';if(!auth.startsWith('Bearer '))fail('Connexion requise.',401);
  const userResponse=await fetch(url+'/auth/v1/user',{headers:headers(auth)});if(!userResponse.ok)fail('Session expirée. Reconnectez-vous.',401);
  const user=await userResponse.json();
  const response=await fetch(url+'/rest/v1/profiles?id=eq.'+encodeURIComponent(user.id)+'&select=role',{headers:headers(auth)});
  if(!response.ok)fail('Impossible de vérifier les droits.',403);
  const profiles=await response.json();if(profiles[0]?.role!=='super')fail('Seul le super utilisateur peut effectuer cette action.',403);
  return{auth,user};
 }
 async function upload(path,body,type){
  const response=await fetch(url+'/storage/v1/object/'+BUCKET+'/'+path,{method:'POST',headers:{...headers(),'Content-Type':type,'x-upsert':'false'},body});
  if(!response.ok)fail('La sauvegarde privée n’a pas pu être enregistrée. Aucune réinitialisation ne sera effectuée.',502);
 }
 return{url,key,headers,rpc,verifySuper,upload};
}
async function sha256(bytes){const digest=await crypto.subtle.digest('SHA-256',bytes);return [...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('');}
export async function saveArchive(client,kind,range,auth){
 const acquired=await client.rpc('acquire_archive_snapshot',{p_kind:kind,p_start:range?.start||null,p_end:range?.end||null},auth);
 if(acquired.existing)return{archive:acquired.archive,already_saved:true};
 const token=acquired.token;
 if(!/^[a-f0-9-]{36}$/.test(token||''))fail('Réponse de sauvegarde invalide.',502);
 try{
  const snapshot=acquired.snapshot,summary=makeSummary(snapshot),pdf=createSummaryPdf(snapshot,summary);
  const json=new TextEncoder().encode(JSON.stringify({...snapshot,summary},null,2));
  const [pdfHash,jsonHash]=await Promise.all([sha256(pdf),sha256(json)]);
  await client.upload(token+'/backup.json',json,'application/json');
  await client.upload(token+'/summary.pdf',pdf,'application/pdf');
  return await client.rpc('finish_business_archive',{p_token:token,p_pdf_sha256:pdfHash,p_backup_sha256:jsonHash,p_report_count:summary.report_count,p_summary:summary},auth);
 }catch(error){
  // Une réponse perdue après validation ne doit jamais relancer la suppression.
  try{const result=await fetch(client.url+'/rest/v1/business_archives?id=eq.'+token+'&select=*',{headers:client.headers(auth)});if(result.ok){const rows=await result.json();if(rows[0])return{archive:rows[0],already_saved:true};}}catch{}
  try{await client.rpc('cancel_business_archive',{p_token:token},auth);}catch{}
  throw error;
 }
}
export async function resetAll(request,env){
 if(request.method!=='POST')return jsonResponse(405,{error:'Méthode non autorisée.'});
 try{
  const client=backend(env),{auth,user}=await client.verifySuper(request);
  const body=await request.json();if(body.confirmation!=='TOUT REINITIALISER'||typeof body.password!=='string'||body.password.length>128||!body.password)fail('Confirmez la phrase demandée et votre mot de passe.');
  const verified=await fetch(client.url+'/auth/v1/token?grant_type=password',{method:'POST',headers:{...client.headers(),'Content-Type':'application/json'},body:JSON.stringify({email:user.email,password:body.password})});
  if(!verified.ok)fail('Mot de passe incorrect. Aucune donnée n’a été modifiée.',403);
  const identity=await verified.json();if(identity.user?.id!==user.id)fail('Vérification du compte refusée.',403);
  const result=await saveArchive(client,'reset',null,auth);
  return jsonResponse(200,{...result,message:'Sauvegarde conservée. Les rapports courants, les cumuls de caisse et le rapport mensuel ont été remis à zéro. Les sites, comptes et archives sont conservés.'});
 }catch(error){return jsonResponse(error.status||500,{error:error.status?error.message:'La sauvegarde n’a pas abouti. Vérifiez l’historique avant de réessayer ; aucune suppression ne peut précéder l’enregistrement de la sauvegarde.'});}
}
function secretEqual(a,b){if(typeof a!=='string'||typeof b!=='string'||a.length<32||b.length!==a.length)return false;let mismatch=0;for(let i=0;i<a.length;i++)mismatch|=a.charCodeAt(i)^b.charCodeAt(i);return mismatch===0;}
export async function monthlyArchive(request,env){
 if(request.method!=='POST')return jsonResponse(405,{error:'Méthode non autorisée.'});
 try{
  const client=backend(env);let auth,body={};
  const provided=(request.headers.get('authorization')||'').replace(/^Bearer /,'');
  if(!secretEqual(env.ARCHIVE_CRON_SECRET,provided)){
   const checked=await client.verifySuper(request);auth=checked.auth;body=await request.json();
  }
  const today=new Date().toLocaleDateString('en-CA',{timeZone:'Africa/Kinshasa'});
  const current=reportingCycle(today);
  const previousDay=new Date(current.start+'T12:00:00Z');previousDay.setUTCDate(previousDay.getUTCDate()-1);
  const cycle=body.start?reportingCycle(body.start):reportingCycle(previousDay.toISOString().slice(0,10));
  if(cycle.end>=today)fail('Cette période mensuelle n’est pas encore terminée.');
  const result=await saveArchive(client,'monthly',cycle,auth);
  return jsonResponse(200,{...result,message:'Le PDF de synthèse et la sauvegarde ont été conservés dans l’historique.'});
 }catch(error){return jsonResponse(error.status||500,{error:error.status?error.message:'Impossible de générer la sauvegarde mensuelle. Réessayez après vérification de la configuration.'});}
}
