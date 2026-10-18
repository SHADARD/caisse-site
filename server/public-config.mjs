export function isPublicKey(key){
 if(typeof key!=='string')return false;
 if(key.startsWith('sb_publishable_')&&key.length>20)return true;
 try{const encoded=key.split('.')[1];if(!encoded)return false;const payload=JSON.parse(atob(encoded.replace(/-/g,'+').replace(/_/g,'/')));return payload.role==='anon';}catch{return false;}
}
export default function publicConfig(request,env={}){
 const reply=(status,body)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
 if(request.method!=='GET')return reply(405,{error:'Méthode non autorisée.'});
 const url=env.SUPABASE_URL;
 const key=env.SUPABASE_ANON_KEY||env.SUPABASE_PUBLISHABLE_KEY||env.SUPABASE_PUBLIC_KEY;
 if(!url)return reply(503,{error:'Configuration incomplète : ajoutez SUPABASE_URL dans les variables de production Cloudflare.'});
 try{const u=new URL(url);if(u.protocol!=='https:'||u.username||u.password||u.pathname!=='/'||u.search||u.hash)throw Error();}catch{return reply(503,{error:'La variable SUPABASE_URL doit contenir l’URL HTTPS du projet Supabase.'});}
 if(!key)return reply(503,{error:'Configuration incomplète : ajoutez SUPABASE_ANON_KEY (clé publique anon ou publishable) dans les variables de production Cloudflare, puis redéployez.'});
 if(!isPublicKey(key))return reply(503,{error:'La clé de connexion doit être publique (anon ou publishable). La clé secrète est réservée au serveur.'});
 return reply(200,{supabaseUrl:url,supabaseKey:key});
}
