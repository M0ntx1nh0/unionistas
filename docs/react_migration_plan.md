# Unionistas Scouting Lab: migracion React + Supabase

Este documento define como construir la nueva version React en paralelo a la app Streamlit actual, sin romper el funcionamiento existente.

## Objetivo

Crear una version web de Unionistas Scouting Lab que permita:

- Consultar varias temporadas.
- Usar login y roles con Supabase Auth.
- Consultar informes, jugadores, calendario y campogramas desde Supabase.
- Mantener Google Forms / Google Sheets como fuente de entrada durante la transicion.
- Permitir ediciones controladas desde la app.
- Registrar cambios en una tabla de auditoria.

## Regla principal

La app Streamlit actual se mantiene estable.

- No tocar `app.py` salvo bugs o cambios solicitados expresamente.
- Todo React vive en `frontend/`.
- Todo Supabase vive en `supabase/`.
- Todo proceso de importacion/sincronizacion vive en `scripts/`.

## Arquitectura inicial sin coste

```text
Google Forms / Google Sheets / Drive CSV
        |
        | sync manual o programado
        v
Supabase Free
        |
        v
React / Next.js en frontend/
```

Coste previsto en fase inicial:

- Supabase Free: 0
- Vercel Free o ejecucion local: 0
- GitHub: 0

## Fases

### Fase 0. Preparacion

- Crear carpetas `frontend/`, `supabase/`, `docs/`.
- Definir modelo de datos.
- Mantener Streamlit como version estable.

### Fase 1. Supabase

- Crear tablas base con `supabase/schema.sql`.
- Activar Row Level Security.
- Definir roles: `admin`, `coordinator`, `scout`, `viewer`.
- Crear tabla `profiles` enlazada a Supabase Auth.

### Fase 2. Importacion inicial

- Crear script para importar datos actuales:
  - informes subjetivos generales
  - campogramas
  - calendario
  - datos Wyscout
  - mapeos de equipos

### Fase 3. Frontend React

- Crear app en `frontend/`.
- Conectar a Supabase.
- Crear login.
- Crear selector de temporada.
- Migrar primero una pantalla sencilla: informes.

### Fase 4. Vistas principales

Orden recomendado:

1. Informes
2. Jugador
3. Calendario
4. Campogramas
5. Dashboard

### Fase 5. Edicion y auditoria

- Permitir edicion de campos concretos.
- Registrar cambios en `audit_log`.
- Aplicar permisos por rol.

### Fase 6. Sincronizacion automatica

Opciones:

- Script manual local.
- GitHub Actions programado.
- Apps Script desde Google Sheets.
- Supabase Edge Function.

La primera opcion recomendada es script manual o GitHub Actions para mantener coste cero.

## Que datos necesito de Supabase

Para conectar React necesitaremos:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Para scripts de importacion necesitaremos, solo en entorno seguro/local:

- `SUPABASE_SERVICE_ROLE_KEY`

La `service_role_key` nunca debe ir en React ni subirse a GitHub.

## Roles iniciales

| Rol | Uso |
| --- | --- |
| `admin` | Ve y edita todo. Gestiona usuarios y datos. |
| `coordinator` | Ve todo lo deportivo y puede editar datos operativos. |
| `scout` | Ve vistas permitidas y puede editar sus propios informes o asignaciones. |
| `viewer` | Solo lectura. |

## Principio de temporadas

Todas las tablas operativas deben apuntar a `season_id` para permitir historico.

Ejemplos:

- `2025/26`
- `2026/27`

La app React deberia tener selector de temporada desde el inicio.
