alter table public.campogram_players
  drop constraint if exists campogram_players_pipeline_status_check;

alter table public.campogram_players
  add constraint campogram_players_pipeline_status_check
  check (pipeline_status in ('lista', 'tocado', 'ofrecido', 'rechazado', 'fichado'));

alter table public.campogram_player_pipeline_events
  drop constraint if exists campogram_player_pipeline_events_previous_status_check;

alter table public.campogram_player_pipeline_events
  add constraint campogram_player_pipeline_events_previous_status_check
  check (previous_status in ('lista', 'tocado', 'ofrecido', 'rechazado', 'fichado'));

alter table public.campogram_player_pipeline_events
  drop constraint if exists campogram_player_pipeline_events_new_status_check;

alter table public.campogram_player_pipeline_events
  add constraint campogram_player_pipeline_events_new_status_check
  check (new_status in ('lista', 'tocado', 'ofrecido', 'rechazado', 'fichado'));

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
  if normalized_next_status not in ('lista', 'tocado', 'ofrecido', 'rechazado', 'fichado') then
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
