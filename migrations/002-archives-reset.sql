-- À exécuter une fois dans SQL Editor. Ne réinitialise aucune donnée à l’installation.
begin;
create table if not exists public.business_archives (
 id uuid primary key,
 kind text not null check(kind in ('monthly','reset')),
 period_start date not null,
 period_end date not null check(period_end>=period_start),
 created_at timestamptz not null default now(),
 created_by uuid references public.profiles(id),
 pdf_path text not null unique,
 backup_path text not null unique,
 pdf_sha256 text not null,
 backup_sha256 text not null,
 report_count integer not null check(report_count>=0),
 summary jsonb not null,
 reset_completed boolean not null default false
);
create unique index if not exists one_monthly_archive on public.business_archives(period_start) where kind='monthly';
create table if not exists public.archived_reports (
 id uuid primary key,
 site_id uuid not null,
 report_date date not null,
 data jsonb not null,
 archive_id uuid not null references public.business_archives(id),
 archived_at timestamptz not null default now()
);
create index if not exists archived_reports_date on public.archived_reports(report_date,site_id);
create table if not exists public.archive_maintenance (
 id integer primary key check(id=1),
 token uuid,
 kind text,
 period_start date,
 period_end date,
 created_by uuid,
 expires_at timestamptz
);
insert into public.archive_maintenance(id) values(1) on conflict do nothing;
alter table public.business_archives enable row level security;
alter table public.archived_reports enable row level security;
alter table public.archive_maintenance enable row level security;
revoke all on public.business_archives,public.archived_reports,public.archive_maintenance from anon,authenticated;
grant select on public.business_archives,public.archived_reports to authenticated;
grant all on public.business_archives,public.archived_reports,public.archive_maintenance to service_role;
drop policy if exists archives_read on public.business_archives;
create policy archives_read on public.business_archives for select to authenticated using(public.my_role() in ('admin','super'));
drop policy if exists archived_reports_read on public.archived_reports;
create policy archived_reports_read on public.archived_reports for select to authenticated using(public.my_role() in ('admin','super'));

-- Garde de maintenance : empêche une saisie ou modification entre la copie et le reset.
create or replace function public.guard_archive_writes() returns trigger
language plpgsql security definer set search_path=public as $$
declare lockrow public.archive_maintenance;
begin
 select * into lockrow from public.archive_maintenance where id=1;
 if lockrow.token is not null and lockrow.expires_at>clock_timestamp()
   and coalesce(current_setting('app.archive_token',true),'')<>lockrow.token::text then
  raise exception 'Une sauvegarde est en cours. Réessayez dans quelques instants.' using errcode='55000';
 end if;
 if TG_OP='DELETE' then return old; end if;
 return new;
end $$;
drop trigger if exists archive_guard on public.sites;
create trigger archive_guard before insert or update or delete on public.sites for each row execute function public.guard_archive_writes();
drop trigger if exists archive_guard on public.profiles;
create trigger archive_guard before insert or update or delete on public.profiles for each row execute function public.guard_archive_writes();
drop trigger if exists archive_guard on public.periods;
create trigger archive_guard before insert or update or delete on public.periods for each row execute function public.guard_archive_writes();
drop trigger if exists archive_guard on public.reports;
create trigger archive_guard before insert or update or delete on public.reports for each row execute function public.guard_archive_writes();

