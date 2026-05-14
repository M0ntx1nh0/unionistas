alter table public.objective_players
    add column if not exists primary_profile text,
    add column if not exists secondary_profile text,
    add column if not exists profile_family text,
    add column if not exists profile_score_map jsonb not null default '{}'::jsonb;
