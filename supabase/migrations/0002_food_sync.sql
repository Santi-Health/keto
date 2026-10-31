-- Food logging sync: watch-list details on foods and logs, soft deletes,
-- and a server-set updated_at so devices can pull "what changed since".

alter table public.foods
  add column meta jsonb not null default '{}',
  add column deleted_at timestamptz;

-- Log entries snapshot their nutrients, and logs may sync before the food they came from,
-- so the link to foods is informational rather than a foreign key.
alter table public.food_logs drop constraint if exists food_logs_food_id_fkey;

alter table public.food_logs
  add column meta jsonb not null default '{}',
  add column updated_at timestamptz not null default now(),
  add column deleted_at timestamptz;

create or replace function public.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger foods_set_updated_at before insert or update on public.foods
  for each row execute function public.set_updated_at();
create trigger food_logs_set_updated_at before insert or update on public.food_logs
  for each row execute function public.set_updated_at();

create index foods_user_updated on public.foods (user_id, updated_at);
create index food_logs_user_updated on public.food_logs (user_id, updated_at);
