-- Wyscout objective data for 1RFEF/2RFEF.
-- Ejecutar en Supabase SQL Editor antes de lanzar:
--   .venv/bin/python scripts/sync_objective_players_to_supabase.py --apply

create table if not exists public.objective_players (
    id uuid primary key default gen_random_uuid(),
    season_id uuid references public.seasons(id) on delete set null,
    objective_dataset text not null,
    source_player_id text not null,
    name text,
    full_name text,
    normalized_full_name text,
    birth_year integer,
    birth_date date,
    birth_country_name text,
    passport_country_names text,
    image text,
    current_team_name text,
    normalized_current_team_name text,
    domestic_competition_name text,
    current_team_logo text,
    current_team_color text,
    last_club_name text,
    normalized_last_club_name text,
    contract_expires date,
    market_value numeric,
    on_loan boolean,
    positions text,
    primary_position text,
    primary_position_label text,
    secondary_position text,
    secondary_position_label text,
    third_position text,
    third_position_label text,
    foot text,
    height numeric,
    weight numeric,
    metrics jsonb not null default '{}'::jsonb,
    raw_data jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (season_id, objective_dataset, source_player_id)
);

create table if not exists public.objective_player_matches (
    id uuid primary key default gen_random_uuid(),
    season_id uuid references public.seasons(id) on delete set null,
    objective_player_id uuid references public.objective_players(id) on delete cascade,
    objective_dataset text not null,
    scouting_player_name text,
    normalized_scouting_player_name text,
    scouting_birth_year integer,
    scouting_team text,
    objective_full_name text,
    objective_birth_year integer,
    objective_team text,
    objective_last_club text,
    name_similarity numeric,
    team_similarity numeric,
    birth_year_match numeric,
    match_score numeric,
    match_status text not null default 'sin_match'
        check (match_status in ('seguro', 'probable', 'dudoso', 'sin_match')),
    raw_data jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (season_id, objective_dataset, objective_player_id, normalized_scouting_player_name)
);

create index if not exists idx_objective_players_lookup
    on public.objective_players (season_id, objective_dataset, source_player_id);

create index if not exists idx_objective_players_name
    on public.objective_players (season_id, normalized_full_name);

create index if not exists idx_objective_players_team
    on public.objective_players (season_id, normalized_current_team_name);

create index if not exists idx_objective_matches_subjective
    on public.objective_player_matches (season_id, normalized_scouting_player_name, match_status);

create index if not exists idx_objective_matches_player
    on public.objective_player_matches (season_id, objective_player_id);

alter table public.objective_players enable row level security;
alter table public.objective_player_matches enable row level security;

grant select on public.objective_players to authenticated;
grant select on public.objective_player_matches to authenticated;
grant insert, update, delete on public.objective_players to authenticated;
grant insert, update, delete on public.objective_player_matches to authenticated;

drop policy if exists "objective_players_read_active_users" on public.objective_players;
create policy "objective_players_read_active_users"
on public.objective_players
for select
to authenticated
using (public.is_active_profile());

drop policy if exists "objective_matches_read_active_users" on public.objective_player_matches;
create policy "objective_matches_read_active_users"
on public.objective_player_matches
for select
to authenticated
using (public.is_active_profile());

drop policy if exists "objective_players_manage_staff" on public.objective_players;
create policy "objective_players_manage_staff"
on public.objective_players
for all
to authenticated
using (public.can_manage_data())
with check (public.can_manage_data());

drop policy if exists "objective_matches_manage_staff" on public.objective_player_matches;
create policy "objective_matches_manage_staff"
on public.objective_player_matches
for all
to authenticated
using (public.can_manage_data())
with check (public.can_manage_data());
