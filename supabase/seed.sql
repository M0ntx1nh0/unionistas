-- Datos base opcionales para desarrollo.
-- Ejecutar despues de schema.sql si se quiere crear la temporada inicial.

insert into public.seasons (label, starts_on, ends_on, active)
values ('2025/26', '2025-07-01', '2026-06-30', false)
on conflict (label) do nothing;

insert into public.seasons (label, starts_on, ends_on, active)
values ('2026/27', '2026-07-01', '2027-06-30', true)
on conflict (label) do nothing;
