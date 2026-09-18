-- Profile, avatars, password reset, and change-password 2FA.
-- Run this in the Supabase SQL editor on top of schema.sql.

alter table public.accounts add column if not exists about_me text;
alter table public.accounts add column if not exists avatar_path text;

create table if not exists public.password_resets (
  token_hash text primary key,
  user_id uuid not null references public.accounts(id) on delete cascade,
  expires_at timestamptz not null
);

create index if not exists password_resets_user_id on public.password_resets (user_id);

create table if not exists public.password_challenges (
  id uuid primary key,
  user_id uuid not null references public.accounts(id) on delete cascade,
  code_hash text not null,
  new_password_hash text not null,
  expires_at timestamptz not null
);

create index if not exists password_challenges_user_id on public.password_challenges (user_id);

alter table public.password_resets enable row level security;
alter table public.password_challenges enable row level security;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  true,
  2097152,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do nothing;
