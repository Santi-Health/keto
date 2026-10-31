-- Continuous glucose (CGM) readings, one row per local day so the app stays light:
-- points is [[minute_of_day, mg_dl], ...]. id is the day (YYYY-MM-DD).

create table public.cgm_days (
  id text not null,
  user_id uuid not null references auth.users on delete cascade default auth.uid(),
  day date not null,
  points jsonb not null default '[]',
  source text not null default 'google_health',
  meta jsonb not null default '{}',
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  primary key (user_id, id)
);

alter table public.cgm_days enable row level security;
create policy "owner only" on public.cgm_days for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create trigger cgm_days_set_updated_at before insert or update on public.cgm_days
  for each row execute function public.set_updated_at();

create index cgm_days_user_updated on public.cgm_days (user_id, updated_at);
