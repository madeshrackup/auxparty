-- Lock down PostgREST and Storage. Run after the other schema files.
-- Browser anon/authenticated keys stay blocked; the API uses the service role.

revoke all on all tables in schema public from anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

alter table public.accounts enable row level security;
alter table public.accounts force row level security;
alter table public.sessions enable row level security;
alter table public.sessions force row level security;
alter table public.email_tokens enable row level security;
alter table public.email_tokens force row level security;

alter table public.password_resets enable row level security;
alter table public.password_resets force row level security;
alter table public.password_challenges enable row level security;
alter table public.password_challenges force row level security;

alter table public.friendships enable row level security;
alter table public.friendships force row level security;
alter table public.friend_requests enable row level security;
alter table public.friend_requests force row level security;
alter table public.friend_messages enable row level security;
alter table public.friend_messages force row level security;

alter table public.achievements enable row level security;
alter table public.achievements force row level security;

alter table if exists public.security_events enable row level security;
alter table if exists public.security_events force row level security;

alter table storage.objects enable row level security;

-- Public can read avatars; nobody using the anon key can write.
drop policy if exists "avatars public read" on storage.objects;
create policy "avatars public read"
  on storage.objects
  for select
  using (bucket_id = 'avatars');
-- No insert/update/delete policies on avatars: service role still bypasses RLS.
