-- Registra la trazabilidad de las relaciones operativas ya consolidadas.
-- No modifica informes, comentarios, campogramas ni datos Wyscout.
-- Requiere haber ejecutado 010_player_identity_foundation.sql.

begin;

-- Conservamos evidencia de cada relacion que ya tiene player_id.
insert into public.player_identity_links (
  player_id,
  source_table,
  source_record_id,
  match_method,
  confidence
)
select
  report.player_id,
  'scouting_reports',
  report.id,
  'normalized_name_birth_year',
  1
from public.scouting_reports report
where report.player_id is not null
on conflict (source_table, source_record_id) do nothing;

insert into public.player_identity_links (
  player_id,
  source_table,
  source_record_id,
  match_method,
  confidence
)
select
  campogram_player.player_id,
  'campogram_players',
  campogram_player.id,
  'normalized_name_birth_year',
  1
from public.campogram_players campogram_player
where campogram_player.player_id is not null
on conflict (source_table, source_record_id) do nothing;

insert into public.player_identity_links (
  player_id,
  source_table,
  source_record_id,
  match_method,
  confidence
)
select
  shortlist_player.player_id,
  'uscout_shortlist_players',
  shortlist_player.id,
  'normalized_name_birth_year',
  1
from public.uscout_shortlist_players shortlist_player
where shortlist_player.player_id is not null
on conflict (source_table, source_record_id) do nothing;

insert into public.player_identity_links (
  player_id,
  source_table,
  source_record_id,
  match_method,
  confidence
)
select
  board_slot.player_id,
  'uscout_board_slots',
  board_slot.id,
  'normalized_name_birth_year',
  1
from public.uscout_board_slots board_slot
where board_slot.player_id is not null
on conflict (source_table, source_record_id) do nothing;

-- Consolidamos una sola fila por jugador y temporada. Los datos originales
-- siguen siendo la fuente de verdad y no se alteran.
with season_candidates as (
  select
    report.player_id,
    report.season_id,
    report.team_name,
    report.normalized_team_name,
    report.competition,
    report.group_name,
    report.position as primary_position,
    report.secondary_position,
    report.agency,
    null::boolean as loaned,
    null::text as owner_team_name,
    report.contract_until,
    1 as source_priority,
    report.report_date::timestamptz as observed_at
  from public.scouting_reports report
  where report.player_id is not null
    and report.season_id is not null

  union all

  select
    campogram_player.player_id,
    campogram_player.season_id,
    campogram_player.team_name,
    campogram_player.normalized_team_name,
    campogram_player.category,
    null,
    campogram_player.position,
    null,
    campogram_player.agent,
    campogram_player.loaned,
    campogram_player.owner_team_name,
    null::date,
    2,
    campogram_player.updated_at
  from public.campogram_players campogram_player
  where campogram_player.player_id is not null
    and campogram_player.season_id is not null
), preferred_season as (
  select distinct on (player_id, season_id)
    player_id,
    season_id,
    team_name,
    normalized_team_name,
    competition,
    group_name,
    primary_position,
    secondary_position,
    agency,
    loaned,
    owner_team_name,
    contract_until
  from season_candidates
  order by
    player_id,
    season_id,
    source_priority,
    observed_at desc nulls last
)
insert into public.player_seasons (
  player_id,
  season_id,
  team_name,
  normalized_team_name,
  competition,
  group_name,
  primary_position,
  secondary_position,
  agency,
  loaned,
  owner_team_name,
  contract_until
)
select
  player_id,
  season_id,
  team_name,
  normalized_team_name,
  competition,
  group_name,
  primary_position,
  secondary_position,
  agency,
  loaned,
  owner_team_name,
  contract_until
from preferred_season
on conflict (player_id, season_id) do nothing;

commit;

-- Resultado de control. No depende de tablas temporales.
select
  (select count(*) from public.players) as players,
  (select count(*) from public.player_seasons) as player_seasons,
  (select count(*) from public.scouting_reports) as reports_total,
  (select count(*) from public.scouting_reports where player_id is not null) as reports_linked,
  (select count(*) from public.scouting_reports where player_id is null) as reports_pending,
  (select count(*) from public.campogram_players) as campogram_players_total,
  (select count(*) from public.campogram_players where player_id is not null) as campogram_players_linked,
  (select count(*) from public.player_identity_links) as identity_links;
