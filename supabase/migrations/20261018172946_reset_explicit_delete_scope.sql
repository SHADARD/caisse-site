-- Corriger la procédure uniquement ; cette migration ne supprime aucune donnée.
do $$ declare definition text; begin
 select pg_get_functiondef('public.finish_business_archive(uuid,text,text,integer,jsonb)'::regprocedure) into definition;
 definition:=replace(definition,
  'delete from public.reports;',
  'delete from public.reports where id in (select id from public.archived_reports where archive_id=p_token);');
 definition:=replace(definition,
  'delete from public.periods;',
  'delete from public.periods where site_id in (select id from public.sites);');
 execute definition;
end $$;
