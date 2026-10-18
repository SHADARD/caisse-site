-- Suppression logique : préserver les rapports, les caisses et les PDF existants.
alter table public.sites add column if not exists deleted_at timestamptz;
alter table public.profiles add column if not exists deleted_at timestamptz;
alter table public.profiles drop constraint if exists profiles_username_check;
alter table public.profiles drop constraint if exists profiles_username_key;
alter table public.profiles add constraint profiles_username_not_empty check(length(btrim(username))>0);
create unique index profiles_username_normalized on public.profiles(md5(lower(btrim(username))));
create or replace function public.my_role() returns text language sql stable security definer set search_path='' as $$
 select role from public.profiles where id=auth.uid() and deleted_at is null
$$;
create or replace function public.can_read_site(s uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles p where p.id=auth.uid() and p.deleted_at is null and (p.role in ('admin','super') or (p.site_id=s and exists(select 1 from public.sites where id=s and deleted_at is null))))
$$;
alter policy profiles_read on public.profiles using(deleted_at is null and (id=auth.uid() or public.my_role()='super'));
create or replace function public.limit_admins() returns trigger language plpgsql set search_path='' as $$
begin
 perform pg_advisory_xact_lock(813742);
 if new.deleted_at is null and new.role='admin' and (select count(*) from public.profiles where role='admin' and deleted_at is null and id<>new.id)>=2 then raise exception 'Deux comptes administrateurs maximum.'; end if;
 if new.deleted_at is null and new.role='site' and not exists(select 1 from public.sites where id=new.site_id and deleted_at is null) then raise exception 'Site supprimé ou introuvable.'; end if;
 return new;
end $$;
-- Conserver les autres contrôles des fonctions déjà déployées.
do $$ declare definition text; begin
 select pg_get_functiondef('public.add_report(uuid,date,numeric,numeric,numeric,numeric,numeric)'::regprocedure) into definition;
 definition:=replace(definition,'where id=auth.uid() and (role=','where deleted_at is null and id=auth.uid() and (role=');
 definition:=replace(definition,'where id=p_site for update','where id=p_site and deleted_at is null for update');
 definition:=replace(definition,'select id into pid from public.periods','if not found then raise exception ''Site supprimé ou introuvable.'';end if; select id into pid from public.periods');
 execute definition;
 select pg_get_functiondef('public.close_period(uuid,uuid)'::regprocedure) into definition;
 definition:=replace(definition,'where id=p_site for update;stamp=', 'where id=p_site and deleted_at is null for update;if not found then raise exception ''Site supprimé ou introuvable.'';end if;stamp=');
 execute definition;
 select pg_get_functiondef('public.finish_business_archive(uuid,text,text,integer,jsonb)'::regprocedure) into definition;
 definition:=replace(definition,'select id,clock_timestamp() from public.sites;','select id,clock_timestamp() from public.sites where deleted_at is null;');
 execute definition;
end $$;
create or replace function public.remove_managed_entity(p_kind text,p_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare affected jsonb; target public.profiles; stamp timestamptz:=clock_timestamp();
begin
 if auth.uid() is null or coalesce(public.my_role(),'')<>'super' then raise exception 'Seul le super utilisateur peut supprimer.' using errcode='42501'; end if;
 -- Même ordre de verrouillage que les sauvegardes, pour un instantané cohérent.
 lock table public.sites,public.profiles,public.periods,public.reports in share row exclusive mode;
 if p_kind='user' then
  select * into target from public.profiles where id=p_id and deleted_at is null;
  if not found then raise exception 'Compte introuvable ou déjà supprimé.'; end if;
  if target.id=auth.uid() or target.role='super' then raise exception 'Le compte super utilisateur ne peut pas être supprimé.'; end if;
  update public.profiles set deleted_at=stamp where id=p_id;
  affected:=jsonb_build_array(p_id);
 elsif p_kind='site' then
  if not exists(select 1 from public.sites where id=p_id and deleted_at is null) then raise exception 'Site introuvable ou déjà supprimé.'; end if;
  select coalesce(jsonb_agg(id),'[]'::jsonb) into affected from public.profiles where site_id=p_id and deleted_at is null;
  update public.periods set closed_at=greatest(stamp,opened_at),closed_by=auth.uid(),closed_by_name=(select display_name from public.profiles where id=auth.uid()) where site_id=p_id and closed_at is null;
  update public.profiles set deleted_at=stamp where site_id=p_id and deleted_at is null;
  update public.sites set deleted_at=stamp where id=p_id;
 else raise exception 'Type de suppression invalide.'; end if;
 return jsonb_build_object('disabled_users',affected);
end $$;
revoke all on function public.remove_managed_entity(text,uuid) from public,anon;
grant execute on function public.remove_managed_entity(text,uuid) to authenticated;
