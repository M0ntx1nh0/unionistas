-- Unionistas Scouting Lab - Supabase schema v1
-- Objetivo: preparar una base limpia para migrar la app actual a React sin tocar Streamlit.
-- Fuentes actuales:
--   1) Google Sheet de informes subjetivos generales
--   2) Google Sheet de calendario
--   3) Google Sheet de campogramas
-- Wyscout/radares quedan para una fase posterior.

create extension if not exists "pgcrypto";

create table if not exists public.seasons (
    id uuid primary key default gen_random_uuid(),
    label text not null unique,
    starts_on date,
    ends_on date,
    active boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.profiles (
    id uuid primary key references auth.users(id) on delete cascade,
    email text not null unique,
    full_name text,
    scout_name text,
    role text not null default 'scout'
        check (role in ('admin', 'coordinator', 'scout', 'viewer')),
    active boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.teams (
    id uuid primary key default gen_random_uuid(),
    season_id uuid references public.seasons(id) on delete set null,
    name text not null,
    normalized_name text not null,
    competition text,
    group_name text,
    source_system text,
    source_team_id text,
    logo_url text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (season_id, normalized_name, competition, group_name)
);

create table if not exists public.players (
    id uuid primary key default gen_random_uuid(),
    canonical_name text not null,
    normalized_name text not null,
    birth_year integer,
    nationality text,
    primary_position text,
    secondary_position text,
    foot text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (normalized_name, birth_year)
);

create table if not exists public.scouting_reports (
    id uuid primary key default gen_random_uuid(),
    season_id uuid references public.seasons(id) on delete set null,
    player_id uuid references public.players(id) on delete set null,
    player_name text not null,
    normalized_player_name text not null,
    scout_name text,
    scout_email text,
    report_date timestamptz,
    team_name text,
    normalized_team_name text,
    competition text,
    group_name text,
    position text,
    verdict text,
    birth_year integer,
    birth_place text,
    nationality text,
    foot text,
    secondary_position text,
    contract_until date,
    agency text,
    contract_status text,
    matchday integer,
    watched_match text,
    viewing_type text,
    positive_aspects text,
    negative_aspects text,
    times_seen_same_scout integer,
    rating_technical text,
    rating_physical text,
    rating_psychological text,
    comments text,
    source_system text not null default 'google_sheets_subjective',
    source_spreadsheet_id text,
    source_worksheet_name text,
    source_row_id text,
    raw_data jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (season_id, source_system, source_row_id)
);

create table if not exists public.calendar_matches (
    id uuid primary key default gen_random_uuid(),
    season_id uuid references public.seasons(id) on delete set null,
    competition text not null,
    group_name text,
    matchday integer,
    source_event_id text,
    match_date date,
    kickoff_time time,
    home_team_name text not null,
    away_team_name text not null,
    normalized_home_team_name text,
    normalized_away_team_name text,
    home_team_id text,
    away_team_id text,
    status text,
    status_code integer,
    venue text,
    city text,
    slug text,
    source_system text not null default 'sofascore',
    source_updated_at timestamptz,
    raw_data jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (season_id, source_system, source_event_id)
);

create table if not exists public.campograms (
    id uuid primary key default gen_random_uuid(),
    season_id uuid references public.seasons(id) on delete set null,
    name text not null,
    normalized_name text not null,
    display_order integer not null default 0,
    active boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (season_id, normalized_name)
);

create table if not exists public.campogram_players (
    id uuid primary key default gen_random_uuid(),
    season_id uuid references public.seasons(id) on delete set null,
    campogram_id uuid references public.campograms(id) on delete cascade,
    player_id uuid references public.players(id) on delete set null,
    player_name text not null,
    normalized_player_name text not null,
    team_name text,
    normalized_team_name text,
    loaned boolean,
    owner_team_name text,
    normalized_owner_team_name text,
    category text,
    birth_year integer,
    position text,
    agent text,
    foot text,
    source_system text not null default 'google_sheets_campogram_base',
    source_spreadsheet_id text,
    source_worksheet_name text,
    source_row_id text,
    raw_data jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (campogram_id, source_system, source_row_id)
);

create table if not exists public.campogram_reports (
    id uuid primary key default gen_random_uuid(),
    season_id uuid references public.seasons(id) on delete set null,
    campogram_id uuid references public.campograms(id) on delete set null,
    campogram_player_id uuid references public.campogram_players(id) on delete set null,
    player_id uuid references public.players(id) on delete set null,
    player_name text not null,
    normalized_player_name text not null,
    scout_name text,
    scout_email text,
    report_date timestamptz,
    team_name text,
    normalized_team_name text,
    category text,
    loaned boolean,
    owner_team_name text,
    campogram_name text,
    normalized_campogram_name text,
    position text,
    verdict text,
    technical_comment text,
    physical_comment text,
    psychological_comment text,
    source_system text not null default 'google_sheets_campogram_responses',
    source_spreadsheet_id text,
    source_worksheet_name text,
    source_row_id text,
    raw_data jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (season_id, source_system, source_row_id)
);

create table if not exists public.team_name_map (
    id uuid primary key default gen_random_uuid(),
    season_id uuid references public.seasons(id) on delete set null,
    source_team_name text not null,
    normalized_source_team_name text not null,
    canonical_team_name text not null,
    normalized_canonical_team_name text not null,
    competition text,
    group_name text,
    source_system text,
    team_id uuid references public.teams(id) on delete set null,
    notes text,
    active boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (season_id, competition, source_system, normalized_source_team_name)
);

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

create table if not exists public.audit_log (
    id uuid primary key default gen_random_uuid(),
    actor_id uuid references auth.users(id) on delete set null,
    actor_email text,
    action text not null,
    table_name text not null,
    record_id uuid,
    before_data jsonb,
    after_data jsonb,
    created_at timestamptz not null default now()
);

create index if not exists idx_profiles_role
    on public.profiles (role, active);

create index if not exists idx_teams_lookup
    on public.teams (season_id, competition, group_name, normalized_name);

create index if not exists idx_players_normalized
    on public.players (normalized_name);

create index if not exists idx_scouting_reports_player
    on public.scouting_reports (season_id, normalized_player_name);

create index if not exists idx_scouting_reports_scout
    on public.scouting_reports (season_id, scout_name);

create index if not exists idx_scouting_reports_team
    on public.scouting_reports (season_id, normalized_team_name);

create index if not exists idx_calendar_matchday
    on public.calendar_matches (season_id, competition, group_name, matchday);

create index if not exists idx_calendar_teams
    on public.calendar_matches (season_id, normalized_home_team_name, normalized_away_team_name);

create index if not exists idx_campograms_lookup
    on public.campograms (season_id, normalized_name);

create index if not exists idx_campogram_players_campogram
    on public.campogram_players (campogram_id, position);

create index if not exists idx_campogram_players_player
    on public.campogram_players (season_id, normalized_player_name);

create index if not exists idx_campogram_reports_player
    on public.campogram_reports (season_id, normalized_player_name);

create index if not exists idx_campogram_reports_campogram
    on public.campogram_reports (season_id, normalized_campogram_name);

create index if not exists idx_team_name_map_lookup
    on public.team_name_map (season_id, competition, source_system, normalized_source_team_name);

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

create index if not exists idx_audit_log_record
    on public.audit_log (table_name, record_id, created_at desc);

-- Activamos RLS desde el principio para no construir React sobre tablas abiertas.
-- Las políticas concretas las añadiremos en el siguiente paso, cuando cerremos
-- qué puede ver/modificar cada rol.
alter table public.seasons enable row level security;
alter table public.profiles enable row level security;
alter table public.teams enable row level security;
alter table public.players enable row level security;
alter table public.scouting_reports enable row level security;
alter table public.calendar_matches enable row level security;
alter table public.campograms enable row level security;
alter table public.campogram_players enable row level security;
alter table public.campogram_reports enable row level security;
alter table public.team_name_map enable row level security;
alter table public.objective_players enable row level security;
alter table public.objective_player_matches enable row level security;
alter table public.audit_log enable row level security;
