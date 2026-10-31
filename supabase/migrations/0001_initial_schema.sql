-- Keto Tracker initial schema.
-- Every table is owned by one user and protected by row-level security,
-- so only the signed-in owner can read or write their rows.

-- Profile and target settings (shape matches src/lib/types.ts Profile).
create table public.profiles (
  user_id uuid primary key references auth.users on delete cascade default auth.uid(),
  data jsonb not null,
  updated_at timestamptz not null default now()
);

-- Food library: database results, label photos, AI estimates and manual entries.
create table public.foods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade default auth.uid(),
  name text not null,
  brand text,
  barcode text,
  per_100g jsonb not null,          -- nutrients per 100 g (or 100 ml)
  unit_conversions jsonb not null default '[]', -- [{unit, grams}]
  ingredients_text text,
  keto_notes text,
  carbs_exclude_fiber boolean not null default false,
  source text not null check (source in ('label_photo', 'database', 'ai_estimate', 'manual', 'recipe')),
  confidence text check (confidence in ('high', 'medium', 'low')),
  fields_estimated text[] not null default '{}',
  favorite boolean not null default false,
  use_count integer not null default 0,
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index foods_user_barcode on public.foods (user_id, barcode);

-- Recipes are stored as foods (source = 'recipe') plus their ingredient list.
create table public.recipe_ingredients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade default auth.uid(),
  recipe_food_id uuid not null references public.foods on delete cascade,
  ingredient_food_id uuid not null references public.foods,
  amount numeric not null,
  unit text not null,
  grams numeric not null
);

create table public.saved_meals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade default auth.uid(),
  name text not null,
  use_count integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.saved_meal_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade default auth.uid(),
  saved_meal_id uuid not null references public.saved_meals on delete cascade,
  food_id uuid not null references public.foods,
  amount numeric not null,
  unit text not null,
  grams numeric not null
);

-- What was eaten. Nutrients are snapshotted so later food edits don't rewrite history.
create table public.food_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade default auth.uid(),
  eaten_at timestamptz not null,
  meal text not null check (meal in ('breakfast', 'lunch', 'dinner', 'snack')),
  food_id uuid references public.foods on delete set null,
  food_name text not null,
  amount numeric not null,
  unit text not null,
  grams numeric not null,
  nutrients jsonb not null,
  created_at timestamptz not null default now()
);
create index food_logs_user_time on public.food_logs (user_id, eaten_at);

-- Glucose (mg/dL), blood ketones (mmol/L), urine ketone strips.
create table public.readings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade default auth.uid(),
  taken_at timestamptz not null,
  kind text not null check (kind in ('glucose', 'blood_ketone', 'urine_ketone')),
  value numeric,                 -- null for urine strips
  urine_level text check (urine_level in ('negative', 'trace', 'small', 'moderate', 'large')),
  context text not null default 'other'
    check (context in ('fasted', 'pre_meal', 'post_meal_1h', 'post_meal_2h', 'post_exercise', 'bedtime', 'other')),
  note text,
  predicted_value numeric,       -- model prediction at the time, for learning
  created_at timestamptz not null default now()
);
create index readings_user_time on public.readings (user_id, taken_at);

create table public.body_measurements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade default auth.uid(),
  measured_at timestamptz not null,
  weight_kg numeric,
  body_fat_pct numeric,
  source text not null default 'manual' check (source in ('manual', 'fitbit'))
);

create table public.lab_results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade default auth.uid(),
  taken_on date not null,
  test text not null,            -- e.g. HbA1c, fasting insulin, LDL
  value numeric not null,
  unit text not null,
  note text
);

create table public.exercises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade default auth.uid(),
  started_at timestamptz not null,
  kind text not null,            -- strength, cardio, hiit, walking, sport, ...
  duration_min numeric not null,
  intensity text check (intensity in ('low', 'moderate', 'high')),
  calories numeric,
  source text not null default 'manual' check (source in ('manual', 'fitbit')),
  external_id text,              -- Fitbit log id, to avoid duplicates
  note text
);

-- One row per day of Fitbit totals.
create table public.daily_activity (
  user_id uuid not null references auth.users on delete cascade default auth.uid(),
  day date not null,
  calories_out numeric,
  steps integer,
  active_minutes integer,
  sleep_minutes integer,
  synced_at timestamptz not null default now(),
  primary key (user_id, day)
);

create table public.fasts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade default auth.uid(),
  started_at timestamptz not null,
  ended_at timestamptz
);

create table public.water_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade default auth.uid(),
  logged_at timestamptz not null,
  oz numeric not null
);

-- Row-level security: owner-only access on every table.
do $$
declare t text;
begin
  foreach t in array array[
    'profiles', 'foods', 'recipe_ingredients', 'saved_meals', 'saved_meal_items',
    'food_logs', 'readings', 'body_measurements', 'lab_results', 'exercises',
    'daily_activity', 'fasts', 'water_logs'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy "owner only" on public.%I for all using (user_id = auth.uid()) with check (user_id = auth.uid())',
      t
    );
  end loop;
end $$;
