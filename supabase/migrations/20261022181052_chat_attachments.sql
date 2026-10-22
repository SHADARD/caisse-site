alter table public.chat_messages
 add column attachment_path text,
 add column attachment_name text,
 add column attachment_type text,
 add column attachment_size bigint;
alter table public.chat_messages drop constraint chat_messages_body_check;
alter table public.chat_messages add constraint chat_message_content check(
 length(btrim(body))<=4000 and (length(btrim(body))>0 or attachment_path is not null));
alter table public.chat_messages add constraint chat_attachment_complete check(
 (attachment_path is null and attachment_name is null and attachment_type is null and attachment_size is null)
 or (attachment_path is not null and attachment_name is not null and length(attachment_name) between 1 and 255 and attachment_type is not null and attachment_size is not null and attachment_size between 1 and 10485760));
create unique index chat_attachment_path_unique on public.chat_messages(attachment_path) where attachment_path is not null;
grant insert(attachment_path,attachment_name,attachment_type,attachment_size) on public.chat_messages to authenticated;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values(
 'chat-attachments','chat-attachments',false,10485760,array[
 'image/jpeg','image/png','image/webp','image/gif','image/heic','image/heif',
 'application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
 'application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
 'application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation','text/plain','text/csv']);
create policy chat_attachment_upload on storage.objects for insert to authenticated with check(
 bucket_id='chat-attachments' and (select public.my_role()) is not null
 and split_part(name,'/',1)=(select auth.uid())::text
 and split_part(name,'/',2) ~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
 and split_part(name,'/',3) ~ '^file\.[a-z0-9]+$' and array_length(string_to_array(name,'/'),1)=3);
create policy chat_attachment_read on storage.objects for select to authenticated using(
 bucket_id='chat-attachments' and (select public.my_role()) is not null and
 (split_part(name,'/',1)=(select auth.uid())::text or exists(select 1 from public.chat_messages m where m.attachment_path=name)));
create policy chat_attachment_cleanup on storage.objects for delete to authenticated using(
 bucket_id='chat-attachments' and (select public.my_role()) is not null
 and split_part(name,'/',1)=(select auth.uid())::text
 and not exists(select 1 from public.chat_messages m where m.attachment_path=name));
-- L’objet doit être chargé avant le message et les métadonnées doivent correspondre.
create function flamingo_private.validate_chat_attachment() returns trigger
language plpgsql security invoker set search_path='' as $$
declare metadata jsonb;
begin
 if new.attachment_path is null then return new;end if;
 if new.attachment_path !~ ('^'||new.sender_id::text||'/'||new.id::text||'/file\.[a-z0-9]+$') then raise exception 'Chemin de pièce jointe invalide.';end if;
 select o.metadata into metadata from storage.objects o where o.bucket_id='chat-attachments' and o.name=new.attachment_path;
 if not found then raise exception 'Le fichier doit être chargé avant l’envoi du message.';end if;
 if (metadata->>'size')::bigint is distinct from new.attachment_size or metadata->>'mimetype' is distinct from new.attachment_type then raise exception 'Les informations du fichier ne correspondent pas au stockage.';end if;
 if new.attachment_type not in ('image/jpeg','image/png','image/webp','image/gif','image/heic','image/heif','application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation','text/plain','text/csv') then raise exception 'Type de fichier non accepté.';end if;
 return new;
end $$;
revoke all on function flamingo_private.validate_chat_attachment() from public,anon,authenticated,service_role;
create trigger validate_chat_attachment before insert or update on public.chat_messages
 for each row execute function flamingo_private.validate_chat_attachment();
