create table public.chat_read_state(
 user_id uuid not null default auth.uid() references public.chat_people(id) on delete restrict,
 conversation_key text not null check(conversation_key='general' or conversation_key ~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'),
 last_read_at timestamptz not null,
 last_read_id uuid not null,
 primary key(user_id,conversation_key)
);
alter table public.chat_read_state enable row level security;
create policy chat_read_own_select on public.chat_read_state for select to authenticated using(user_id=(select auth.uid()) and (select public.my_role()) is not null);
create policy chat_read_own_insert on public.chat_read_state for insert to authenticated with check(user_id=(select auth.uid()) and (select public.my_role()) is not null);
create policy chat_read_own_update on public.chat_read_state for update to authenticated using(user_id=(select auth.uid()) and (select public.my_role()) is not null) with check(user_id=(select auth.uid()) and (select public.my_role()) is not null);
revoke all on public.chat_read_state from anon,authenticated;
grant select,insert,update on public.chat_read_state to authenticated;
grant all on public.chat_read_state to service_role;
create function public.chat_unread_counts() returns table(conversation_key text,unread_count bigint)
language sql stable security invoker set search_path='' as $$
 select case when m.recipient_id is null then 'general' else m.sender_id::text end as conversation_key,count(*) as unread_count
 from public.chat_messages m
 left join public.chat_read_state r on r.user_id=auth.uid() and r.conversation_key=case when m.recipient_id is null then 'general' else m.sender_id::text end
 where m.sender_id<>auth.uid() and (m.recipient_id is null or m.recipient_id=auth.uid())
  and (r.user_id is null or (m.created_at,m.id)>(r.last_read_at,r.last_read_id))
 group by 1
$$;
create function public.mark_chat_read(p_peer uuid,p_message uuid) returns void
language plpgsql security invoker set search_path='' as $$
declare message public.chat_messages; key text;
begin
 select * into message from public.chat_messages m where m.id=p_message and
  ((p_peer is null and m.recipient_id is null) or
   (p_peer is not null and ((m.sender_id=auth.uid() and m.recipient_id=p_peer) or (m.sender_id=p_peer and m.recipient_id=auth.uid()))));
 if not found then raise exception 'Conversation ou message inaccessible.' using errcode='42501'; end if;
 key:=case when p_peer is null then 'general' else p_peer::text end;
 insert into public.chat_read_state(user_id,conversation_key,last_read_at,last_read_id)
 values(auth.uid(),key,message.created_at,message.id)
 on conflict(user_id,conversation_key) do update set last_read_at=excluded.last_read_at,last_read_id=excluded.last_read_id
 where (public.chat_read_state.last_read_at,public.chat_read_state.last_read_id)<(excluded.last_read_at,excluded.last_read_id);
end $$;
revoke all on function public.chat_unread_counts(),public.mark_chat_read(uuid,uuid) from public,anon;
grant execute on function public.chat_unread_counts(),public.mark_chat_read(uuid,uuid) to authenticated;
do $$ begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') then alter publication supabase_realtime add table public.chat_read_state;end if;
end $$;
