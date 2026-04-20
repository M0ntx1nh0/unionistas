# Supabase

Esta carpeta contiene el modelo de datos y futuras migraciones para la version React de Unionistas Scouting Lab.

## Archivos

- `schema.sql`: esquema inicial de tablas, indices y relaciones.
- `seed.sql`: datos base opcionales para desarrollo local.
- `policies.sql`: funciones y politicas RLS para controlar lectura/escritura por rol.
- `bootstrap_admin.sql`: plantilla para crear el primer perfil administrador.
- `migrations/`: futuras migraciones si usamos Supabase CLI.

## Orden de ejecucion en Supabase

1. Ejecutar `schema.sql`.
2. Ejecutar `seed.sql`.
3. Ejecutar `policies.sql`.
4. Crear el primer usuario en Supabase Auth.
5. Ejecutar `bootstrap_admin.sql` sustituyendo UUID, email y nombre.

## Migraciones ya creadas

- `migrations/002_scouting_report_subjective_fields.sql`: añade campos estructurados de la ficha subjetiva general, como año de nacimiento, nacionalidad, lateralidad, contrato, agencia, partido visionado y aspectos positivos/negativos. Ejecutar antes de relanzar `scripts/sync_scouting_reports_to_supabase.py --apply`.
- `migrations/003_objective_wyscout.sql`: crea las tablas de datos objetivos Wyscout y los cruces con jugadores subjetivos. Ejecutar antes de lanzar `scripts/sync_objective_players_to_supabase.py --apply`.

## Roles

- `admin`: lee y modifica datos de negocio.
- `coordinator`: lee y modifica datos de negocio.
- `viewer`: lee informes y datos operativos, no modifica.
- `scout`: lee datos operativos y solo sus propios informes.

Los scripts locales usan `SUPABASE_SERVICE_ROLE_KEY`, por lo que pueden sincronizar datos aunque RLS este activado.

## Seguridad

No guardar aqui claves reales de Supabase.

Variables esperadas:

- `VITE_SUPABASE_URL`: URL publica del proyecto para React.
- `VITE_SUPABASE_ANON_KEY`: clave anonima para frontend.
- `SUPABASE_SERVICE_ROLE_KEY`: clave privada solo para scripts/backend.

La clave `SUPABASE_SERVICE_ROLE_KEY` nunca debe exponerse en React.

## Fase 2: sincronizacion desde React

La app React no ejecuta scripts Python directamente. El flujo seguro es:

1. Un usuario `admin` pulsa el boton de actualizacion en React.
2. React llama a la Edge Function `trigger-sync`.
3. La Edge Function comprueba el rol del usuario en `profiles`.
4. Si es `admin`, lanza el workflow `Sync Supabase Data` de GitHub Actions.
5. GitHub Actions ejecuta los scripts Python y escribe en Supabase con `SUPABASE_SERVICE_ROLE_KEY`.

### Secretos necesarios en GitHub Actions

Configurar en el repositorio de GitHub, dentro de `Settings > Secrets and variables > Actions`:

- `SUPABASE_URL`: URL del proyecto Supabase.
- `SUPABASE_SERVICE_ROLE_KEY`: clave privada de servicio.
- `STREAMLIT_SECRETS_TOML`: contenido completo del `secrets.toml` usado por Streamlit, incluyendo Google Sheets y cuenta de servicio.

El workflow usa `STREAMLIT_SECRETS_TOML` para crear temporalmente `.streamlit/secrets.toml` en el runner y reutilizar los lectores actuales de Google Sheets.

### Secretos necesarios en Supabase Edge Functions

Configurar como secretos de la funcion:

- `SUPABASE_URL`: URL del proyecto Supabase.
- `SUPABASE_ANON_KEY`: anon key del proyecto.
- `SUPABASE_SERVICE_ROLE_KEY`: clave privada para validar el perfil del usuario.
- `GITHUB_ACTIONS_TRIGGER_TOKEN`: token de GitHub con permiso para lanzar workflows.
- `GITHUB_REPOSITORY`: repositorio en formato `owner/repo`.
- `GITHUB_REF`: rama a ejecutar, normalmente `main`.
- `GITHUB_SYNC_WORKFLOW`: opcional, por defecto `sync-supabase.yml`.

El token de GitHub debe tener permiso de escritura sobre Actions en el repositorio. No debe exponerse en React.

### Deploy de la funcion

Con Supabase CLI:

```bash
supabase functions deploy trigger-sync
supabase secrets set GITHUB_ACTIONS_TRIGGER_TOKEN=...
supabase secrets set GITHUB_REPOSITORY=owner/repo
supabase secrets set GITHUB_REF=main
```

Tambien hay que configurar el resto de secretos listados arriba si no existen ya en el proyecto.
