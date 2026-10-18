-- À exécuter une seule fois dans l'éditeur SQL d'un nouveau projet Supabase.
begin;
create table public.sites(id uuid primary key default gen_random_uuid(),name text not null check(length(trim(name))>0));
create table public.profiles(id uuid primary key references auth.users(id) on delete restrict,username text not null unique check(username ~ '^[a-z0-9][a-z0-9._-]{2,39}$'),display_name text not null,role text not null check(role in ('site','admin','super')),site_id uuid references public.sites(id),check((role='site' and site_id is not null) or (role in ('admin','super') and site_id is null)));
create table public.periods(id uuid primary key default gen_random_uuid(),site_id uuid not null references public.sites(id),opened_at timestamptz not null default now(),closed_at timestamptz,closed_by uuid references public.profiles(id),closed_by_name text,unique(id,site_id),check((closed_at is null and closed_by is null) or (closed_at is not null and closed_by is not null and closed_at>=opened_at)));
create unique index one_open_period on public.periods(site_id) where closed_at is null;
create table public.reports(id uuid primary key default gen_random_uuid(),site_id uuid not null references public.sites(id),period_id uuid not null,report_date date not null,connection numeric not null check(connection between 0 and 999999999999 and connection=round(connection,2)),mpesa numeric not null check(mpesa between 0 and 999999999999 and mpesa=round(mpesa,2)),commission numeric not null check(commission between 0 and 999999999999 and commission=round(commission,2)),gold_cost numeric not null check(gold_cost between 0 and 999999999999 and gold_cost=round(gold_cost,2)),gold_weight numeric not null check(gold_weight between 0 and 999999999999 and gold_weight=round(gold_weight,3)),created_by uuid not null references public.profiles(id),created_at timestamptz not null default now(),unique(site_id,report_date),foreign key(period_id,site_id) references public.periods(id,site_id));
create function public.my_role() returns text language sql stable security definer set search_path=public as $$select role from public.profiles where id=auth.uid()$$;
create function public.can_read_site(s uuid) returns boolean language sql stable security definer set search_path=public as $$select exists(select 1 from public.profiles where id=auth.uid() and (role in ('admin','super') or site_id=s))$$;
create function public.limit_admins() returns trigger language plpgsql set search_path=public as $$begin perform pg_advisory_xact_lock(813742);if new.role='admin' and (select count(*) from public.profiles where role='admin' and id<>new.id)>=2 then raise exception 'Deux comptes administrateurs maximum.';end if;return new;end$$;
create trigger limit_admins before insert or update on public.profiles for each row execute function public.limit_admins();
create function public.initial_period() returns trigger language plpgsql security definer set search_path=public as $$begin insert into public.periods(site_id) values(new.id);return new;end$$;
create trigger initial_period after insert on public.sites for each row execute function public.initial_period();
create or replace function public.validate_report_dates()
returns trigger
language plpgsql
set search_path=public
as $
declare
  p public.periods;
  has_previous boolean;
begin
  select * into p from public.periods
  where id=new.period_id and site_id=new.site_id;
  if not found then raise exception 'Période introuvable.'; end if;

  select exists(
    select 1 from public.periods previous
    where previous.site_id=p.site_id
      and previous.id<>p.id
      and previous.closed_at is not null
      and previous.closed_at<=p.opened_at
  ) into has_previous;

  if new.report_date>(now() at time zone 'Africa/Kinshasa')::date
    or (has_previous and new.report_date<(p.opened_at at time zone 'Africa/Kinshasa')::date)
    or (p.closed_at is not null and new.report_date>(p.closed_at at time zone 'Africa/Kinshasa')::date)
  then
    raise exception 'La date doit appartenir à la période et ne peut pas être future.';
  end if;

  if TG_OP='UPDATE' and
    (new.site_id<>old.site_id or new.period_id<>old.period_id
     or new.created_by<>old.created_by or new.created_at<>old.created_at)
  then
    raise exception 'Les informations de rattachement du rapport ne peuvent pas être modifiées.';
  end if;
  return new;
