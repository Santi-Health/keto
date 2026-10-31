-- Saved meals sync: the foods and portions live in items (jsonb), so a meal syncs as one row.
-- saved_meal_items from the first schema is left unused.

alter table public.saved_meals
  add column items jsonb not null default '[]',
  add column meta jsonb not null default '{}',
  add column updated_at timestamptz not null default now(),
  add column deleted_at timestamptz;

create trigger saved_meals_set_updated_at before insert or update on public.saved_meals
  for each row execute function public.set_updated_at();

create index saved_meals_user_updated on public.saved_meals (user_id, updated_at);
