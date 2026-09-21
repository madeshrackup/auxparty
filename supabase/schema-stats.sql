-- All-time points and per-mode records. Run after schema-achievements.sql.

alter table public.accounts add column if not exists points integer not null default 0;
alter table public.accounts add column if not exists mode_stats jsonb not null default '{}'::jsonb;
