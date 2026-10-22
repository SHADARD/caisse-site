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
 await role('site');
 await db.query("insert into public.chat_messages(body) values('Général de A')");
 await db.query("insert into public.chat_messages(recipient_id,body) values($1,'Privé de A vers B')",[other]);
 await assert.rejects(()=>db.query("insert into public.chat_messages(sender_id,body) values($1,'Usurpation')",[uid.super]),/permission denied/);
 await assert.rejects(()=>db.query("insert into public.chat_messages(body) values('   ')"),/check constraint/);
 await assert.rejects(()=>db.query('insert into public.chat_messages(body) values($1)',['x'.repeat(4001)]),/check constraint/);
 assert.equal((await db.query('select * from public.chat_messages')).rows.length,2);
 await role('admin');assert.equal((await db.query('select * from public.chat_messages')).rows.length,1);
 assert.equal((await db.query('select * from public.chat_people')).rows.length,4);
 await assert.rejects(()=>db.query("update public.chat_messages set body='Changé'"),/permission denied/);
 await assert.rejects(()=>db.query('delete from public.chat_messages where true'),/permission denied/);
 await role('super');assert.equal((await db.query('select * from public.chat_messages')).rows.length,1);
 await role('owner');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[other]);await db.exec('set role authenticated');
 assert.equal((await db.query('select * from public.chat_messages')).rows.length,2);
 await db.query("insert into public.chat_messages(recipient_id,body) values($1,'Réponse de B')",[uid.site]);
 await role('site');assert.equal((await db.query('select * from public.chat_messages')).rows.length,3);
 await role('owner');await db.query('update public.profiles set deleted_at=now(),display_name=$1 where id=$2',['Ancien collègue',other]);
 assert.equal((await db.query('select is_active from public.chat_people where id=$1',[other])).rows[0].is_active,false);
 await role('site');await assert.rejects(()=>db.query("insert into public.chat_messages(recipient_id,body) values($1,'Envoi refusé')",[other]),/row-level security/);
 assert.equal((await db.query('select * from public.chat_messages')).rows.length,3);
 await role('owner');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[other]);await db.exec('set role authenticated');
 assert.equal((await db.query('select * from public.chat_messages')).rows.length,0);
 assert.equal((await db.query('select * from public.chat_people')).rows.length,0);
 await assert.rejects(()=>db.query("insert into public.chat_messages(body) values('Refusé')"),/row-level security/);
 await role('owner');await db.exec('set role anon');await assert.rejects(()=>db.query('select * from public.chat_messages'),/permission denied/);
 console.log('OK : groupe général, confidentialité des MP, expéditeur imposé, comptes supprimés, interdiction anonyme et historique conservé.');
}finally{await db.close();}
