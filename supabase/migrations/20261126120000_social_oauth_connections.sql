-- Private OAuth credentials are server-only. Do not add SELECT policies for anon/authenticated.
create table if not exists public.social_oauth_credentials (
  user_id uuid not null references auth.users(id) on delete cascade,
  platform text not null check (platform in ('instagram', 'youtube')),
  provider_account_id text not null,
  social_account_id uuid not null references public.social_accounts(id) on delete cascade,
  access_token_ciphertext text not null,
  refresh_token_ciphertext text,
  token_expires_at timestamptz,
  granted_scopes text[] not null default '{}',
  metrics jsonb not null default '{}'::jsonb,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, platform),
  unique (platform, provider_account_id)
);

create index if not exists social_oauth_credentials_account_idx
  on public.social_oauth_credentials (social_account_id);

alter table public.social_oauth_credentials enable row level security;
revoke all on public.social_oauth_credentials from anon, authenticated;
grant all on public.social_oauth_credentials to service_role;

comment on table public.social_oauth_credentials is
  'Encrypted social OAuth credentials and private metrics. Access only from authenticated server routes using the Supabase service role; never expose token ciphertext to browser clients.';
