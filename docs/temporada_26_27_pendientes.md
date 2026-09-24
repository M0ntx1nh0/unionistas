# Temporada 2026/27 - Pendientes y decisiones funcionales

Este archivo recoge decisiones funcionales ya habladas para tenerlas presentes
cuando se desarrolle la nueva temporada y evitar rehacer planteamientos ya
cerrados.

## Preparación de temporada

- La temporada `2026/27` se crea separada de `2025/26` mediante `season_id`.
- `2025/26` permanece como histórico consultable y no se sobrescribe.
- `2026/27` es la temporada principal (`active = true`) y aparece por defecto.
- `2025/26` permanece disponible en el selector como temporada histórica.
- La fuente de informes generales `2026/27` es la hoja del club **Base de Datos
  26/27 USCF**, pestaña **Respuestas de formulario 2**.
- Hasta disponer de sus fuentes, en `2026/27` quedan bloqueadas las
  sincronizaciones de calendario, campogramas y Wyscout.
- Primera carga realizada: **330 informes**, **308 jugadores únicos** y
  **7 scouts**. La temporada `2025/26` conserva sus **1.333 informes**.

## Campogramas - criterio acordado

### 1. No trabajar por semanas

- Los campogramas personales de scouts y coordinadores **no** se plantean como
  snapshots semanales.
- El flujo real del club no funciona por semana en esta parte.
- Por tanto, queda descartado el enfoque de campogramas "semanales" como modelo
  principal de trabajo.

### 2. Misma estructura base que los oficiales del club

- Los modelos personales durante la temporada deben seguir, en principio, la
  misma estructura base que los campogramas oficiales del club.
- Esto permite comparar mejor y mantener un lenguaje común entre scouts,
  coordinadores y estructura oficial.

### 3. Límite por posición

- La forma de trabajo deseada es de **6 jugadores por posición**.
- Ese límite debe mantenerse como referencia funcional del módulo.

### 4. Campogramas editables durante toda la temporada

- Los campogramas personales deben ser **editables**.
- Se debe poder:
  - añadir jugadores
  - quitar jugadores
  - mantener el campograma vivo a lo largo de toda la temporada

### 5. Diferencia entre oficiales y personales

- Los campogramas oficiales del club siguen siendo una capa distinta.
- Los campogramas personales de scouts/coordinadores deben entenderse como una
  herramienta de trabajo paralela durante la temporada.
- Este punto debe retomarse cuando se aborde el desarrollo específico del
  módulo de nueva temporada.

## Nota de prioridad

- Este tema queda guardado para más adelante.
- El flujo actual de trabajo indica que antes hay otros bloques prioritarios.
- Cuando llegue el momento de desarrollar la nueva temporada, este documento
  debe tomarse como referencia de partida para evitar volver al enfoque por
  semanas.

## UScout - espacio personal de trabajo

### Estado de la primera entrega local

- Añadida la pestaña `UScout` entre `Jugadores` e `Informes`.
- Preparada la migración `009_uscout_workspace.sql`, independiente de las
  tablas actuales y protegida mediante RLS.
- Implementada una shortlist principal por scout y temporada con jugadores de
  la base, altas manuales, prioridad, estado, notas y control de duplicados.
- La shortlist admite un máximo de **6 jugadores por posición** e incorpora
  búsqueda y filtros de jugador, equipo, posición y competición.
- Implementados hasta **6 campogramas por scout y temporada**, con formaciones
  `4-3-3`, `4-2-3-1` y `4-4-2`, jugadores no repetidos y guardado automático.
- El scout edita únicamente su espacio; el coordinador consulta los espacios
  de los scouts; el administrador puede editarlos.
- Pendiente de fases posteriores: calendario, varios equipos por scout,
  enlace definitivo de jugadores manuales, arrastre, banquillo y exportación.

### 1. Ubicación y permisos

- Crear una nueva sección `UScout` entre `Jugadores` e `Informes`.
- El scout solamente podrá visualizar y modificar su propio espacio UScout.
- El coordinador podrá seleccionar un scout y revisar su shortlist y su
  campograma, pero el scout no podrá ver las selecciones de otros compañeros.
- El administrador podrá consultar y administrar los espacios de todos los
  scouts.
- Las selecciones de otros scouts permanecerán ocultas para evitar condicionar
  el criterio individual de observación.
- La privacidad debe protegerse mediante políticas RLS en Supabase, no solo en
  la interfaz.

### 2. Shortlist personal

- Cada scout dispondrá de una shortlist principal por temporada.
- Se podrán incorporar jugadores existentes en la base de datos y jugadores
  manuales todavía no registrados.
- Cada registro mostrará, cuando exista, nombre, edad, equipo, posición,
  valoración, número de informes y temporada.
- Cada jugador podrá tener prioridad, notas personales y uno de estos estados:
  `Pendiente`, `Próximo a ver`, `Visto` o `Descartado`.
- Un jugador solo podrá aparecer una vez dentro de la misma shortlist.
- Cada posición podrá contener un máximo de 6 jugadores.
- Antes de crear un jugador manual se buscarán coincidencias por nombre, año de
  nacimiento y equipo para reducir duplicados.
- Los jugadores manuales deberán quedar identificados y podrán enlazarse más
  adelante con el jugador oficial sin perder notas ni selecciones.
- En una fase posterior, la shortlist se relacionará con el calendario para
  mostrar los próximos partidos de los jugadores seleccionados.
