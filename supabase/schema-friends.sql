-- Friends, requests, and DMs. Run this in the Supabase SQL editor on top of schema.sql.

create table if not exists public.friendships (
  user_id uuid not null references public.accounts(id) on delete cascade,
  friend_id uuid not null references public.accounts(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, friend_id),
  check (user_id <> friend_id)
);

create index if not exists friendships_friend_id on public.friendships (friend_id);

create table if not exists public.friend_requests (
  id uuid primary key,
  from_id uuid not null references public.accounts(id) on delete cascade,
  to_id uuid not null references public.accounts(id) on delete cascade,
  message text,
  created_at timestamptz not null default now(),
  unique (from_id, to_id),
  check (from_id <> to_id)
);

alter table public.friend_requests add column if not exists message text;

create index if not exists friend_requests_to_id on public.friend_requests (to_id);

create table if not exists public.friend_messages (
  id uuid primary key,
  from_id uuid not null references public.accounts(id) on delete cascade,
  to_id uuid not null references public.accounts(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  check (from_id <> to_id),
  check (char_length(body) > 0 and char_length(body) <= 500)
);

create index if not exists friend_messages_pair_created
  on public.friend_messages (from_id, to_id, created_at);

alter table public.friendships enable row level security;
alter table public.friend_requests enable row level security;
alter table public.friend_messages enable row level security;
