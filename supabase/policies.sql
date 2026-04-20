-- Unionistas Scouting Lab - RLS policies v1
-- Ejecutar despues de schema.sql y seed.sql.
--
-- Modelo:
--   - anon: no lee tablas de negocio.
--   - authenticated activo: puede leer datos operativos generales.
--   - scout: solo lee sus propios informes.
--   - viewer: puede leer informes, no escribir.
--   - coordinator/admin: puede leer y modificar datos de negocio.
--   - service_role: usado por scripts locales, bypass de RLS.

create or replace function public.current_profile_role()
returns text
language sql
security definer
set search_path = public
stable
as $$
    select role
    from public.profiles
    where id = auth.uid()
      and active = true
    limit 1
$$;

create or replace function public.current_profile_scout_name()
returns text
language sql
security definer
set search_path = public
stable
as $$
    select scout_name
    from public.profiles
    where id = auth.uid()
      and active = true
    limit 1
$$;

create or replace function public.is_active_profile()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
    select exists (
        select 1
        from public.profiles
        where id = auth.uid()
          and active = true
    )
$$;

create or replace function public.can_manage_data()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
    select coalesce(public.current_profile_role(), '') in ('admin', 'coordinator')
$$;

create or replace function public.can_read_all_reports()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
    select coalesce(public.current_profile_role(), '') in ('admin', 'coordinator', 'viewer')
$$;

