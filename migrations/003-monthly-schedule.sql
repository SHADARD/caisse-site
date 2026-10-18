-- Exécuter une fois, après 002. Le secret reste dans Vault, jamais dans le code.
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
create schema if not exists flamingo_private;
revoke all on schema flamingo_private from public, anon, authenticated;
do $$ begin
 if not exists(select 1 from vault.secrets where name='flamingo_monthly_archive_token_v1') then
  perform vault.create_secret(encode(extensions.gen_random_bytes(32),'hex'),'flamingo_monthly_archive_token_v1','Authentification interne de la sauvegarde mensuelle Flamingo');
 end if;
end $$;
create or replace function public.flamingo_archive_schedule_secret() returns text
language plpgsql security definer set search_path='' as $$
begin
 if coalesce(auth.jwt()->>'role','') <> 'service_role' then raise exception 'Accès refusé'; end if;
 return (select decrypted_secret from vault.decrypted_secrets where name='flamingo_monthly_archive_token_v1');
end $$;
revoke all on function public.flamingo_archive_schedule_secret() from public,anon,authenticated;
grant execute on function public.flamingo_archive_schedule_secret() to service_role;
create or replace function flamingo_private.dispatch_monthly_archive() returns bigint
language plpgsql security definer set search_path='' as $$
declare v_secret text; v_url text; v_request bigint;
begin
 select decrypted_secret into v_secret from vault.decrypted_secrets where name='flamingo_monthly_archive_token_v1';
 if v_secret is null then raise exception 'Planificateur non configuré'; end if;
 -- Le sous-domaine est celui du projet exécutant cette migration.
 v_url := 'https://iqwlwsxfthhibotdagrb.supabase.co/functions/v1/flamingo-monthly-archive';
 select net.http_post(url:=v_url,headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||v_secret),body:='{}'::jsonb,timeout_milliseconds:=60000) into v_request;
 return v_request;
end $$;
revoke all on function flamingo_private.dispatch_monthly_archive() from public,anon,authenticated,service_role;
