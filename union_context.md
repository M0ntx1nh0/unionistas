# Unionistas Scouting Lab Context

Documento de contexto rápido para trabajar sobre la app sin tener que reexplorar el código base en cada cambio.

## 1. Visión general

- El repo convive en dos mundos:
  - `app.py` y `src/scouting_app/`: app histórica en Streamlit.
  - `frontend/`: nueva app React + TypeScript conectada a Supabase.
- La migración está planteada para que React sea la capa de producto nueva, mientras Streamlit sigue estable como fallback o legado.
- Los datos operativos ya no se leen directamente desde Google Sheets en el frontend: React consume Supabase.
- Los procesos de carga y sincronización viven fuera del frontend, principalmente en `scripts/`, `supabase/` y la edge function `supabase/functions/trigger-sync`.

## 2. Estructura del proyecto

```text
scouting/
├── app.py                         # App Streamlit histórica
├── src/scouting_app/              # Lógica Python de la versión anterior
├── frontend/                      # Nueva app React
│   ├── src/
│   │   ├── App.tsx                # Shell principal, auth, bootstrap, carga de datos y navegación
│   │   ├── main.tsx               # Punto de entrada React
│   │   ├── styles.css             # Estilos globales de toda la app
│   │   ├── lib/supabase.ts        # Cliente Supabase
│   │   ├── types.ts               # Tipos de dominio compartidos
│   │   ├── components/            # Componentes UI reutilizables
│   │   ├── utils/                 # Utilidades pequeñas (formato)
│   │   └── views/                 # Pantallas principales de negocio
│   ├── public/                    # Assets públicos
│   ├── package.json
│   ├── vite.config.ts
│   └── tsconfig.json
├── scripts/                       # Sincronización/importación hacia Supabase
├── supabase/                      # Schema, migrations, policies, seed y edge functions
├── creado para Unionistas - roles/ # Notebooks externos de modelado por roles y ranking posicional
├── docs/react_migration_plan.md   # Decisiones de migración y arquitectura objetivo
└── union_context.md               # Este documento
```

## 3. Tecnologías

### Frontend

- React 19
- TypeScript estricto
- Vite
- CSS global en un único archivo (`frontend/src/styles.css`)
- `@supabase/supabase-js` para auth, lecturas y edge functions
- `@react-pdf/renderer` para exportes PDF en la vista de dashboard

### Backend y datos

- Supabase como backend principal del frontend
- Supabase Auth para login
- Tablas con `season_id` como eje transversal
- RLS pensado por roles: `admin`, `coordinator`, `scout`, `viewer`
- Edge Function `trigger-sync` para lanzar sincronizaciones
- Scripts Python para ingestión desde fuentes externas

### Legado / coexistencia

- Streamlit y Python siguen presentes y no deben tocarse salvo necesidad explícita

## 4. Estructura del frontend React

### `frontend/src/App.tsx`

Es el centro de la aplicación. No hay router; la navegación se resuelve con estado local (`activeView`).

Responsabilidades principales:

- Recuperar sesión de Supabase.
- Controlar expiración local de sesión con `localStorage`.
- Escuchar cambios de auth.
- Cargar perfil (`profiles`) y temporadas (`seasons`).
- Cargar todos los datasets de la temporada seleccionada.
- Mantener contadores globales.
- Aplicar scope por rol, especialmente para `scout`.
- Renderizar la vista activa.

Patrón general:

1. `main.tsx` monta `App`.
2. `App` resuelve auth y bootstrap inicial.
3. Se cargan `profile` y `seasons`.
4. Se fija `selectedSeasonId`.
5. Cada cambio de temporada dispara la carga de todos los bloques de datos.
6. `AppShell` reparte los datasets a cada vista.

### `frontend/src/types.ts`

Define el contrato de dominio del frontend. Los tipos más importantes son:

- `UserProfile`
- `Season`
- `ScoutingReport`
- `PlayerSummary`
- `CalendarMatch`
- `ObjectivePlayer`
- `ObjectivePlayerMatch`
- `Campogram`
- `CampogramPlayer`
- `CampogramReport`

Este archivo es la referencia principal para entender qué espera la UI de Supabase.

### `frontend/src/lib/supabase.ts`

