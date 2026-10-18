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
 const site=(await db.query("insert into public.sites(name) values('Site A') returning id")).rows[0].id;
 for(const [kind,id] of Object.entries(uid)){
  await db.query('insert into auth.users(id) values($1)',[id]);
  await db.query('insert into public.profiles(id,username,display_name,role,site_id) values($1,$2,$2,$3,$4)',[id,kind==='super'?'responsable':kind==='admin'?'administrateur':'operateur',kind,kind==='site'?site:null]);
 }
 await role('site');
 await db.query('select public.add_report($1,current_date,100,1000,10,200,1.125)',[site]);
 await assert.rejects(()=>acquire('reset'),/super utilisateur/);
 await role('admin');await assert.rejects(()=>acquire('reset'),/super utilisateur/);
 await assert.rejects(()=>acquire('monthly','2025-01-10','2025-02-09'),/super utilisateur/);
 await role('super');
 const snapshot=await acquire('reset');assert.equal(snapshot.snapshot.reports.length,1);
 await assert.rejects(()=>db.query('select public.add_report($1,current_date-1,100,1000,10,200,1.125)',[site]),/sauvegarde est en cours/);
 await assert.rejects(()=>finish(snapshot.token),/PDF et JSON/);
 await role('owner');assert.equal(await count('reports'),1);
 await files(snapshot.token);await role('super');
 const done=await finish(snapshot.token);assert.equal(done.deleted_reports,1);
 await role('owner');assert.equal(await count('reports'),0);assert.equal(await count('archived_reports'),1);assert.equal(await count('profiles'),3);assert.equal(await count('sites'),1);assert.equal(await count('periods'),1);assert.equal(await count('business_archives'),1);
 await role('super');const again=await finish(snapshot.token);assert.equal(again.already_saved,true);
 await role('admin');assert.equal((await db.query('select * from public.business_archives')).rows.length,1);
 const adminFiles=(await db.query('select name from storage.objects')).rows.map(r=>r.name);assert.deepEqual(adminFiles,[snapshot.token+'/summary.pdf']);
 await role('site');assert.equal((await db.query('select * from public.business_archives')).rows.length,0);assert.equal((await db.query('select * from public.archived_reports')).rows.length,0);assert.equal((await db.query('select * from storage.objects')).rows.length,0);
 await role('super');const monthly=await acquire('monthly','2025-01-10','2025-02-09');await files(monthly.token);await role('super');await finish(monthly.token);
 const existing=await acquire('monthly','2025-01-10','2025-02-09');assert.equal(existing.existing,true);
 await role('site');await db.query('select public.add_report($1,current_date,50,50,5,5,0.5)',[site]);
 await role('super');const expiring=await acquire('reset');await role('owner');await db.exec("update public.archive_maintenance set expires_at=now()-interval '1 second'");
 await role('site');await db.query('select public.add_report($1,current_date-1,20,20,2,2,0.2)',[site]);
 await role('super');await assert.rejects(()=>finish(expiring.token),/expiré/);
 await db.query('select public.cancel_business_archive($1)',[expiring.token]);await role('owner');assert.equal(await count('reports'),2);
 console.log('PostgreSQL : droits, RLS, sauvegarde obligatoire, reset atomique, conservation, expiration et idempotence vérifiés.');
}catch(error){console.error(error.message);if(error.where)console.error(error.where);process.exitCode=1;}finally{await db.close();}
