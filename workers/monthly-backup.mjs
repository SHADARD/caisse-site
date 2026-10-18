// Horaire UTC : le 9 à 23 h 05 = le 10 à 00 h 05 à Kinshasa.
export default {
 async scheduled(event,env,context){
  if(!env.ARCHIVE_ENDPOINT||!env.ARCHIVE_CRON_SECRET||env.ARCHIVE_CRON_SECRET.length<32)throw Error('Configurer ARCHIVE_ENDPOINT et ARCHIVE_CRON_SECRET.');
  const endpoint=new URL(env.ARCHIVE_ENDPOINT);
  if(endpoint.protocol!=='https:'||endpoint.pathname!=='/api/archive-monthly')throw Error('Endpoint d’archivage invalide.');
  context.waitUntil((async()=>{
   for(let attempt=0;attempt<3;attempt++){
    try{
     const response=await fetch(endpoint,{method:'POST',headers:{Authorization:'Bearer '+env.ARCHIVE_CRON_SECRET,'Content-Type':'application/json'},body:'{}'});
     if(response.ok){console.log('Sauvegarde mensuelle terminée.');return;}
     if(attempt===2)throw Error('Sauvegarde mensuelle refusée : HTTP '+response.status);
    }catch(error){if(attempt===2)throw error;}
    await new Promise(resolve=>setTimeout(resolve,5000*(attempt+1)));
   }
  })());
 },
 async fetch(){return new Response('Tâche de sauvegarde mensuelle. Aucun déclenchement public.',{status:403});}
};
