-- Registro visible de la ultima sincronizacion correcta por fuente y temporada.
-- No modifica informes, jugadores ni datos historicos existentes.

create table if not exists public.data_sync_runs (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons(id) on delete cascade,
  source_name text not null,
  last_successful_at timestamptz not null default now(),
  records_synced integer not null default 0 check (records_synced >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (season_id, source_name)
);

create index if not exists idx_data_sync_runs_season_source
  on public.data_sync_runs (season_id, source_name);

alter table public.data_sync_runs enable row level security;

grant select on public.data_sync_runs to authenticated;

drop policy if exists "data_sync_runs_read_active_users" on public.data_sync_runs;
create policy "data_sync_runs_read_active_users"
on public.data_sync_runs for select to authenticated
using (public.is_active_profile());
