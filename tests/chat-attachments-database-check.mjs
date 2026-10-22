// Vérification PostgreSQL réelle via PGlite, dépendance de test uniquement.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const db=new PGlite();
const uid={super:'00000000-0000-4000-8000-000000000001',admin:'00000000-0000-4000-8000-000000000002',site:'00000000-0000-4000-8000-000000000003'};
async function role(kind){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.role',$2,false)",[uid[kind]||'',kind==='service'?'service_role':'authenticated']);if(kind!=='owner')await db.exec('set role '+(kind==='service'?'service_role':'authenticated'));}
async function count(table){return Number((await db.query('select count(*) as n from public.'+table)).rows[0].n);}
async function acquire(kind,start=null,end=null){return(await db.query('select public.acquire_archive_snapshot($1,$2,$3) as result',[kind,start,end])).rows[0].result;}
async function finish(token){return(await db.query('select public.finish_business_archive($1,$2,$3,$4,$5) as result',[token,'a'.repeat(64),'b'.repeat(64),2,{}])).rows[0].result;}
async function files(token){await role('owner');await db.query("insert into storage.objects(bucket_id,name) values('business-archives',$1),('business-archives',$2)",[token+'/summary.pdf',token+'/backup.json']);}
try{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create schema auth;create schema storage;
 create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create function auth.role() returns text language sql stable as $$select current_setting('request.jwt.claim.role',true)$$;
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid default gen_random_uuid(),bucket_id text references storage.buckets(id),name text,metadata jsonb default '{}');
 alter table storage.objects enable row level security;
 grant usage on schema public,auth,storage to authenticated,anon,service_role;
 grant select on storage.objects to authenticated;grant all on storage.objects,storage.buckets to service_role;`);
 await db.exec(await readFile(new URL('../schema.sql',import.meta.url),'utf8'));
 await db.exec(await readFile(new URL('../migrations/002-archives-reset.sql',import.meta.url),'utf8'));
 // La migration doit être réexécutable sans supprimer les données.
 await db.exec(await readFile(new URL('../migrations/002-archives-reset.sql',import.meta.url),'utf8'));

 const {readdir}=await import('node:fs/promises');
 const migration=(await readdir(new URL('../supabase/migrations/',import.meta.url))).find(n=>n.endsWith('_flexible_accounts_and_removal.sql'));
 await db.exec(await readFile(new URL('../supabase/migrations/'+migration,import.meta.url),'utf8'));

 const chatMigration=(await readdir(new URL('../supabase/migrations/',import.meta.url))).find(n=>n.endsWith('_general_and_private_chat.sql'));
 await db.exec(await readFile(new URL('../supabase/migrations/'+chatMigration,import.meta.url),'utf8'));
 const site=(await db.query("insert into public.sites(name) values('A') returning id")).rows[0].id;
 const otherSite=(await db.query("insert into public.sites(name) values('B') returning id")).rows[0].id;
 const other='00000000-0000-4000-8000-000000000004';
 for(const [kind,id] of [...Object.entries(uid),['other',other]]){
  await db.query('insert into auth.users(id) values($1)',[id]);
  await db.query('insert into public.profiles(id,username,display_name,role,site_id) values($1,$2,$2,$3,$4)',[id,kind,kind==='other'?'site':kind,['site','other'].includes(kind)?(kind==='other'?otherSite:site):null]);
 }

 const attachmentMigration=(await readdir(new URL('../supabase/migrations/',import.meta.url))).find(n=>n.endsWith('_chat_attachments.sql'));
 await db.exec(await readFile(new URL('../supabase/migrations/'+attachmentMigration,import.meta.url),'utf8'));
 await db.exec('grant insert,update,delete on storage.objects to authenticated');
 const message='10000000-0000-4000-8000-000000000001',general='10000000-0000-4000-8000-000000000002';
 const path=uid.site+'/'+message+'/file.pdf';
 const send=()=>db.query("insert into public.chat_messages(id,recipient_id,body,attachment_path,attachment_name,attachment_type,attachment_size) values($1,$2,'',$3,'Facture.pdf','application/pdf',10)",[message,other,path]);
 await role('site');await assert.rejects(send,/chargé avant/);
 await assert.rejects(()=>db.query("insert into storage.objects(bucket_id,name,metadata) values('chat-attachments',$1,$2)",[other+'/'+message+'/file.pdf',{size:10,mimetype:'application/pdf'}]),/row-level security/);
 await db.query("insert into storage.objects(bucket_id,name,metadata) values('chat-attachments',$1,$2)",[path,{size:10,mimetype:'application/pdf'}]);
 await assert.rejects(()=>db.query("insert into public.chat_messages(id,recipient_id,body,attachment_path,attachment_name,attachment_type,attachment_size) values($1,$2,'',$3,'Facture.pdf','application/pdf',11)",[message,other,path]),/correspondent/);
 await send();assert.equal((await db.query("select * from storage.objects where bucket_id='chat-attachments'")).rows.length,1);
 await role('admin');assert.equal((await db.query("select * from storage.objects where bucket_id='chat-attachments'")).rows.length,0);
 await role('super');assert.equal((await db.query("select * from storage.objects where bucket_id='chat-attachments'")).rows.length,0);
 await role('owner');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[other]);await db.exec('set role authenticated');assert.equal((await db.query("select * from storage.objects where bucket_id='chat-attachments'")).rows.length,1);
 await role('site');assert.equal((await db.query('delete from storage.objects where name=$1 returning id',[path])).rows.length,0);
 assert.equal((await db.query('update storage.objects set metadata=$1 where name=$2 returning id',[{},path])).rows.length,0);
 const groupPath=uid.site+'/'+general+'/file.png';await db.query("insert into storage.objects(bucket_id,name,metadata) values('chat-attachments',$1,$2)",[groupPath,{size:12,mimetype:'image/png'}]);
 await db.query("insert into public.chat_messages(id,body,attachment_path,attachment_name,attachment_type,attachment_size) values($1,'Photo',$2,'Photo.png','image/png',12)",[general,groupPath]);
 await role('admin');assert.equal((await db.query("select * from storage.objects where bucket_id='chat-attachments'")).rows.length,1);
 await role('site');const orphan=uid.site+'/10000000-0000-4000-8000-000000000003/file.pdf';await db.query("insert into storage.objects(bucket_id,name,metadata) values('chat-attachments',$1,$2)",[orphan,{size:2,mimetype:'application/pdf'}]);assert.equal((await db.query('delete from storage.objects where name=$1 returning id',[orphan])).rows.length,1);
 await role('owner');await db.exec('set role anon');await assert.rejects(()=>db.query("select * from storage.objects where bucket_id='chat-attachments'"),/permission denied/);
 console.log('OK : pièces jointes privées/générales, fichier obligatoire, métadonnées vérifiées, pas d’usurpation, pas de remplacement/suppression après envoi, nettoyage des brouillons.');
}finally{await db.close();}
