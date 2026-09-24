# Migracion segura de identidad de jugadores

## Objetivo

Asignar un `players.id` estable a informes, campogramas, datos objetivos y
UScout sin borrar, mover ni reescribir la informacion historica existente.

La migracion aprovecha la relacion actual por `nombre normalizado + ano de
nacimiento`. Esa relacion se convierte en una clave explicita, pero se
conservan los nombres, anos, equipos, temporadas e identificadores de origen.

## Reglas de seguridad

- No borrar filas de ninguna tabla durante la migracion.
- No modificar `season_id`.
- No modificar informes, comentarios, valoraciones ni datos `raw_data`.
- No sustituir los identificadores `source_row_id` de Google Sheets.
- No usar el ID de Wyscout como ID principal interno.
- No enlazar automaticamente registros sin ano de nacimiento.
- No enlazar automaticamente un caso que apunte a mas de un `player_id`.
- Mantener temporalmente el emparejamiento por nombre como respaldo en el frontend.
- Ejecutar todas las escrituras dentro de una transaccion y validar recuentos.

## Fases

### 1. Auditoria de solo lectura

Ejecutar:

```bash
.venv/bin/python scripts/audit_player_identity_migration.py
```

El script genera en `outputs/player_identity_audit/`:

- `summary.json`: recuentos y cobertura por tabla.
- `safe_identity_groups.csv`: grupos enlazables por nombre normalizado y ano.
- `conflicting_identity_groups.csv`: claves relacionadas con varios IDs.
- `unresolved_records.csv`: registros sin datos suficientes.

Esta fase no contiene opcion `--apply` y no modifica Supabase.

### 2. Copia de seguridad y fotografia de control

Antes de escribir:

- Exportar `players`, `scouting_reports`, `campogram_players`,
  `objective_players`, `objective_player_matches`, `uscout_shortlist_players`
  y `uscout_board_slots`.
- Guardar los recuentos totales y por temporada.
- Guardar el numero de filas con `player_id` nulo y no nulo.

### 3. Crear identidades internas

- Insertar en `players` una fila por cada grupo operativo seguro.
- Mantener como nombre canonico una variante ya presente en los datos.
- No crear automaticamente identidades para los casos incompletos o ambiguos.
- Registrar el metodo de enlace y su fecha para poder auditarlo.

### 4. Enlazar sin sobrescribir

- Rellenar solamente columnas `player_id` que esten a `null`.
- Vincular primero `scouting_reports` y `campogram_players`.
- Vincular despues UScout.
- Vincular Wyscout reutilizando `objective_player_matches`, empezando solo por
  `match_status = 'seguro'`.
- Revisar manualmente `probable`, `dudoso` y registros sin ano.

### 5. Adaptar la aplicacion

- Buscar y agrupar primero por `player_id`.
- Mantener `nombre normalizado + ano` como respaldo durante la transicion.
- Mostrar una alerta interna cuando un registro no tenga `player_id`.
- Retirar el respaldo solamente cuando la cobertura haya sido validada.

### 6. Separar identidad y temporada

`players` representa a la persona y no cambia entre temporadas. Los datos que
si cambian deben almacenarse por `player_id + season_id`: equipo, competicion,
posicion, agencia, cesion y contrato.

## Validaciones obligatorias

Despues de cada escritura deben coincidir exactamente:

- Numero de informes total y por temporada.
- Numero de comentarios y valoraciones no nulos.
- Numero de jugadores en cada campograma.
- Numero de eventos de seguimiento.
- Numero de shortlists, campogramas UScout y posiciones ocupadas.
- Identificadores de origen de Google Sheets.

La unica variacion esperada es que aumente el numero de filas con `player_id`
informado. Cualquier otra diferencia bloquea la siguiente fase.

## Reversion

Mientras no se eliminen las columnas de texto actuales, la primera migracion
se puede revertir poniendo a `null` exclusivamente los `player_id` asignados
por el lote, identificados mediante su registro de auditoria. Los datos de
negocio permanecen intactos.
## Fase operativa: relaciones existentes

La migracion `012_player_identity_operational_metadata.sql` reutiliza las
relaciones ya consolidadas mediante nombre normalizado y ano de nacimiento.
No vuelve a decidir identidades ni toca Wyscout: registra la trazabilidad de
los `player_id` ya asignados y crea una fila de `player_seasons` por jugador y
temporada.

Los registros sin ano de nacimiento o con identidad dudosa quedan pendientes
de revision manual. Nunca se les asigna un jugador por aproximacion.
