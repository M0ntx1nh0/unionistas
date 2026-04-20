-- Plantilla para crear el primer perfil admin.
-- 1) Crear primero el usuario en Supabase Auth.
-- 2) Copiar su UUID desde Authentication > Users.
-- 3) Sustituir los valores marcados y ejecutar este SQL.

insert into public.profiles (
    id,
    email,
    full_name,
    scout_name,
    role,
    active
)
values (
    'PEGA_AQUI_EL_UUID_DEL_USUARIO',
    'tu_email@dominio.com',
    'Nombre completo',
    'Nombre scout',
    'admin',
    true
)
on conflict (id) do update set
    email = excluded.email,
    full_name = excluded.full_name,
    scout_name = excluded.scout_name,
    role = excluded.role,
    active = excluded.active,
    updated_at = now();
