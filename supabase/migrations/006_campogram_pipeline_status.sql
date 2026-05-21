alter table public.campogram_players
  add column if not exists pipeline_status text not null default 'lista'
    check (pipeline_status in ('lista', 'tocado', 'ofrecido', 'rechazado')),
  add column if not exists pipeline_status_changed_at timestamptz,
  add column if not exists pipeline_status_changed_by uuid references public.profiles(id) on delete set null;

create table if not exists public.campogram_player_pipeline_events (
  id uuid primary key default gen_random_uuid(),
  campogram_player_id uuid not null references public.campogram_players(id) on delete cascade,
  previous_status text not null
    check (previous_status in ('lista', 'tocado', 'ofrecido', 'rechazado')),
  new_status text not null
    check (new_status in ('lista', 'tocado', 'ofrecido', 'rechazado')),
  changed_at timestamptz not null default now(),
  changed_by uuid references public.profiles(id) on delete set null,
  reverted_at timestamptz,
  reverted_by uuid references public.profiles(id) on delete set null
);

create index if not exists idx_campogram_players_pipeline
  on public.campogram_players (pipeline_status, pipeline_status_changed_at desc);

create index if not exists idx_campogram_pipeline_events_player
  on public.campogram_player_pipeline_events (campogram_player_id, changed_at desc);

alter table public.campogram_player_pipeline_events enable row level security;

create or replace function public.set_campogram_player_pipeline_status(
  target_player_id uuid,
  next_status text
)
returns table (
  pipeline_status text,
  pipeline_status_changed_at timestamptz,
  pipeline_status_changed_by uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_player public.campogram_players%rowtype;
  latest_event public.campogram_player_pipeline_events%rowtype;
  normalized_next_status text;
  now_ts timestamptz := now();
begin
  if not public.can_manage_data() then
    raise exception 'forbidden';
  end if;

  normalized_next_status := lower(trim(coalesce(next_status, '')));
  if normalized_next_status not in ('lista', 'tocado', 'ofrecido', 'rechazado') then
    raise exception 'invalid_pipeline_status';
  end if;

  select *
  into current_player
  from public.campogram_players
  where id = target_player_id
  for update;

  if not found then
    raise exception 'campogram_player_not_found';
  end if;

  current_player.pipeline_status := coalesce(current_player.pipeline_status, 'lista');

  if current_player.pipeline_status = normalized_next_status then
    return query
    select
      current_player.pipeline_status,
      current_player.pipeline_status_changed_at,
      current_player.pipeline_status_changed_by;
    return;
  end if;

  if normalized_next_status = 'lista'
     and current_player.pipeline_status <> 'lista'
     and current_player.pipeline_status_changed_at is not null
     and now_ts - current_player.pipeline_status_changed_at < interval '1 hour' then
    select *
    into latest_event
    from public.campogram_player_pipeline_events
    where campogram_player_id = target_player_id
      and reverted_at is null
    order by changed_at desc
    limit 1;

    if found
       and latest_event.previous_status = 'lista'
       and latest_event.new_status = current_player.pipeline_status then
      update public.campogram_player_pipeline_events
      set reverted_at = now_ts,
          reverted_by = auth.uid()
      where id = latest_event.id;

      update public.campogram_players
      set pipeline_status = 'lista',
          pipeline_status_changed_at = null,
          pipeline_status_changed_by = null,
          updated_at = now_ts
      where id = target_player_id;

      return query
      select
        'lista'::text,
        null::timestamptz,
        null::uuid;
      return;
    end if;
  end if;

  insert into public.campogram_player_pipeline_events (
    campogram_player_id,
    previous_status,
    new_status,
    changed_at,
    changed_by
  ) values (
    target_player_id,
    current_player.pipeline_status,
    normalized_next_status,
    now_ts,
    auth.uid()
  );

  update public.campogram_players
  set pipeline_status = normalized_next_status,
      pipeline_status_changed_at = now_ts,
      pipeline_status_changed_by = auth.uid(),
      updated_at = now_ts
  where id = target_player_id;

  return query
  select
    normalized_next_status,
    now_ts,
    auth.uid();
end;
$$;

grant execute on function public.set_campogram_player_pipeline_status(uuid, text) to authenticated;

grant select on public.campogram_player_pipeline_events to authenticated;
grant insert, update, delete on public.campogram_player_pipeline_events to authenticated;

drop policy if exists "campogram_pipeline_events_read_staff" on public.campogram_player_pipeline_events;
create policy "campogram_pipeline_events_read_staff"
on public.campogram_player_pipeline_events
for select
to authenticated
using (public.can_manage_data());

drop policy if exists "campogram_pipeline_events_manage_staff" on public.campogram_player_pipeline_events;
create policy "campogram_pipeline_events_manage_staff"
on public.campogram_player_pipeline_events
for all
to authenticated
using (public.can_manage_data())
with check (public.can_manage_data());