- El calendario podrá ordenar o destacar partidos según el número de jugadores
  de la shortlist que participen en ellos.
- También se podrán seleccionar equipos concretos para visualizar sus partidos
  y detectar en cuáles coinciden más jugadores relevantes.
- El cálculo podrá considerar tanto jugadores de la shortlist como jugadores
  que ya formen parte de la base de informes del scout, mediante un selector de
  alcance: `Shortlist`, `Base del scout` o `Ambas`.
- Cada partido deberá indicar el total de jugadores detectados y permitir abrir
  su listado antes de decidir qué encuentro observar.

### 3. Equipo ideal táctico

- Debajo de la shortlist se incluirá un equipo ideal personal del scout.
- Tendrá selector de formación (`4-3-3`, `4-2-3-1`, `4-4-2`, etc.) y posiciones
  adaptadas automáticamente a la formación elegida.
- Los jugadores podrán proceder de la base general o de los registros manuales
  del scout.
- Un mismo jugador no podrá repetirse dentro del mismo equipo ideal.
- La composición y cualquier cambio de formación o jugador se guardarán
  automáticamente.
- Cada scout podrá crear hasta 6 campogramas por temporada, identificados con
  un nombre propio y seleccionables desde la misma vista.
- Entre los posibles equipos futuros estarán `Mejor XI`, `Sub-23` y `Jugadores
  a seguir`.

### 4. Propuesta visual del campo táctico

- Tomar como referencia el campo mostrado en la captura aportada: perspectiva
  de estadio/campo táctico, pero adaptada a la identidad visual de Unionistas.
- En lugar de mostrar solamente dorsales, cada marcador incluirá el **nombre o
  apellido corto del jugador**.
- Al seleccionar un marcador se podrá mostrar una ficha breve con nombre
  completo, equipo, posición, edad y valoración.
- Los jugadores se podrán colocar por selección de posición y, en escritorio,
  mediante arrastre. En móvil se priorizará tocar jugador y tocar posición para
  evitar problemas con el drag and drop.
- Recomendación técnica: utilizar **SVG y CSS con falsa perspectiva 3D**, no un
  motor 3D completo. Será más ligero, responsive, imprimible y coherente con la
  aplicación actual.
- El campo tendrá una vista táctica principal y podrá ofrecer una vista 2D como
  alternativa de accesibilidad o para pantallas pequeñas.
- La perspectiva no debe perjudicar la lectura de los nombres. Las fichas se
  orientarán siempre hacia la pantalla aunque el campo aparezca inclinado.
- El diseño debe admitir nombres largos mediante abreviatura visible y nombre
  completo en detalle, evitando solapamientos.
- Debe contemplarse exportación futura a imagen o PDF.

#### Alternativa visual 2D informativa

- Guardar también como referencia la segunda captura aportada: campo vertical
  2D, formación claramente distribuida y fichas de jugador con fotografía,
  nombre, posición y puntuación.
- Esta opción puede convivir con la perspectiva táctica anterior mediante un
  selector `Vista táctica / Vista 2D`, sin duplicar los datos guardados.
- La vista 2D ofrece ventajas para móvil, tablet, impresión y lectura rápida de
  nombres e información individual.
- Sobre cada jugador se podrá mostrar un indicador configurable: valoración
  media, número de informes, Union Value u otra métrica acordada.
- Al seleccionar un jugador se abrirá un panel de detalle con equipo, edad,
  posición, valoración, número de informes y acceso a su ficha completa.
- Se contempla una bandeja lateral o inferior de candidatos, agrupados por
  posición, para sustituir jugadores del once sin abandonar el campograma.
- Incluir una zona opcional de banquillo para suplentes o alternativas por
  posición.
- En escritorio, el panel de candidatos podrá situarse a la derecha. En móvil
  deberá convertirse en un panel inferior o desplegable para no reducir el
  tamaño útil del campo.
- Los selectores de temporada, formación y filtros se situarán sobre el campo y
  conservarán el lenguaje visual de Unionistas.
- Recomendación inicial: priorizar esta vista 2D como modo funcional principal
  y dejar la falsa perspectiva 3D como vista alternativa más visual. La 2D será
  más sencilla de usar, mantener y adaptar a todos los tamaños de pantalla.

### 5. Decisiones pendientes antes de desarrollar

- Confirmar si se utilizará nombre, apellido o nombre abreviado sobre el campo.
- Definir las formaciones disponibles en la primera versión.
- Decidir si se incluyen suplentes o únicamente once titulares.
- Decidir si el scout puede mover libremente cada ficha o si debe respetar
  zonas predefinidas por posición.
- Definir si coordinador y administrador pueden editar los equipos de los
  scouts o solamente consultarlos.
- Confirmar si se desea guardar un historial de cambios del equipo ideal.
- Elegir qué vista será la predeterminada: perspectiva táctica o campo 2D
  informativo.
- Definir qué dato aparecerá sobre cada jugador: valoración, informes, Union
  Value u otro indicador.
- Decidir si habrá banquillo y cuántos suplentes podrá contener.

### 6. Orden de desarrollo recomendado

1. Modelo de jugadores con identificador interno estable.
2. Permisos y shortlist personal.
3. Alta y posterior enlace de jugadores manuales.
4. Equipo ideal táctico y selector de formaciones.
5. Relación de shortlist con calendario.
6. Exportación y estadísticas agregadas para coordinación.
