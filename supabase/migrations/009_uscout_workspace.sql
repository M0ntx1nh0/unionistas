-- UScout: espacio privado de shortlist y equipo ideal por usuario y temporada.

create table if not exists public.uscout_shortlists (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons(id) on delete cascade,
  owner_id uuid not null references public.profiles(id),
  name text not null default 'Shortlist principal',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (season_id, owner_id, name)
);

create table if not exists public.uscout_shortlist_players (
  id uuid primary key default gen_random_uuid(),
  shortlist_id uuid not null references public.uscout_shortlists(id) on delete cascade,
  player_id uuid references public.players(id) on delete set null,
  source_kind text not null default 'database'
    check (source_kind in ('database', 'manual')),
  player_name text not null,
  normalized_player_name text not null,
  birth_year integer,
  team_name text,
  position text,
  competition text,
  verdict text,
  reports_count integer not null default 0 check (reports_count >= 0),
  priority text not null default 'media'
    check (priority in ('baja', 'media', 'alta')),
  status text not null default 'pendiente'
    check (status in ('pendiente', 'proximo', 'visto', 'descartado')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uq_uscout_shortlist_player_identity
  on public.uscout_shortlist_players (
    shortlist_id,
    normalized_player_name,
    coalesce(birth_year, 0)
  );

create index if not exists idx_uscout_shortlist_players_shortlist
  on public.uscout_shortlist_players (shortlist_id, priority, status, updated_at desc);

create table if not exists public.uscout_boards (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons(id) on delete cascade,
  owner_id uuid not null references public.profiles(id),
  name text not null default 'Mejor XI',
  formation text not null default '4-3-3',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (season_id, owner_id, name)
);

create table if not exists public.uscout_board_slots (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.uscout_boards(id) on delete cascade,
  slot_key text not null,
  shortlist_player_id uuid references public.uscout_shortlist_players(id) on delete set null,
  player_id uuid references public.players(id) on delete set null,
  player_name text not null,
  normalized_player_name text not null,
  birth_year integer,
  team_name text,
  position text,
  source_kind text not null default 'database'
    check (source_kind in ('database', 'manual')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (board_id, slot_key)
);

create unique index if not exists uq_uscout_board_player_identity
  on public.uscout_board_slots (
    board_id,
    normalized_player_name,
    coalesce(birth_year, 0)
  );

create index if not exists idx_uscout_shortlists_owner
  on public.uscout_shortlists (season_id, owner_id);

create index if not exists idx_uscout_boards_owner
  on public.uscout_boards (season_id, owner_id);

alter table public.uscout_shortlists enable row level security;
alter table public.uscout_shortlist_players enable row level security;
alter table public.uscout_boards enable row level security;
alter table public.uscout_board_slots enable row level security;

grant select, insert, update, delete on public.uscout_shortlists to authenticated;
grant select, insert, update, delete on public.uscout_shortlist_players to authenticated;
grant select, insert, update, delete on public.uscout_boards to authenticated;
grant select, insert, update, delete on public.uscout_board_slots to authenticated;

drop policy if exists "uscout_shortlists_read_owner_or_staff" on public.uscout_shortlists;
create policy "uscout_shortlists_read_owner_or_staff"
on public.uscout_shortlists for select to authenticated
using (
  public.is_active_profile()
  and (owner_id = auth.uid() or public.can_manage_data())
);

drop policy if exists "uscout_shortlists_insert_owner_or_admin" on public.uscout_shortlists;
create policy "uscout_shortlists_insert_owner_or_admin"
on public.uscout_shortlists for insert to authenticated
with check (
  public.is_active_profile()
  and (owner_id = auth.uid() or public.current_profile_role() = 'admin')
);

drop policy if exists "uscout_shortlists_update_owner_or_admin" on public.uscout_shortlists;
create policy "uscout_shortlists_update_owner_or_admin"
on public.uscout_shortlists for update to authenticated
using (owner_id = auth.uid() or public.current_profile_role() = 'admin')
with check (owner_id = auth.uid() or public.current_profile_role() = 'admin');

drop policy if exists "uscout_shortlists_delete_owner_or_admin" on public.uscout_shortlists;
create policy "uscout_shortlists_delete_owner_or_admin"
on public.uscout_shortlists for delete to authenticated
using (owner_id = auth.uid() or public.current_profile_role() = 'admin');

drop policy if exists "uscout_shortlist_players_read_owner_or_staff" on public.uscout_shortlist_players;
create policy "uscout_shortlist_players_read_owner_or_staff"
on public.uscout_shortlist_players for select to authenticated
using (
  exists (
    select 1 from public.uscout_shortlists shortlist
    where shortlist.id = shortlist_id
      and (shortlist.owner_id = auth.uid() or public.can_manage_data())
  )
);

drop policy if exists "uscout_shortlist_players_manage_owner_or_admin" on public.uscout_shortlist_players;
create policy "uscout_shortlist_players_manage_owner_or_admin"
on public.uscout_shortlist_players for all to authenticated
using (
  exists (
    select 1 from public.uscout_shortlists shortlist
    where shortlist.id = shortlist_id
      and (shortlist.owner_id = auth.uid() or public.current_profile_role() = 'admin')
  )
)
with check (
  exists (
    select 1 from public.uscout_shortlists shortlist
    where shortlist.id = shortlist_id
      and (shortlist.owner_id = auth.uid() or public.current_profile_role() = 'admin')
  )
);

drop policy if exists "uscout_boards_read_owner_or_staff" on public.uscout_boards;
create policy "uscout_boards_read_owner_or_staff"
on public.uscout_boards for select to authenticated
using (
  public.is_active_profile()
  and (owner_id = auth.uid() or public.can_manage_data())
);

drop policy if exists "uscout_boards_insert_owner_or_admin" on public.uscout_boards;
create policy "uscout_boards_insert_owner_or_admin"
on public.uscout_boards for insert to authenticated
with check (
  public.is_active_profile()
  and (owner_id = auth.uid() or public.current_profile_role() = 'admin')
);

drop policy if exists "uscout_boards_update_owner_or_admin" on public.uscout_boards;
create policy "uscout_boards_update_owner_or_admin"
on public.uscout_boards for update to authenticated
using (owner_id = auth.uid() or public.current_profile_role() = 'admin')
with check (owner_id = auth.uid() or public.current_profile_role() = 'admin');

drop policy if exists "uscout_boards_delete_owner_or_admin" on public.uscout_boards;
create policy "uscout_boards_delete_owner_or_admin"
on public.uscout_boards for delete to authenticated
using (owner_id = auth.uid() or public.current_profile_role() = 'admin');

drop policy if exists "uscout_board_slots_read_owner_or_staff" on public.uscout_board_slots;
create policy "uscout_board_slots_read_owner_or_staff"
on public.uscout_board_slots for select to authenticated
using (
  exists (
    select 1 from public.uscout_boards board
    where board.id = board_id
      and (board.owner_id = auth.uid() or public.can_manage_data())
  )
);

drop policy if exists "uscout_board_slots_manage_owner_or_admin" on public.uscout_board_slots;
create policy "uscout_board_slots_manage_owner_or_admin"
on public.uscout_board_slots for all to authenticated
using (
  exists (
    select 1 from public.uscout_boards board
    where board.id = board_id
      and (board.owner_id = auth.uid() or public.current_profile_role() = 'admin')
  )
)
with check (
  exists (
    select 1 from public.uscout_boards board
    where board.id = board_id
      and (board.owner_id = auth.uid() or public.current_profile_role() = 'admin')
  )
);