- Construye el cliente Supabase usando:
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`
- Si faltan variables, la app falla al arrancar.

### `frontend/src/components/`

- `LoginView.tsx`
  - Pantalla de acceso con email/password via Supabase Auth.
- `MetricCard.tsx`
  - Tarjeta métrica simple reutilizada en dashboard.

### `frontend/src/utils/`

- `format.ts`
  - `formatDate`
  - `formatTime`

Utilidades pequeñas y puras. No hay una capa amplia de helpers compartidos; mucha lógica de transformación vive dentro de cada vista.

### `frontend/src/views/`

- `viewConfig.ts`
  - Define las secciones principales:
    - `Dashboard`
    - `Jugadores`
    - `Informes`
    - `Calendario`
    - `Campogramas`
    - `ULab`

- `DashboardView.tsx`
  - Resumen ejecutivo basado en informes subjetivos.
  - Genera métricas, rankings, distribuciones y exporte PDF con identidad visual Unionistas.

- `PlayersView.tsx`
  - Es una de las vistas más complejas.
  - Cruza informes subjetivos con datos objetivos Wyscout.
  - Resuelve ficha de jugador, métricas, radar, comparaciones, similitud y utilidades reutilizadas después en otras vistas.
  - Contiene bastante lógica de negocio, no solo render.

- `ReportsView.tsx`
  - Explota la tabla de `scouting_reports`.
  - Filtra por scout, veredicto, competición, búsqueda libre y modo repetidos.
  - Detecta jugadores con múltiples informes.

- `CalendarView.tsx`
  - Cruza calendario con jugadores procedentes de informes y campogramas.
  - Normaliza nombres de equipos y crea niveles de interés por partido.
  - Es una vista de inteligencia operativa, no solo agenda.

- `CalendarPanel.tsx`
  - Componente más simple para listado de partidos.

- `CampogramsView.tsx`
  - Otra vista muy cargada de lógica de negocio.
  - Dedupe de jugadores e informes.
  - Consenso entre scouts.
  - Ordenación táctica por posiciones.
  - Persistencia parcial de estado en `sessionStorage`.
  - Reutiliza piezas de radar y comparación desde `PlayersView`.

- `ULabView.tsx`
  - Vista de plantilla / universo Unionistas basada en datos objetivos.
  - Normaliza posiciones Wyscout, agrupa por líneas y muestra comparativas.

## 5. Qué hace cada módulo de negocio

### Módulo de auth

- Login por Supabase Auth.
- Perfil extendido leído desde `profiles`.
- Gestión de cierre de sesión y expiración local por inactividad.

### Módulo de temporadas

- Todas las vistas dependen de `selectedSeasonId`.
- La temporada es el filtro global más importante del sistema.
- Si algo no cuadra en datos o resultados, lo primero a revisar es si el `season_id` está bien propagado.

### Módulo de informes subjetivos

- Fuente principal para dashboard, reports y buena parte de players.
- Tabla origen en frontend: `scouting_reports`.
- Se agrupan y resumen para construir `PlayerSummary`.
- Para rol `scout`, se filtran por coincidencia de email/nombre.

### Módulo de calendario

- Tabla principal: `calendar_matches`.
- Añade inteligencia cruzando:
  - partidos
  - informes subjetivos
  - campogramas
  - matching de jugadores con objetivo
- Usa mucha normalización textual para que los nombres de equipo coincidan.

### Módulo de campogramas

- Tablas principales:
  - `campograms`
  - `campogram_players`
  - `campogram_reports`
- La vista no solo muestra datos: también limpia duplicados y calcula consenso.

### Módulo objetivo / Wyscout

- Tablas principales:
  - `objective_players`
  - `objective_player_matches`
- Alimenta:
  - comparativas
  - radar
  - similitud
  - plantilla Unionistas en `ULab`
- Si falla este bloque, la app sigue viva pero con capacidades reducidas; `App.tsx` ya trata estos errores con tolerancia.

### Módulo de sincronización

- Solo visible para `admin`.
- Lanza `trigger-sync` con diferentes targets:
  - `reports`
  - `campograms`
  - `calendar`
  - `wyscout`
  - `all`
- El trabajo real ocurre fuera del frontend, previsiblemente en GitHub Actions y scripts Python.

### Artefactos externos de roles

- La carpeta `creado para Unionistas - roles/` contiene notebooks JSON exportados de Jupyter/Colab.
- No forman parte del flujo productivo actual del frontend ni de Supabase.
- Su función parece ser de laboratorio analítico:
  - cargar un Excel bruto por demarcación
  - filtrar por minutos, altura y edad
  - puntuar jugadores por rol
  - combinar scores por familias de rol
  - exportar resultados a Excel
- Son útiles como referencia conceptual si más adelante se quiere:
  - enriquecer `ULab`
  - crear rankings por rol más avanzados
  - o formalizar un motor de scouting posicional dentro de la app

## 6. Convenciones del código React

### Arquitectura y estado

- No hay React Router.
- `App.tsx` hace de contenedor global.
- Las vistas reciben datos ya cargados por props.
- Se usa `useState`, `useEffect`, `useMemo`, `useCallback` y algo de `useRef`.
- No hay librería externa de estado global.

### Convenciones de datos

- El acceso a datos es directo con `supabase.from(...).select(...)`.
- La paginación grande se resuelve manualmente con bucles `range(...)` de 1000 filas.
- Se usa `raw_data` como colchón para campos que todavía no están completamente normalizados en schema.
- Es frecuente hacer fallback entre columna “limpia” y valor extraído de `raw_data`.

### Convenciones de negocio

- Mucha lógica de normalización está incrustada en cada vista:
  - `normalizeKey`
  - `normalizeText`
  - mapeos manuales de equipos
  - normalización de posiciones/veredictos

## 7. Cambios recientes relevantes

- `Wyscout` ya no funciona como actualización incremental conservadora.
  - La sync actual reemplaza el snapshot completo por `temporada + dataset`.
  - Borra el bloque anterior, inserta el CSV nuevo, recalcula cruces y actualiza la fecha de carga.
  - Esto reduce incoherencias y evita depender de comparaciones finas fila a fila.
  - La misma sync recalcula perfiles de jugador en cada carga Wyscout. La primera familia integrada es `LAT` (laterales), guardando `primary_profile`, `secondary_profile`, `profile_family` y `profile_score_map` en `objective_players`.

- La fuente Wyscout desde Drive depende de `file_id` concretos.
  - Si se borra un CSV de Drive y se vuelve a subir, el `file_id` cambia.
  - El workflow de GitHub usa `STREAMLIT_SECRETS_TOML_B64`, no busca por nombre ni por carpeta.
  - Además, la cuenta de servicio debe tener acceso a los archivos o a la carpeta compartida.

- `CalendarView` ya no debe entender solo jornadas numéricas.
  - Se ha adaptado para aceptar también fases manuales de playoff.
  - La vista usa `raw_data.matchday` cuando existe y, si falta, puede inferir `Ida` o `Vuelta` por fecha dentro del bloque.
  - Convenciones esperadas en 2RFEF:
    - `PO Semis Asc Ida`
    - `PO Semis Asc Vuelta`
    - `PO Final Asc Ida`
    - `PO Final Asc Vuelta`
    - `PO Desc Ida`
    - `PO Desc Vuelta`

- `CampogramsView` se ha refinado en la parte objetiva.
  - La tarjeta Wyscout ya muestra un match abreviado tipo `Mat seguro Wy`.
  - También calcula un `Parecido Unionistas` con heurística priorizando línea posicional y mejor similitud útil.
- El laboratorio de roles ya ha empezado a migrarse desde los notebooks externos.
  - La carpeta `creado para Unionistas - roles/` sigue siendo la fuente conceptual de pesos y métricas.
  - El notebook `LAT_Roles_1_RFEF` ya está traducido a código reutilizable en `src/scouting_app/objective_profiles.py`.
  - Queda pendiente como mejora futura montar un recálculo independiente de perfiles por si cambian pesos o definiciones sin necesidad de relanzar una sync completa de Wyscout.
- Hay lógica duplicada entre vistas. Antes de refactorizar, conviene verificar si esa duplicidad es accidental o si responde a reglas de negocio ligeramente distintas.

### Convenciones de UI

- CSS global, no CSS Modules ni Tailwind.
- La identidad visual ya está bastante marcada:
  - negro
  - blanco roto
  - amarillo dorado Unionistas
  - fondos con textura/gradiente
- Las clases siguen naming semántico por bloque (`topbar`, `content-card`, `admin-sync-panel`, etc.).

### Convenciones de persistencia local

- `localStorage` para actividad de sesión.
- `sessionStorage` para estado efímero de UX:
  - vista activa
  - algunos filtros/selecciones persistentes entre desmontajes

### Convenciones de idioma

- Código en inglés para tipos/variables estructurales.
- UI y copy visibles en español.
- Muchos comentarios de negocio están en español.

## 7. Flujos importantes

### Flujo 1. Arranque de la app

1. `App` intenta recuperar sesión.
2. Si la sesión local está expirada por inactividad, fuerza sign-out.
3. Si hay sesión, carga `profiles` y `seasons`.
4. Selecciona la primera temporada disponible.
5. Carga datasets de la temporada.
6. Renderiza `AppShell`.

### Flujo 2. Cambio de temporada

1. El usuario cambia `selectedSeasonId`.
2. `App.tsx` relanza todas las lecturas dependientes.
3. Se recalculan counts, reports, matches, objective data y campogram data.
4. Las vistas se rehidratan con el nuevo contexto.

Este es uno de los puntos más sensibles del frontend.

### Flujo 3. Scope por rol

1. El perfil define `role`.
2. Si el rol es `scout`, la app filtra informes y campogramas propios.
3. También reduce los matches objetivos a jugadores presentes en su scope.
4. Si el rol es `admin`, aparece el panel de sincronización.

Importante: parte del control está en frontend, pero la seguridad real depende de Supabase/RLS.

### Flujo 4. Cruce subjetivo + objetivo

1. Se cargan `scouting_reports`.
2. Se cargan `objective_players`.
3. Se cargan `objective_player_matches`.
4. El frontend enriquece cada match con `objective_player`.
5. `PlayersView`, `CalendarView` y `ULabView` explotan ese cruce.

### Flujo 5. Sincronización de datos

1. Un admin pulsa “Actualizar”.
2. El frontend invoca la edge function `trigger-sync`.
3. La sincronización corre en background.
4. Los resultados llegan después a Supabase.
5. La app reflejará el cambio en la siguiente recarga de datos.

## 8. Riesgos y puntos delicados

- `App.tsx` concentra mucha responsabilidad y puede crecer demasiado.
- `PlayersView.tsx`, `CampogramsView.tsx` y `CalendarView.tsx` tienen bastante lógica de negocio embebida.
- La normalización textual manual es crítica; tocarla puede cambiar matches, consensos o agrupaciones.
- `raw_data` sigue siendo importante: cualquier cambio de schema debe considerar backward compatibility.
- El frontend hace cargas grandes por temporada; cualquier aumento fuerte de volumen puede exigir optimización.
- Parte de la lógica útil está duplicada entre vistas y aún no está extraída a un dominio compartido.

## 9. Guía práctica para futuras modificaciones

### Si tocamos una vista

- Revisar primero qué props recibe desde `App.tsx`.
- Confirmar si la lógica ya existe en otra vista y se puede reutilizar.
- Verificar si depende de `raw_data`, de matching textual o de reglas por rol.

### Si tocamos datos

- Revisar `frontend/src/types.ts`.
- Revisar los `select(...)` de `App.tsx`.
- Revisar si el campo se usa también en `raw_data`.
- Confirmar impacto en `scripts/` y en `supabase/schema.sql` o migrations.

### Si tocamos autenticación o permisos

- Revisar `profiles`, roles y filtrado de `scopeReportsForProfile`.
- Confirmar que la UX en frontend coincide con las políticas RLS reales.

### Si tocamos el calendario, campogramas o matching

- Revisar normalizadores de nombres.
- Revisar alias manuales de equipos.
- Validar si el cambio afecta a agrupación, dedupe o consenso.

## 10. Resumen operativo

La app React actual es una capa rica de consulta y análisis construida sobre Supabase, con `App.tsx` como punto de orquestación y con tres vistas especialmente complejas a nivel de negocio: `PlayersView`, `CalendarView` y `CampogramsView`. La clave para modificarla con seguridad es pensar siempre en estos ejes:

- rol del usuario
- temporada seleccionada
- calidad del matching textual
- dependencia de `raw_data`
- cruce entre datos subjetivos y objetivos

Si en futuras tareas necesitamos reducir todavía más contexto, este documento debería ser el punto de entrada antes de abrir archivos grandes del frontend.

## 11. Perfiles Wyscout por rol

- Ya hay cinco familias integradas en producción:
  - `Laterales`
  - `Centrales`
  - `Centrocampistas`
  - `Delanteros`
  - `Extremos`
- Los campos previstos en `objective_players` son:
  - `primary_profile`
  - `secondary_profile`
  - `profile_family`
  - `profile_score_map`
- El cálculo vive en `src/scouting_app/objective_profiles.py`.
- En `LAT`, el perfil solo se asigna cuando la posición principal Wyscout del jugador es realmente lateral/carrilero, para evitar etiquetas engañosas en extremos o centrales con minutos residuales ahí.
- En `Laterales`, el producto queda simplificado a tres perfiles oficiales:
  - `Lateral ofensivo`
  - `Lateral interior`
  - `Lateral defensivo`
- En `Laterales`, ya no se expone perfil secundario; en la ficha detalle se muestra el encaje porcentual del jugador con esos tres perfiles a partir de `profile_score_map`.
- En `Laterales`, el perfil ofensivo ya incorpora `assists_avg` para recoger mejor la producción final real, y el perfil defensivo se ha suavizado bajando el peso de `defensive_duels_won_percent` a favor de `possession_adjusted_tackle` e `interceptions`.
- En `Laterales`, el peso de `Attacking FB` se recalibró para premiar más la producción ofensiva real (`assists_avg`, `xg_assist_avg`, pases al último tercio/área y centros precisos) y depender menos de duelo ofensivo y regate puro.
- En `DFC`, el perfil solo se asigna cuando la posición principal Wyscout del jugador es realmente central (`CB`, `LCB`, `RCB`), para no contaminar el modelo con pivotes o defensas que hayan pasado puntualmente por ahí.
- En `Centrales`, el producto queda simplificado a tres perfiles oficiales:
  - `Central constructor`
  - `Central defensivo`
  - `Central veloz`
- En `Centrales`, ya no se expone perfil secundario; en la ficha detalle se muestra el encaje porcentual del jugador con esos tres perfiles a partir de `profile_score_map`.
- En cada sync de Wyscout se recalculan estos perfiles automáticamente.
- Además existe un rebuild independiente en `scripts/rebuild_objective_profiles.py` para recalcular perfiles y escribir solo esos campos sin relanzar una sync completa.
- `ULab` ya está preparado para:
  - mostrar el perfil principal en la tarjeta pequeña
  - mostrar perfil principal y secundario en la tarjeta detalle
  - enseñar un glosario breve de perfiles de laterales, centrales, centrocampistas, delanteros y extremos
- En `Centrocampistas`, aunque el cuaderno original calcula muchos roles intermedios, la salida visible de producto se ha simplificado a cuatro perfiles finales:
  - `Pivote`
  - `Mediocentro creador`
  - `Box to Box`
  - `Mediapunta-asistente`
- En `Centrocampistas`, ya no se expone perfil secundario; en la ficha detalle se muestra el encaje porcentual del jugador con esos cuatro perfiles a partir de `profile_score_map`.
- En los mediapuntas (`AMF`, `LAMF`, `RAMF`) la salida visible se restringe a perfiles ofensivos (`Mediapunta-asistente` / `Box to Box`) para evitar etiquetas engañosas como pivote o mediocentro creador.
- En `Delanteros`, la salida visible de producto queda simplificada a tres perfiles:
  - `Segundo punta`
  - `Delantero referencia`
  - `Delantero profundo`
- En `Extremos`, la salida visible de producto queda simplificada a tres perfiles:
  - `Extremo clásico`
  - `Extremo creador`
  - `Extremo finalizador`
- En `ULab`, el bloque visual de `Encaje por perfil` para centrocampistas también respeta esa restricción por posición principal: un `AMF/LAMF/RAMF` no debe mostrar `Pivote` o `Mediocentro creador` en el detalle.
- En `ULab`, el porcentaje y la barra de minutos ya no se calculan como `minutos / (partidos * 90)`, porque eso no representa bien la disponibilidad real sin una métrica fiable de convocatorias.
- Desde ahora, ese `%` de minutos se calcula como `minutos disputados / máximo de minutos disputados` dentro de la muestra cargada de Unionistas, y se presenta como referencia relativa de peso en minutos.
- El glosario de `ULab` funciona como acordeón:
  - ninguna familia debe salir desplegada por defecto al abrirlo
  - al cerrar el glosario se resetea la familia abierta
- Para que se vean en frontend hay que:
  - tener aplicadas las columnas nuevas en Supabase
  - poblar esos campos mediante sync o rebuild
  - y asegurarse de que `App.tsx` los incluya en el `select(...)` de `objective_players`
- Existe un exportador reutilizable de catálogo de perfiles en `scripts/export_profile_catalog_excel.py`, pensado para generar un Excel en una sola hoja con:
  - familia
  - perfil visible
  - rol base
  - métrica técnica
  - métrica en inglés
  - traducción al castellano
  - peso porcentual

## 12. Campogramas por agencia

- La fuente útil para explotar agencias dentro de `Campogramas` es `campogram_players.agent`.
- Ese campo ya se carga desde la hoja/base de campogramas y se muestra en el detalle del jugador.
- La sección de `Agencias` en `CampogramsView` se apoya en:
  - una normalización ligera del nombre de agencia
  - un pequeño mapa de alias para absorber variantes evidentes (`You First`, `YOU FIRST`, `You First Sports`, etc.)
- El flujo pensado es:
  - resumen por agencia con número de jugadores
  - selección de una agencia
  - listado filtrado con jugador, edad, posición, equipo y campograma
- La normalización debe ser conservadora: unificar variantes claras sin mezclar agencias distintas por exceso de agresividad.
- El buscador de jugador dentro de `Agencias` se eliminó para simplificar la UX; ahora la interacción se apoya solo en el desplegable de agencia y en el listado resultante.