end
$;
create trigger validate_report_dates before insert or update on public.reports for each row execute function public.validate_report_dates();
create function public.add_report(p_site uuid,p_date date,p_connection numeric,p_mpesa numeric,p_commission numeric,p_gold_cost numeric,p_gold_weight numeric) returns uuid language plpgsql security definer set search_path=public as $$declare pid uuid;rid uuid;begin
 if not exists(select 1 from public.profiles where id=auth.uid() and (role='super' or (role='site' and site_id=p_site))) then raise exception 'Action non autorisée.' using errcode='42501';end if;
 perform 1 from public.sites where id=p_site for update;
 select id into pid from public.periods where site_id=p_site and closed_at is null;
 if pid is null then raise exception 'Aucune période ouverte.';end if;
 insert into public.reports(site_id,period_id,report_date,connection,mpesa,commission,gold_cost,gold_weight,created_by) values(p_site,pid,p_date,p_connection,p_mpesa,p_commission,p_gold_cost,p_gold_weight,auth.uid()) returning id into rid;return rid;end$$;
create function public.close_period(p_site uuid,p_period uuid) returns uuid language plpgsql security definer set search_path=public as $$declare stamp timestamptz;pid uuid;begin
 if coalesce(public.my_role(),'') not in ('admin','super') then raise exception 'Action non autorisée.' using errcode='42501';end if;
 perform 1 from public.sites where id=p_site for update;stamp=clock_timestamp();
 update public.periods set closed_at=stamp,closed_by=auth.uid(),closed_by_name=(select display_name from public.profiles where id=auth.uid()) where id=p_period and site_id=p_site and closed_at is null;
 if not found then raise exception 'Cette période a déjà été clôturée. Actualisez la page.';end if;
 insert into public.periods(site_id,opened_at) values(p_site,stamp) returning id into pid;return pid;end$$;
alter table public.sites enable row level security;
alter table public.profiles enable row level security;
alter table public.periods enable row level security;
alter table public.reports enable row level security;
create policy sites_read on public.sites for select to authenticated using(public.can_read_site(id));
create policy profiles_read on public.profiles for select to authenticated using(id=auth.uid() or public.my_role()='super');
create policy periods_read on public.periods for select to authenticated using(public.can_read_site(site_id));
create policy reports_read on public.reports for select to authenticated using(public.can_read_site(site_id));
create policy reports_edit on public.reports for update to authenticated using(public.my_role()='super') with check(public.my_role()='super');
create policy reports_delete on public.reports for delete to authenticated using(public.my_role()='super');
create function public.create_site(p_name text) returns uuid language plpgsql security definer set search_path=public as $$declare sid uuid;begin if coalesce(public.my_role(),'')<>'super' then raise exception 'Action non autorisée.' using errcode='42501';end if;if length(trim(p_name))<1 or length(p_name)>100 then raise exception 'Nom du site invalide.';end if;insert into public.sites(name) values(trim(p_name)) returning id into sid;return sid;end$$;
-- Le premier super utilisateur est créé dans Supabase. Les comptes suivants
-- passent par la fonction serveur Netlify, exclusivement pour le super utilisateur.
-- Aucune inscription publique et aucune écriture directe des périodes/profils.
revoke all on public.sites,public.profiles,public.periods,public.reports from anon,authenticated;
grant select on public.sites,public.profiles,public.periods,public.reports to authenticated;
grant update(report_date,connection,mpesa,commission,gold_cost,gold_weight),delete on public.reports to authenticated;
revoke execute on all functions in schema public from public,anon,authenticated;
grant execute on function public.my_role(),public.can_read_site(uuid),public.add_report(uuid,date,numeric,numeric,numeric,numeric,numeric),public.close_period(uuid,uuid),public.create_site(text) to authenticated;
commit;
