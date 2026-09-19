-- Achievements and match wins. Run after schema.sql / schema-profile.sql.

alter table public.accounts add column if not exists wins integer not null default 0;

create table if not exists public.achievements (
  user_id uuid not null references public.accounts(id) on delete cascade,
  achievement_id text not null,
  unlocked_at timestamptz not null default now(),
  primary key (user_id, achievement_id)
);

create index if not exists achievements_user_id on public.achievements (user_id);

alter table public.achievements enable row level security;
