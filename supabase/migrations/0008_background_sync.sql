-- Background sync with Google Health every 4 hours.
-- google_tokens holds the long-lived Google refresh token. It has row-level security on and NO policies,
-- so the app (and anyone with the public key) can never read it; only the server function can.
-- sync_status is what the app shows: linked or not, last sync, last error, needs re-linking.

create table public.google_tokens (
  user_id uuid primary key references auth.users on delete cascade,
  refresh_token text not null,
  scopes text not null,
  linked_at timestamptz not null default now()
);
alter table public.google_tokens enable row level security;

create table public.sync_status (
  user_id uuid primary key references auth.users on delete cascade default auth.uid(),
  linked_at timestamptz,
  time_zone text not null default 'America/Los_Angeles',
  last_sync_at timestamptz,
  last_result text,
  last_error text,
  needs_relink boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table public.sync_status enable row level security;
create policy "owner reads" on public.sync_status for select using (user_id = auth.uid());

-- Run the sync every 4 hours (at :17 past, to avoid the top-of-hour rush).
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'health-sync-every-4h',
  '17 */4 * * *',
  $$ select net.http_post(
       url := 'https://nzmspsvmekxhqmxmfykx.supabase.co/functions/v1/health-sync/run',
       headers := '{"Content-Type": "application/json"}'::jsonb,
       body := '{}'::jsonb
     ) $$
);
