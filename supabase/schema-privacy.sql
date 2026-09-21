-- Consent timestamps for signup. Run after schema.sql. Deletion uses ON DELETE CASCADE
-- already set on sessions, tokens, friends, achievements, and related tables.

alter table public.accounts add column if not exists terms_accepted_at timestamptz;
alter table public.accounts add column if not exists age_confirmed boolean not null default false;
