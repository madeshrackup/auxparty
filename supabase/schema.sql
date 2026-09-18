-- Aux Party accounts (public schema, not auth.users).
-- RLS on, no policies: the browser anon key cannot read these.
-- The Express / Vercel functions use the service role, which bypasses RLS.

create table if not exists public.accounts (
  id uuid primary key,
  username text not null,
  username_lower text generated always as (lower(username)) stored,
  email text,
  email_verified boolean not null default false,
  password_hash text not null,
  created_at timestamptz not null default now(),
  email_verify_sent_at timestamptz
);

create unique index if not exists accounts_username_lower on public.accounts (username_lower);
create unique index if not exists accounts_email_lower on public.accounts (lower(email)) where email is not null;

create table if not exists public.sessions (
  id uuid primary key,
  user_id uuid not null references public.accounts(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists sessions_user_id on public.sessions (user_id);

create table if not exists public.email_tokens (
  token_hash text primary key,
  user_id uuid not null references public.accounts(id) on delete cascade,
  expires_at timestamptz not null
);

create index if not exists email_tokens_user_id on public.email_tokens (user_id);

alter table public.accounts enable row level security;
alter table public.sessions enable row level security;
alter table public.email_tokens enable row level security;
