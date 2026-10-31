-- Exercise logging sync: details (lifts, fasted) in meta, soft deletes, server-set updated_at.

alter table public.exercises
  add column meta jsonb not null default '{}',
  add column updated_at timestamptz not null default now(),
  add column deleted_at timestamptz;

create trigger exercises_set_updated_at before insert or update on public.exercises
  for each row execute function public.set_updated_at();

create index exercises_user_updated on public.exercises (user_id, updated_at);
