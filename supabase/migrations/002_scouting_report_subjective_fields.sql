-- Campos subjetivos estructurados para la ficha de jugador React.
-- Ejecutar una vez en Supabase SQL Editor y despues relanzar:
--   .venv/bin/python scripts/sync_scouting_reports_to_supabase.py --apply

alter table public.scouting_reports
    add column if not exists birth_year integer,
    add column if not exists birth_place text,
    add column if not exists nationality text,
    add column if not exists foot text,
    add column if not exists secondary_position text,
    add column if not exists contract_until date,
    add column if not exists agency text,
    add column if not exists contract_status text,
    add column if not exists matchday integer,
    add column if not exists watched_match text,
    add column if not exists viewing_type text,
    add column if not exists positive_aspects text,
    add column if not exists negative_aspects text,
    add column if not exists times_seen_same_scout integer;
