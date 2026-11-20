alter table public.profiles
  add column if not exists collaboration_categories text[] not null default '{}',
  add column if not exists services text[] not null default '{}',
  add column if not exists specialisations text[] not null default '{}',
  add column if not exists portfolio_links text[] not null default '{}';
