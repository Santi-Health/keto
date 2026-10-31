-- Readings sync: one table for finger-stick glucose, blood ketones, urine strips,
-- weight, lab results and water, with soft deletes and a server-set updated_at.
-- Weight is stored in kg; lab results keep their own unit; water is in oz.

alter table public.readings drop constraint if exists readings_kind_check;
alter table public.readings add constraint readings_kind_check
  check (kind in ('glucose', 'blood_ketone', 'urine_ketone', 'weight', 'lab', 'water'));

alter table public.readings
  add column unit text,
  add column meta jsonb not null default '{}',
  add column updated_at timestamptz not null default now(),
  add column deleted_at timestamptz;

create trigger readings_set_updated_at before insert or update on public.readings
  for each row execute function public.set_updated_at();

create index readings_user_updated on public.readings (user_id, updated_at);
