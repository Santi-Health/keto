-- Daily Fitbit totals (steps, calories burned, resting heart rate, sleep), one synced row per local day,
-- and DEXA body scans as readings. The original daily_activity table was never used, so it is replaced.

drop table if exists public.daily_activity;

create table public.daily_activity (
  id text not null,                  -- the day, YYYY-MM-DD
  user_id uuid not null references auth.users on delete cascade default auth.uid(),
  day date not null,
  steps integer,
  calories_out numeric,
  resting_hr numeric,
  sleep_minutes integer,
  meta jsonb not null default '{}',  -- sleep times and stages
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  primary key (user_id, id)
);

alter table public.daily_activity enable row level security;
create policy "owner only" on public.daily_activity for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create trigger daily_activity_set_updated_at before insert or update on public.daily_activity
  for each row execute function public.set_updated_at();

create index daily_activity_user_updated on public.daily_activity (user_id, updated_at);

alter table public.readings drop constraint if exists readings_kind_check;
alter table public.readings add constraint readings_kind_check
  check (kind in ('glucose', 'blood_ketone', 'urine_ketone', 'weight', 'lab', 'water', 'body_scan'));
