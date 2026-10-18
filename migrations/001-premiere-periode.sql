-- À exécuter une fois sur le projet existant. Conserve tous les rapports.
create or replace function public.validate_report_dates()
returns trigger
language plpgsql
set search_path=public
as $$
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
$$;
