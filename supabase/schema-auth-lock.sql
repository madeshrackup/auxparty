-- Account lockout after failed logins, plus an append-only security event log.
-- Run this in the Supabase SQL editor after schema.sql (and schema-security.sql).

alter table public.accounts add column if not exists failed_login_count integer not null default 0;
alter table public.accounts add column if not exists locked_until timestamptz;
alter table public.accounts add column if not exists last_failed_login_at timestamptz;

create table if not exists public.security_events (
  id uuid primary key default gen_random_uuid(),
  event text not null,
  user_id uuid references public.accounts(id) on delete set null,
  ip text,
  detail text,
  created_at timestamptz not null default now()
);

create index if not exists security_events_created_at on public.security_events (created_at desc);
create index if not exists security_events_user_id on public.security_events (user_id);

alter table public.security_events enable row level security;
alter table public.security_events force row level security;

revoke all on public.security_events from anon, authenticated;
revoke all on public.accounts from anon, authenticated;
