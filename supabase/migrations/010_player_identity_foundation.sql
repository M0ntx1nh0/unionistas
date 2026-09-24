-- Base aditiva para una identidad estable de jugador.
-- Esta migracion no borra ni transforma datos existentes.

alter table public.objective_players
  add column if not exists player_id uuid references public.players(id) on delete set null;

alter table public.players
  add column if not exists identity_status text not null default 'canonical'
    check (identity_status in ('canonical', 'provisional', 'review')),
  add column if not exists merged_into_player_id uuid references public.players(id) on delete restrict;

create table if not exists public.player_seasons (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete restrict,
  season_id uuid not null references public.seasons(id) on delete restrict,
  team_id uuid references public.teams(id) on delete set null,
  team_name text,
  normalized_team_name text,
  competition text,
  group_name text,
  primary_position text,
  secondary_position text,
  agency text,
  loaned boolean,
  owner_team_name text,
  contract_until date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (player_id, season_id)
);

create table if not exists public.player_external_ids (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  source_system text not null,
  source_dataset text not null default '',
  source_player_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_system, source_dataset, source_player_id)
);

create table if not exists public.player_identity_links (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete restrict,
  source_table text not null check (
    source_table in (
      'scouting_reports',
      'campogram_players',
      'objective_players',
      'uscout_shortlist_players',
      'uscout_board_slots'
    )
  ),
  source_record_id uuid not null,
  match_method text not null check (
    match_method in (
      'normalized_name_birth_year',
      'wyscout_safe_match',
      'manual_review',
      'manual_provisional_merge'
    )
  ),
  confidence numeric check (confidence is null or (confidence >= 0 and confidence <= 1)),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (source_table, source_record_id)
);

create index if not exists idx_scouting_reports_player_id
  on public.scouting_reports (player_id);

create index if not exists idx_campogram_players_player_id
  on public.campogram_players (player_id);

create index if not exists idx_objective_players_player_id
  on public.objective_players (player_id);

create index if not exists idx_player_seasons_season
  on public.player_seasons (season_id, player_id);

create index if not exists idx_player_identity_links_player
  on public.player_identity_links (player_id, source_table);

alter table public.player_seasons enable row level security;
alter table public.player_external_ids enable row level security;
alter table public.player_identity_links enable row level security;

grant select on public.player_seasons to authenticated;
grant select on public.player_external_ids to authenticated;
grant select on public.player_identity_links to authenticated;

grant insert, update, delete on public.player_seasons to authenticated;
grant insert, update, delete on public.player_external_ids to authenticated;
grant insert, update, delete on public.player_identity_links to authenticated;

drop policy if exists "player_seasons_read_active_users" on public.player_seasons;
create policy "player_seasons_read_active_users"
on public.player_seasons for select to authenticated
using (public.is_active_profile());

drop policy if exists "player_external_ids_read_active_users" on public.player_external_ids;
create policy "player_external_ids_read_active_users"
on public.player_external_ids for select to authenticated
using (public.is_active_profile());

drop policy if exists "player_identity_links_read_staff" on public.player_identity_links;
create policy "player_identity_links_read_staff"
on public.player_identity_links for select to authenticated
using (public.can_manage_data());

drop policy if exists "player_seasons_manage_staff" on public.player_seasons;
create policy "player_seasons_manage_staff"
on public.player_seasons for all to authenticated
using (public.can_manage_data())
with check (public.can_manage_data());

drop policy if exists "player_external_ids_manage_staff" on public.player_external_ids;
create policy "player_external_ids_manage_staff"
on public.player_external_ids for all to authenticated
using (public.can_manage_data())
with check (public.can_manage_data());

drop policy if exists "player_identity_links_manage_staff" on public.player_identity_links;
create policy "player_identity_links_manage_staff"
on public.player_identity_links for all to authenticated
using (public.can_manage_data())
with check (public.can_manage_data());