create or replace function public.is_own_scout_record(record_scout_email text, record_scout_name text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
    select public.is_active_profile()
       and (
            lower(coalesce(record_scout_email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
            or lower(coalesce(record_scout_name, '')) = lower(coalesce(public.current_profile_scout_name(), ''))
       )
$$;

grant execute on function public.current_profile_role() to authenticated;
grant execute on function public.current_profile_scout_name() to authenticated;
grant execute on function public.is_active_profile() to authenticated;
grant execute on function public.can_manage_data() to authenticated;
grant execute on function public.can_read_all_reports() to authenticated;
grant execute on function public.is_own_scout_record(text, text) to authenticated;

grant usage on schema public to authenticated;
grant select on public.seasons to authenticated;
grant select on public.profiles to authenticated;
grant select on public.teams to authenticated;
grant select on public.players to authenticated;
grant select on public.calendar_matches to authenticated;
grant select on public.campograms to authenticated;
grant select on public.campogram_players to authenticated;
grant select on public.scouting_reports to authenticated;
grant select on public.campogram_reports to authenticated;
grant select on public.team_name_map to authenticated;
grant select on public.objective_players to authenticated;
grant select on public.objective_player_matches to authenticated;

grant insert, update, delete on public.seasons to authenticated;
grant insert, update, delete on public.profiles to authenticated;
grant insert, update, delete on public.teams to authenticated;
grant insert, update, delete on public.players to authenticated;
grant insert, update, delete on public.calendar_matches to authenticated;
grant insert, update, delete on public.campograms to authenticated;
grant insert, update, delete on public.campogram_players to authenticated;
grant insert, update, delete on public.scouting_reports to authenticated;
grant insert, update, delete on public.campogram_reports to authenticated;
grant insert, update, delete on public.team_name_map to authenticated;
grant insert, update, delete on public.objective_players to authenticated;
grant insert, update, delete on public.objective_player_matches to authenticated;

-- profiles
drop policy if exists "profiles_select_own_or_staff" on public.profiles;
create policy "profiles_select_own_or_staff"
on public.profiles
for select
to authenticated
using (
    id = auth.uid()
    or public.can_manage_data()
);

drop policy if exists "profiles_manage_staff" on public.profiles;
create policy "profiles_manage_staff"
on public.profiles
for all
to authenticated
using (public.can_manage_data())
with check (public.can_manage_data());

-- Tablas operativas legibles para usuarios activos.
drop policy if exists "seasons_read_active_users" on public.seasons;
create policy "seasons_read_active_users"
on public.seasons
for select
to authenticated
using (public.is_active_profile());

drop policy if exists "teams_read_active_users" on public.teams;
create policy "teams_read_active_users"
on public.teams
for select
to authenticated
using (public.is_active_profile());

drop policy if exists "players_read_active_users" on public.players;
create policy "players_read_active_users"
on public.players
for select
to authenticated
using (public.is_active_profile());

drop policy if exists "calendar_read_active_users" on public.calendar_matches;
create policy "calendar_read_active_users"
on public.calendar_matches
for select
to authenticated
using (public.is_active_profile());

drop policy if exists "campograms_read_active_users" on public.campograms;
create policy "campograms_read_active_users"
on public.campograms
for select
to authenticated
using (public.is_active_profile());

drop policy if exists "campogram_players_read_active_users" on public.campogram_players;
create policy "campogram_players_read_active_users"
on public.campogram_players
for select
to authenticated
using (public.is_active_profile());

drop policy if exists "team_name_map_read_active_users" on public.team_name_map;
create policy "team_name_map_read_active_users"
on public.team_name_map
for select
to authenticated
using (public.is_active_profile());

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

-- Informes: staff/viewer ven todo; scout solo sus propios registros.
drop policy if exists "scouting_reports_read_by_role" on public.scouting_reports;
create policy "scouting_reports_read_by_role"
on public.scouting_reports
for select
to authenticated
using (
    public.can_read_all_reports()
    or public.is_own_scout_record(scout_email, scout_name)
);

drop policy if exists "campogram_reports_read_by_role" on public.campogram_reports;
create policy "campogram_reports_read_by_role"
on public.campogram_reports
for select
to authenticated
using (
    public.can_read_all_reports()
    or public.is_own_scout_record(scout_email, scout_name)
);

-- Escritura de datos de negocio solo para admin/coordinator desde frontend.
drop policy if exists "seasons_manage_staff" on public.seasons;
create policy "seasons_manage_staff"
on public.seasons
for all
to authenticated
using (public.can_manage_data())
with check (public.can_manage_data());

drop policy if exists "teams_manage_staff" on public.teams;
create policy "teams_manage_staff"
on public.teams
for all
to authenticated
using (public.can_manage_data())
with check (public.can_manage_data());

drop policy if exists "players_manage_staff" on public.players;
create policy "players_manage_staff"
on public.players
for all
to authenticated
using (public.can_manage_data())
with check (public.can_manage_data());

drop policy if exists "calendar_manage_staff" on public.calendar_matches;
create policy "calendar_manage_staff"
on public.calendar_matches
for all
to authenticated
using (public.can_manage_data())
with check (public.can_manage_data());

drop policy if exists "campograms_manage_staff" on public.campograms;
create policy "campograms_manage_staff"
on public.campograms
for all
to authenticated
using (public.can_manage_data())
with check (public.can_manage_data());

drop policy if exists "campogram_players_manage_staff" on public.campogram_players;
create policy "campogram_players_manage_staff"
on public.campogram_players
for all
to authenticated
using (public.can_manage_data())
with check (public.can_manage_data());

drop policy if exists "scouting_reports_manage_staff" on public.scouting_reports;
create policy "scouting_reports_manage_staff"
on public.scouting_reports
for all
to authenticated
using (public.can_manage_data())
with check (public.can_manage_data());

drop policy if exists "campogram_reports_manage_staff" on public.campogram_reports;
create policy "campogram_reports_manage_staff"
on public.campogram_reports
for all
to authenticated
using (public.can_manage_data())
with check (public.can_manage_data());

drop policy if exists "team_name_map_manage_staff" on public.team_name_map;
create policy "team_name_map_manage_staff"
on public.team_name_map
for all
to authenticated
using (public.can_manage_data())
with check (public.can_manage_data());

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

-- audit_log: staff puede leer; escritura normalmente por service_role o procesos controlados.
drop policy if exists "audit_log_read_staff" on public.audit_log;
create policy "audit_log_read_staff"
on public.audit_log
for select
to authenticated
using (public.can_manage_data());

drop policy if exists "audit_log_insert_staff" on public.audit_log;
create policy "audit_log_insert_staff"
on public.audit_log
for insert
to authenticated
with check (public.can_manage_data());