create or replace function public.acquire_archive_snapshot(p_kind text,p_start date default null,p_end date default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare lockrow public.archive_maintenance; existing public.business_archives; v_token uuid; snapshot jsonb; first_day date; last_day date;
begin
 if coalesce(public.my_role(),'')<>'super' and coalesce(auth.role(),'')<>'service_role' then
  raise exception 'Accès réservé au super utilisateur.' using errcode='42501';
 end if;
 if p_kind not in ('monthly','reset') or p_kind is null then raise exception 'Type de sauvegarde invalide.'; end if;
 if p_kind='reset' and coalesce(public.my_role(),'')<>'super' then
  raise exception 'Seul le super utilisateur peut réinitialiser.' using errcode='42501';
 end if;
 -- Ordre de verrous identique à la finalisation. Les transactions de saisie terminent avant la copie.
 lock table public.sites,public.profiles,public.periods,public.reports in share row exclusive mode;
 select * into lockrow from public.archive_maintenance where id=1 for update;
 if lockrow.token is not null and lockrow.expires_at>clock_timestamp() then
  raise exception 'Une sauvegarde est déjà en cours.' using errcode='55000';
 end if;
 if p_kind='monthly' then
  if p_start is null or p_end is null or extract(day from p_start)<>10
    or p_end<>(p_start+interval '1 month'-interval '1 day')::date
    or p_end>=(now() at time zone 'Africa/Kinshasa')::date then
   raise exception 'Seule une période du 10 au 9 entièrement terminée peut être archivée.';
  end if;
  select * into existing from public.business_archives where kind='monthly' and period_start=p_start;
  if found then return jsonb_build_object('existing',true,'archive',to_jsonb(existing)); end if;
  first_day=p_start;last_day=p_end;
 else
  if not exists(select 1 from public.reports) then raise exception 'Aucun rapport courant à réinitialiser.'; end if;
  select min(report_date) into first_day from public.reports;
  last_day=(now() at time zone 'Africa/Kinshasa')::date;
 end if;
 v_token=gen_random_uuid();
 update public.archive_maintenance set token=v_token,kind=p_kind,
  period_start=first_day,period_end=last_day,created_by=auth.uid(),expires_at=clock_timestamp()+interval '15 minutes' where id=1;
 select jsonb_build_object(
  'schema_version',1,'created_at',now(),'kind',p_kind,'period_start',first_day,'period_end',last_day,
  'sites',coalesce((select jsonb_agg(to_jsonb(s) order by s.id) from public.sites s),'[]'::jsonb),
  'profiles',coalesce((select jsonb_agg(to_jsonb(u) order by u.id) from public.profiles u),'[]'::jsonb),
  'periods',coalesce((select jsonb_agg(to_jsonb(p) order by p.id) from public.periods p),'[]'::jsonb),
  'reports',coalesce((select jsonb_agg(to_jsonb(r) order by r.id) from public.reports r),'[]'::jsonb),
  'archived_reports',coalesce((select jsonb_agg(to_jsonb(r) order by r.id) from public.archived_reports r),'[]'::jsonb),
  'archives',coalesce((select jsonb_agg(to_jsonb(a) order by a.created_at) from public.business_archives a),'[]'::jsonb)
 ) into snapshot;
 return jsonb_build_object('token',v_token,'snapshot',snapshot);
end $$;

create or replace function public.finish_business_archive(p_token uuid,p_pdf_sha256 text,p_backup_sha256 text,p_report_count integer,p_summary jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare lockrow public.archive_maintenance; saved public.business_archives; removed integer=0;
begin
 if coalesce(public.my_role(),'')<>'super' and coalesce(auth.role(),'')<>'service_role' then
  raise exception 'Accès refusé.' using errcode='42501';
 end if;
 lock table public.sites,public.profiles,public.periods,public.reports in share row exclusive mode;
 select * into lockrow from public.archive_maintenance where id=1 for update;
 select * into saved from public.business_archives where id=p_token;
 if found then return jsonb_build_object('archive',to_jsonb(saved),'already_saved',true); end if;
 if lockrow.token is distinct from p_token or lockrow.expires_at<=clock_timestamp() then
  raise exception 'La sauvegarde a expiré. Aucune donnée ne sera effacée.';
 end if;
 if lockrow.kind='reset' and (coalesce(public.my_role(),'')<>'super' or auth.uid() is distinct from lockrow.created_by) then
  raise exception 'Seul le super utilisateur ayant démarré peut terminer.' using errcode='42501';
 end if;
 if p_pdf_sha256 !~ '^[a-f0-9]{64}$' or p_backup_sha256 !~ '^[a-f0-9]{64}$'
  or p_pdf_sha256 is null or p_backup_sha256 is null or p_report_count is null or p_report_count<0 or p_summary is null then
  raise exception 'Métadonnées de sauvegarde invalides.';
 end if;
 if not exists(select 1 from storage.objects where bucket_id='business-archives' and name=p_token::text||'/summary.pdf')
  or not exists(select 1 from storage.objects where bucket_id='business-archives' and name=p_token::text||'/backup.json') then
  raise exception 'La sauvegarde PDF et JSON doit être enregistrée avant toute réinitialisation.';
 end if;
 insert into public.business_archives(id,kind,period_start,period_end,created_by,pdf_path,backup_path,pdf_sha256,backup_sha256,report_count,summary,reset_completed)
 values(p_token,lockrow.kind,lockrow.period_start,lockrow.period_end,lockrow.created_by,p_token::text||'/summary.pdf',p_token::text||'/backup.json',p_pdf_sha256,p_backup_sha256,p_report_count,p_summary,lockrow.kind='reset') returning * into saved;
 if lockrow.kind='reset' then
  perform set_config('app.archive_token',p_token::text,true);
  insert into public.archived_reports(id,site_id,report_date,data,archive_id)
   select r.id,r.site_id,r.report_date,to_jsonb(r),p_token from public.reports r on conflict(id) do nothing;
  delete from public.reports; get diagnostics removed=row_count;
  delete from public.periods;
  insert into public.periods(site_id,opened_at) select id,clock_timestamp() from public.sites;
 end if;
 update public.archive_maintenance set token=null,expires_at=null where id=1;
 return jsonb_build_object('archive',to_jsonb(saved),'deleted_reports',removed);
end $$;

create or replace function public.cancel_business_archive(p_token uuid) returns void
language plpgsql security definer set search_path=public as $$
begin
 if coalesce(public.my_role(),'')<>'super' and coalesce(auth.role(),'')<>'service_role' then raise exception 'Accès refusé.' using errcode='42501'; end if;
 update public.archive_maintenance set token=null,expires_at=null where id=1 and token=p_token;
end $$;
revoke execute on function public.guard_archive_writes(),public.acquire_archive_snapshot(text,date,date),public.finish_business_archive(uuid,text,text,integer,jsonb),public.cancel_business_archive(uuid) from public,anon,authenticated;
grant execute on function public.acquire_archive_snapshot(text,date,date),public.finish_business_archive(uuid,text,text,integer,jsonb),public.cancel_business_archive(uuid) to authenticated,service_role;

-- Fichiers privés. Administrateurs : PDF uniquement. Super utilisateur : PDF et JSON.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('business-archives','business-archives',false,104857600,array['application/pdf','application/json'])
 on conflict(id) do update set public=false;
drop policy if exists business_archive_files_read on storage.objects;
create policy business_archive_files_read on storage.objects for select to authenticated
 using(bucket_id='business-archives' and (public.my_role()='super' or (public.my_role()='admin' and name like '%/summary.pdf')));
notify pgrst, 'reload schema';
commit;
