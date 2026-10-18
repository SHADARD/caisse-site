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
 const site=(await db.query("insert into public.sites(name) values('Site A') returning id")).rows[0].id;
 for(const [kind,id] of Object.entries(uid)){
  await db.query('insert into auth.users(id) values($1)',[id]);
  await db.query('insert into public.profiles(id,username,display_name,role,site_id) values($1,$2,$2,$3,$4)',[id,kind==='super'?'S':kind==='admin'?'Équipe Centre':'X',kind,kind==='site'?site:null]);
 }
 await assert.rejects(()=>db.query("update public.profiles set username='x' where id=$1",[uid.admin]),/unique/);
 await db.query('update public.profiles set username=$1 where id=$2',['a'.repeat(1000),uid.admin]);
 await role('site');await db.query('select public.add_report($1,current_date,1,2,3,4,5)',[site]);
 await assert.rejects(()=>db.query("select public.remove_managed_entity('user',$1)",[uid.admin]),/super utilisateur/);
 await role('admin');await assert.rejects(()=>db.query("select public.remove_managed_entity('site',$1)",[site]),/super utilisateur/);
 await role('super');await assert.rejects(()=>db.query("select public.remove_managed_entity('user',$1)",[uid.super]),/ne peut pas/);
 await db.query("select public.remove_managed_entity('user',$1)",[uid.admin]);
 await role('admin');assert.equal((await db.query('select public.my_role() as role')).rows[0].role,null);assert.equal((await db.query('select * from public.reports')).rows.length,0);assert.equal((await db.query('select * from public.profiles')).rows.length,0);
 await role('super');await db.query("select public.remove_managed_entity('site',$1)",[site]);
 assert.equal((await db.query('select * from public.reports')).rows.length,1);
 assert.equal((await db.query('select * from public.periods where closed_at is null')).rows.length,0);
 await assert.rejects(()=>db.query('select public.close_period($1,$2)',[site,'00000000-0000-4000-8000-000000000099']),/supprimé/);
 await assert.rejects(()=>db.query('select public.add_report($1,current_date-1,1,2,3,4,5)',[site]),/supprimé/);
 await role('site');assert.equal((await db.query('select * from public.reports')).rows.length,0);
 await assert.rejects(()=>db.query('select public.add_report($1,current_date-1,1,2,3,4,5)',[site]),/autorisée/);
 await role('owner');assert.equal(await count('reports'),1);assert.equal(await count('profiles'),3);assert.equal(await count('sites'),1);
 console.log('Identifiants libres, unicité, droits et suppressions avec conservation : OK');
} finally {await db.close();}
