-- Crea la temporada nueva y conserva 2025/26 como histórico consultable.
insert into public.seasons (label, starts_on, ends_on, active)
values ('2026/27', '2026-07-01', '2027-06-30', true)
on conflict (label) do update
set
    starts_on = excluded.starts_on,
    ends_on = excluded.ends_on,
    active = excluded.active,
    updated_at = now();

update public.seasons
set active = false, updated_at = now()
where label = '2025/26';
