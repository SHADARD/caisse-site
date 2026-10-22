-- Les conversations n'exposent que les noms affichés, jamais les identifiants de connexion.
create table public.chat_people(
 id uuid primary key references public.profiles(id) on delete restrict,
 display_name text not null,
 is_active boolean not null default true
);
alter table public.chat_people enable row level security;
create table public.chat_messages(
 id uuid primary key default gen_random_uuid(),
 sender_id uuid not null default auth.uid() references public.chat_people(id) on delete restrict,
 recipient_id uuid references public.chat_people(id) on delete restrict,
 body text not null check(length(btrim(body)) between 1 and 4000),
 created_at timestamptz not null default now(),
 check(recipient_id is null or recipient_id<>sender_id)
);
alter table public.chat_messages enable row level security;
create index chat_general_recent on public.chat_messages(created_at desc,id desc) where recipient_id is null;
create index chat_sender_recent on public.chat_messages(sender_id,recipient_id,created_at desc,id desc);
create index chat_recipient_recent on public.chat_messages(recipient_id,sender_id,created_at desc,id desc);
create policy chat_people_read on public.chat_people for select to authenticated
 using((select public.my_role()) is not null);
create policy chat_messages_read on public.chat_messages for select to authenticated
 using((select public.my_role()) is not null and
  (recipient_id is null or sender_id=(select auth.uid()) or recipient_id=(select auth.uid())));
create policy chat_messages_send on public.chat_messages for insert to authenticated
 with check((select public.my_role()) is not null and sender_id=(select auth.uid())
  and (recipient_id is null or exists(select 1 from public.chat_people p where p.id=recipient_id and p.is_active)));
revoke all on public.chat_people,public.chat_messages from anon,authenticated;
grant select on public.chat_people,public.chat_messages to authenticated;
grant insert(id,recipient_id,body) on public.chat_messages to authenticated;
grant all on public.chat_people,public.chat_messages to service_role;
create schema if not exists flamingo_private;
revoke all on schema flamingo_private from public,anon,authenticated;
-- Fonction interne de trigger uniquement : aucun endpoint RPC ni droit d'exécution utilisateur.
create function flamingo_private.sync_chat_person() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 insert into public.chat_people(id,display_name,is_active)
 values(new.id,new.display_name,new.deleted_at is null)
 on conflict(id) do update set display_name=excluded.display_name,is_active=excluded.is_active;
 return new;
end $$;
revoke all on function flamingo_private.sync_chat_person() from public,anon,authenticated,service_role;
insert into public.chat_people(id,display_name,is_active)
 select id,display_name,deleted_at is null from public.profiles;
create trigger sync_chat_person after insert or update of display_name,deleted_at on public.profiles
 for each row execute function flamingo_private.sync_chat_person();
do $$ begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') then
  alter publication supabase_realtime add table public.chat_messages;
 end if;
end $$;
