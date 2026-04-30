import { useMemo, useState } from "react";
import type { ObjectivePlayer } from "../types";
import {
  calculateRadarSimilarity,
  formatObjectiveAge,
  getObjectiveRadarBlockBalance,
  getObjectiveRadarForMode,
  getObjectiveRadarItems,
  getUnionValue,
  ObjectiveRadar,
  radarPercentileClass,
  type ObjectiveRadarMode,
} from "./PlayersView";

// ─────────────────────────────────────────────────────────
// Plantilla Unionistas — nombres exactos en Wyscout
// ─────────────────────────────────────────────────────────
const UNIONISTAS_FULL_NAMES = new Set([
  "Jan Encuentra Martin",
  "Henri Dedorres Hiobi Ntola",
  "Abderrezzek Saidi",
  "José Adam Arvelo López",
  "Hugo De Bustos Blanco",
  "Marco Suárez Coronas Lastra",
  "Peré Marco Suñerc",
  "Juan Manuel Lendínez Moreno", // normalizado sin doble espacio
  "Ange Josuè Chibozo",
  "José Manuel López Plaza",
  "Aleix Gorjón Vivó",
  "Raúl Prada Lozano",
  "José Ramón Masllorens Doria",
  "José María Pérez García",
  "Vadik Murria Soriano",
  "Salvador Montañez Carrasco",
  "Juan Jesús Rodríguez Rodríguez",
  "Sergio Sanchís Hernández",
  "Juan Artola Canales",
  "Mounir Errahaly",
  "Víctor Olmedo Sellès",
  "Aarón Piñán De La Fuente",
  "Álvaro Gómez Martín",
  "Carlos De la Nava García",
  "Ramiro Mayor Ruiz",
]);

// Nombre corto amigable para mostrar en tarjeta
const SHORT_NAME_OVERRIDE: Record<string, string> = {
  "Juan Manuel Lendínez Moreno": "Juanma",
  "José María Pérez García": "Farru",
  "Juan Jesús Rodríguez Rodríguez": "Juanje",
  "Ange Josuè Chibozo": "Chibozo",
  "José Manuel López Plaza": "Jota López",
  "Salvador Montañez Carrasco": "Salvi Carrasco",
  "Peré Marco Suñerc": "Peré Marco",
};

// ─────────────────────────────────────────────────────────
// Normalización de códigos de posición Wyscout
// Wyscout a veces exporta código raw (RDMF, LB5, LCMF3…)
// en lugar del label traducido. Limpiamos el sufijo numérico
// y mapeamos el código al nombre en español.
// ─────────────────────────────────────────────────────────
const WYSCOUT_POSITION_LABEL: Record<string, string> = {
  // Porteros
  GK: "Portero",
  // Defensas
  LB: "Lateral Izquierdo",
  RB: "Lateral Derecho",
  LCB: "Defensa Central Izquierdo",
  RCB: "Defensa Central Derecho",
  CB: "Defensa Central",
  LWB: "Carrilero Izquierdo",
  RWB: "Carrilero Derecho",
  // Centrocampistas defensivos
  LDMF: "Mediocampista Defensivo Izquierdo",
  RDMF: "Mediocampista Defensivo Derecho",
  DMF: "Mediocampista Defensivo",
  // Centrocampistas centrales
  LCMF: "Mediocampista Central Izquierdo",
  RCMF: "Mediocampista Central Derecho",
  CMF: "Mediocampista Central",
  // Centrocampistas ofensivos
  LAMF: "Mediocampista Ofensivo Izquierdo",
  RAMF: "Mediocampista Ofensivo Derecho",
  AMF: "Mediocampista Ofensivo",
  // Extremos / delanteros
  LW: "Extremo Izquierdo",
  RW: "Extremo Derecho",
  LWF: "Delantero Extremo Izquierdo",
  RWF: "Delantero Extremo Derecho",
  CF: "Delantero Centro",
  SS: "Segunda Punta",
};

/**
 * Normaliza un código o label de posición Wyscout.
 * Elimina sufijos numéricos (LB5 → LB), busca en el mapa
 * y devuelve el label en español o el original si no hay match.
 */
function normalizePositionLabel(raw: string | null | undefined): string {
  if (!raw) return "—";
  // Eliminar sufijo numérico: "LB5" → "LB", "LCMF3" → "LCMF"
  const cleaned = raw.trim().replace(/\d+$/, "").toUpperCase();
  return WYSCOUT_POSITION_LABEL[cleaned] || raw.trim();
}

// ─────────────────────────────────────────────────────────
// Agrupación por línea
// ─────────────────────────────────────────────────────────
const POSITION_LINE: Record<string, "portero" | "defensas" | "centrocampistas" | "delanteros"> = {
  // ── Portero ──────────────────────────────────────────────
  portero: "portero",
  gk: "portero",
  // ── Defensas ─────────────────────────────────────────────
  "lateral izquierdo": "defensas",
  "lateral derecho": "defensas",
  "defensa central izquierdo": "defensas",
  "defensa central derecho": "defensas",
  "defensa central": "defensas",
  "carrilero izquierdo": "defensas",
  "carrilero derecho": "defensas",
  // labels legacy (por si vienen de la BD con label viejo)
  "central izquierdo": "defensas",
  "central derecho": "defensas",
  central: "defensas",
  lb: "defensas",
  rb: "defensas",
  lcb: "defensas",
  rcb: "defensas",
  cb: "defensas",
  lwb: "defensas",
  rwb: "defensas",
  // ── Centrocampistas ──────────────────────────────────────
  "mediocampista defensivo izquierdo": "centrocampistas",
  "mediocampista defensivo derecho": "centrocampistas",
  "mediocampista defensivo": "centrocampistas",
  "mediocampista central izquierdo": "centrocampistas",
  "mediocampista central derecho": "centrocampistas",
  "mediocampista central": "centrocampistas",
  "mediocampista ofensivo izquierdo": "centrocampistas",
  "mediocampista ofensivo derecho": "centrocampistas",
  "mediocampista ofensivo": "centrocampistas",
  "extremo izquierdo": "centrocampistas",
  "extremo derecho": "centrocampistas",
  // labels legacy
  "mediocentro def. izq.": "centrocampistas",
  "mediocentro def. der.": "centrocampistas",
  "mediocentro izq.": "centrocampistas",
  "mediocentro der.": "centrocampistas",
  "mediocentro defensivo": "centrocampistas",
  mediocentro: "centrocampistas",
  mediapunta: "centrocampistas",
  "mediapunta izq.": "centrocampistas",
  "mediapunta der.": "centrocampistas",
  rdmf: "centrocampistas",
  ldmf: "centrocampistas",
  rcmf: "centrocampistas",
  lcmf: "centrocampistas",
  dmf: "centrocampistas",
  cmf: "centrocampistas",
  amf: "centrocampistas",
  lamf: "centrocampistas",
  ramf: "centrocampistas",
  lw: "centrocampistas",
  rw: "centrocampistas",
  lwf: "centrocampistas",
  rwf: "centrocampistas",
  // ── Delanteros ───────────────────────────────────────────
  "delantero centro": "delanteros",
  "delantero extremo izquierdo": "delanteros",
  "delantero extremo derecho": "delanteros",
  "segunda punta": "delanteros",
  cf: "delanteros",
  ss: "delanteros",
};

const LINE_ORDER = ["portero", "defensas", "centrocampistas", "delanteros"] as const;
type PositionLine = (typeof LINE_ORDER)[number];

const LINE_LABEL: Record<PositionLine, string> = {
  portero: "Portero",
  defensas: "Defensas",
  centrocampistas: "Centrocampistas",
  delanteros: "Delanteros",
};

const LINE_COLOR: Record<PositionLine, string> = {
  portero: "#e0d200",
  defensas: "#3b82f6",
  centrocampistas: "#16813a",
  delanteros: "#d9480f",
};

function positionLine(pos: string | null | undefined): PositionLine {
  // Primero intentar con el label normalizado, luego con el código raw
  const normalized = normalizePositionLabel(pos).toLowerCase();
  const raw = (pos || "").toLowerCase().trim().replace(/\d+$/, "");
  return POSITION_LINE[normalized] ?? POSITION_LINE[raw] ?? "centrocampistas";
}

/** Label legible de una posición (normaliza código si es necesario) */
function positionDisplayLabel(raw: string | null | undefined): string {
  if (!raw || raw === "No disponible") return "—";
  // Si ya es un label en español con vocales, usarlo directo
  if (/[aeiouáéíóú]/i.test(raw) && raw.length > 3) return raw;
  // Si parece un código Wyscout (mayúsculas, sin vocales o muy corto)
  return normalizePositionLabel(raw);
}

// ─────────────────────────────────────────────────────────
// Banderas emoji por país
// ─────────────────────────────────────────────────────────
const COUNTRY_FLAG: Record<string, string> = {
  Spain: "🇪🇸",
  Morocco: "🇲🇦",
  France: "🇫🇷",
  "Democratic Republic of the Congo": "🇨🇩",
  Belgium: "🇧🇪",
  Algeria: "🇩🇿",
  Venezuela: "🇻🇪",
  Argentina: "🇦🇷",
  Portugal: "🇵🇹",
  Brazil: "🇧🇷",
  Colombia: "🇨🇴",
  Senegal: "🇸🇳",
  Nigeria: "🇳🇬",
  Cameroon: "🇨🇲",
  Ghana: "🇬🇭",
  Romania: "🇷🇴",
  Ukraine: "🇺🇦",
  Poland: "🇵🇱",
  Mexico: "🇲🇽",
  Uruguay: "🇺🇾",
  Chile: "🇨🇱",
  Ecuador: "🇪🇨",
  "Ivory Coast": "🇨🇮",
  Germany: "🇩🇪",
  Italy: "🇮🇹",
  Netherlands: "🇳🇱",
  Sweden: "🇸🇪",
  Norway: "🇳🇴",
  Croatia: "🇭🇷",
  Serbia: "🇷🇸",
  Bosnia: "🇧🇦",
  Hungary: "🇭🇺",
  "Czech Republic": "🇨🇿",
  Slovakia: "🇸🇰",
  Turkey: "🇹🇷",
  Greece: "🇬🇷",
  "United States": "🇺🇸",
  England: "🏴󠁧󠁢󠁥󠁮󠁧󠁿",
  Scotland: "🏴󠁧󠁢󠁳󠁣󠁴󠁿",
  Wales: "🏴󠁧󠁢󠁷󠁬󠁳󠁿",
  "Republic of Ireland": "🇮🇪",
};

function countryFlag(country: string | null | undefined): string {
  return COUNTRY_FLAG[country || ""] || "";
}

// ─────────────────────────────────────────────────────────
// Stats brutas desde metrics
// ─────────────────────────────────────────────────────────
interface RawStats {
  matches: number;
  minutes: number;
  goals: number;
  assists: number;
  /** % de minutos disputados sobre el total de minutos posibles (partidos × 90) */
  minutesPct: number;
}

function extractStats(player: ObjectivePlayer): RawStats {
  const m = (player.metrics as Record<string, unknown>) || {};
  const matches = Number(m.total_matches) || 0;
  const minutes = Number(m.minutes_on_field) || 0;
  const goalsAvg = Number(m.goals_avg) || 0;
  const assistsAvg = Number(m.assists_avg) || 0;
  const goals = minutes > 0 ? Math.round(goalsAvg * minutes / 90) : 0;
  const assists = minutes > 0 ? Math.round(assistsAvg * minutes / 90) : 0;
  // % de minutos disputados = minutos / (partidos × 90), sin asumir titularidades
  const minutesPct = matches > 0 ? Math.min(100, Math.round((minutes / (matches * 90)) * 100)) : 0;
  return { matches, minutes, goals, assists, minutesPct };
}

function normalizeFullName(name: string) {
  return name.replace(/\s+/g, " ").trim();
}

function playerShortName(player: ObjectivePlayer): string {
  const fullNorm = normalizeFullName(player.full_name || "");
  return SHORT_NAME_OVERRIDE[fullNorm] || player.name || player.full_name || "—";
}

// ─────────────────────────────────────────────────────────
// Comparación multi-radar (overlay SVG)
// ─────────────────────────────────────────────────────────
const COMPARE_PALETTE = ["#e0d200", "#3b82f6", "#d9480f"];

function buildRadarPolygon(
  values: number[],
  center: number,
  radius: number,
): string {
  const n = values.length;
  if (n === 0) return "";
  return values
    .map((v, i) => {
      const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
      const r = (v / 100) * radius;
      const x = center + r * Math.cos(angle);
      const y = center + r * Math.sin(angle);
      return `${x},${y}`;
    })
    .join(" ");
}

function buildLabelPoint(index: number, total: number, center: number, labelRadius: number) {
  const angle = (Math.PI * 2 * index) / total - Math.PI / 2;
  return {
    x: center + labelRadius * Math.cos(angle),
    y: center + labelRadius * Math.sin(angle),
  };
}

function formatLabel(label: string): string {
  // Acortar etiquetas largas
  return label
    .replace("Conducciones prog.", "Cond. prog.")
    .replace("Progresivas", "Prog.")
    .replace("Defensivos", "Def.")
    .replace("Acciones def.", "Acc. def.")
    .replace("Intercepciones", "Intercepc.")
    .replace("Asistencias", "Asist.")
    .replace("Regates", "Reg.");
}

interface CompareEntry {
  player: ObjectivePlayer;
  color: string;
  label: string;
}

function CompareRadar({ entries, mode }: { entries: CompareEntry[]; mode: ObjectiveRadarMode }) {
  if (entries.length === 0) return null;

  const base = entries[0];
  const baseRadar = getObjectiveRadarForMode(base.player, mode);
  if (!baseRadar || !baseRadar.params?.length) return null;

  const params = baseRadar.params as string[];
  const n = params.length;
  const center = 170;
  const radius = 110;
  const labelRadius = 148;
  const gridLevels = [25, 50, 75, 100];

  const gridPoints = gridLevels.map((level) =>
    params
      .map((_, i) => {
        const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
        const r = (level / 100) * radius;
        return `${center + r * Math.cos(angle)},${center + r * Math.sin(angle)}`;
      })
      .join(" "),
  );

  const spokes = params.map((_, i) => {
    const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
    return {
      x2: center + radius * Math.cos(angle),
      y2: center + radius * Math.sin(angle),
    };
  });

  return (
    <div className="ulab-compare-radar-wrap">
      <svg viewBox="0 0 340 340" className="ulab-compare-radar" aria-label="Radar comparación">
        {/* Grid */}
        {gridPoints.map((pts, gi) => (
          <polygon key={gi} points={pts} className="objective-radar-ring" />
        ))}
        {spokes.map((s, si) => (
          <line key={si} x1={center} y1={center} x2={s.x2} y2={s.y2} className="objective-radar-spoke" />
        ))}

        {/* Polígonos por jugador */}
        {entries.map((entry) => {
          const radar = getObjectiveRadarForMode(entry.player, mode);
          if (!radar?.values?.length) return null;
          const values = (radar.values as number[]).map(Number);
          const pts = buildRadarPolygon(values, center, radius);
          return (
            <polygon
              key={entry.player.id}
              points={pts}
              fill={entry.color}
              fillOpacity={0.15}
              stroke={entry.color}
              strokeWidth={2}
              strokeLinejoin="round"
            />
          );
        })}

        {/* Etiquetas */}
        {params.map((param, i) => {
          const pt = buildLabelPoint(i, n, center, labelRadius);
          const anchor = pt.x < center - 8 ? "end" : pt.x > center + 8 ? "start" : "middle";
          return (
            <text
              key={i}
              x={pt.x}
              y={pt.y}
              textAnchor={anchor}
              dominantBaseline="middle"
              className="objective-radar-label"
              fontSize="9"
              paintOrder="stroke"
            >
              {formatLabel(param)}
            </text>
          );
        })}
      </svg>

      {/* Leyenda */}
      <div className="ulab-compare-legend">
        {entries.map((entry) => (
          <div key={entry.player.id} className="ulab-compare-legend-item">
            <span style={{ background: entry.color }} />
            <strong>{entry.label}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// Tarjeta de jugador de la plantilla
// ─────────────────────────────────────────────────────────
function SquadPlayerCard({
  player,
  isSelected,
  onSelect,
}: {
  player: ObjectivePlayer;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const stats = useMemo(() => extractStats(player), [player]);
  const line = positionLine(player.primary_position || player.primary_position_label);
  const color = LINE_COLOR[line];
  const flag = countryFlag(player.birth_country_name);
  const age = player.birth_year ? new Date().getFullYear() - player.birth_year : null;
  const radar = getObjectiveRadarForMode(player, "specific") || getObjectiveRadarForMode(player, "general");
  const radarItems = radar ? getObjectiveRadarItems(radar) : [];
  const blockBalance = getObjectiveRadarBlockBalance(radarItems);
  const unionValue = getUnionValue(blockBalance);

  return (
    <button
      type="button"
      className={`ulab-squad-card${isSelected ? " ulab-squad-card--selected" : ""}`}
      onClick={onSelect}
      aria-pressed={isSelected}
      style={{ "--line-color": color } as React.CSSProperties}
    >
      <div className="ulab-squad-card__photo">
        {player.image ? (
          <img src={player.image} alt={playerShortName(player)} />
        ) : (
          <span className="ulab-squad-card__photo-placeholder">
            {playerShortName(player)[0]}
          </span>
        )}
        {unionValue > 0 ? (
          <span className="ulab-squad-card__uv" style={{ background: color }}>
            {unionValue}
          </span>
        ) : null}
      </div>
      <div className="ulab-squad-card__body">
        <strong className="ulab-squad-card__name">{playerShortName(player)}</strong>
        <span className="ulab-squad-card__position" style={{ color }}>
          {player.primary_position
            ? normalizePositionLabel(player.primary_position)
            : positionDisplayLabel(player.primary_position_label)}
        </span>
        <div className="ulab-squad-card__meta">
          {flag ? <span>{flag}</span> : null}
          {age ? <span>{age} años</span> : null}
        </div>
        {stats.matches > 0 ? (
          <div className="ulab-squad-card__stats">
            <span>{stats.matches} pj</span>
            <span>{stats.minutes} min</span>
            <span>{stats.goals}G</span>
            <span>{stats.assists}A</span>
          </div>
        ) : null}
        {stats.matches > 0 ? (
          <div className="ulab-squad-card__titularity">
            <div
              className="ulab-squad-card__titularity-bar"
              style={{ width: `${stats.minutesPct}%`, background: color }}
            />
            <span>{stats.minutesPct}% min.</span>
          </div>
        ) : null}
      </div>
    </button>
  );
}

// ─────────────────────────────────────────────────────────
// Panel de detalle del jugador seleccionado
// ─────────────────────────────────────────────────────────
type ULabMode = "idle" | "similar" | "compare";

function PlayerDetailPanel({
  player,
  allObjectivePlayers,
  onClose,
}: {
  player: ObjectivePlayer;
  allObjectivePlayers: ObjectivePlayer[];
  onClose: () => void;
}) {
  const [ulabMode, setULabMode] = useState<ULabMode>("idle");
  const [radarMode, setRadarMode] = useState<ObjectiveRadarMode>("specific");
  const [compareSearch, setCompareSearch] = useState("");
  const [comparePlayers, setComparePlayers] = useState<ObjectivePlayer[]>([]);

  const stats = useMemo(() => extractStats(player), [player]);
  const line = positionLine(player.primary_position || player.primary_position_label);
  const color = LINE_COLOR[line];
  const flag = countryFlag(player.birth_country_name);
  const age = player.birth_year ? new Date().getFullYear() - player.birth_year : null;

  const radarSpecific = getObjectiveRadarForMode(player, "specific");
  const radarGeneral = getObjectiveRadarForMode(player, "general");
  const activeRadar = (radarMode === "specific" ? radarSpecific : radarGeneral) || radarSpecific || radarGeneral;
  const hasRadar = !!(activeRadar && (activeRadar.params as unknown[])?.length > 0);
  const radarItems = hasRadar && activeRadar ? getObjectiveRadarItems(activeRadar) : [];
  const blockBalance = getObjectiveRadarBlockBalance(radarItems);
  const unionValue = getUnionValue(blockBalance);

  const m = (player.metrics as Record<string, unknown>) || {};

  // Todas las posiciones con su % Wyscout (excluir "No disponible")
  const positionEntries = [
    {
      raw: player.primary_position,
      label: player.primary_position_label,
      pct: m.primary_position_percent != null ? Number(m.primary_position_percent) : null,
    },
    {
      raw: player.secondary_position,
      label: player.secondary_position_label,
      pct: m.secondary_position_percent != null ? Number(m.secondary_position_percent) : null,
    },
    {
      raw: player.third_position,
      label: player.third_position_label,
      pct: m.third_position_percent != null ? Number(m.third_position_percent) : null,
    },
  ].filter((p) => p.raw && p.raw !== "No disponible");

  // Datos físicos
  const foot = player.foot;
  const height = player.height && player.height > 0 ? player.height : null;
  const weight = player.weight && player.weight > 0 ? player.weight : null;
  const footLabel = foot === "right" ? "Diestro" : foot === "left" ? "Zurdo" : foot === "both" ? "Ambidiestro" : null;

  // ── Jugadores similares ──────────────────────────────
  const similarPlayers = useMemo(() => {
    if (!activeRadar || ulabMode !== "similar") return [];
    const baseKey = player.id;
    const compKey = (activeRadar.comparison_label || "").toLowerCase();
    const compComp = (activeRadar.competition_name || "").toLowerCase();

    return allObjectivePlayers
      .filter((p) => p.id !== baseKey)
      .map((candidate) => {
        const cRadar = getObjectiveRadarForMode(candidate, radarMode);
        if (!cRadar) return null;
        if ((cRadar.comparison_label || "").toLowerCase() !== compKey) return null;
        if ((cRadar.competition_name || "").toLowerCase() !== compComp) return null;
        const sim = calculateRadarSimilarity(activeRadar, cRadar);
        if (sim === null) return null;
        const cb = getObjectiveRadarBlockBalance(getObjectiveRadarItems(cRadar));
        return { player: candidate, similarity: sim, blockBalance: cb };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 10);
  }, [activeRadar, allObjectivePlayers, player.id, radarMode, ulabMode]);

  // ── Búsqueda para comparar ───────────────────────────
  const searchResults = useMemo(() => {
    const q = compareSearch.trim().toLowerCase();
    if (q.length < 2) return [];
    return allObjectivePlayers
      .filter(
        (p) =>
          p.id !== player.id &&
          !comparePlayers.find((cp) => cp.id === p.id) &&
          ((p.full_name || "").toLowerCase().includes(q) ||
            (p.name || "").toLowerCase().includes(q) ||
            (p.current_team_name || "").toLowerCase().includes(q)),
      )
      .slice(0, 8);
  }, [allObjectivePlayers, compareSearch, comparePlayers, player.id]);

  function addComparePlayer(p: ObjectivePlayer) {
    if (comparePlayers.length >= 3) return;
    setComparePlayers((prev) => [...prev, p]);
    setCompareSearch("");
  }

  function removeComparePlayer(id: string) {
    setComparePlayers((prev) => prev.filter((p) => p.id !== id));
  }

  const compareEntries: CompareEntry[] = [
    { player, color: "#e0d200", label: playerShortName(player) },
    ...comparePlayers.map((p, i) => ({
      player: p,
      color: COMPARE_PALETTE[i],
      label: playerShortName(p),
    })),
  ];

  return (
    <aside className="ulab-detail-panel">
      <div className="ulab-detail-panel__header" style={{ borderColor: color }}>
        <div className="ulab-detail-panel__identity">
          {player.image ? (
            <img src={player.image} alt={playerShortName(player)} className="ulab-detail-panel__photo" />
          ) : null}
          <div>
            <span className="profile-kicker" style={{ color }}>
              {LINE_LABEL[line]} · {flag}
            </span>
            <h2 className="ulab-detail-panel__name">{playerShortName(player)}</h2>
            <p className="ulab-detail-panel__fullname">{player.full_name}</p>
          </div>
        </div>
        <button className="ulab-detail-panel__close" onClick={onClose} type="button" aria-label="Cerrar">
          ×
        </button>
      </div>

      {/* Stats rápidas */}
      <div className="ulab-detail-panel__quickstats">
        {age ? <div><strong>{age}</strong><span>años</span></div> : null}
        {stats.matches > 0 ? (
          <>
            <div><strong>{stats.matches}</strong><span>partidos</span></div>
            <div><strong>{stats.minutes}</strong><span>minutos</span></div>
            <div><strong>{stats.goals}</strong><span>goles</span></div>
            <div><strong>{stats.assists}</strong><span>asistencias</span></div>
            <div><strong>{stats.minutesPct}%</strong><span>min. disp.</span></div>
          </>
        ) : null}
        {unionValue > 0 ? (
          <div className="ulab-detail-panel__uv">
            <strong>{unionValue}</strong><span>Union Value</span>
          </div>
        ) : null}
      </div>

      {/* Posiciones + datos físicos */}
      <div className="ulab-detail-panel__physical">
        {positionEntries.length > 0 ? (
          <div className="ulab-detail-panel__positions">
            <span className="ulab-detail-panel__physical-label">Posiciones</span>
            <div className="ulab-detail-panel__pos-chips">
              {positionEntries.map((p, i) => (
                <span key={i} className={`ulab-detail-panel__pos-chip${i === 0 ? " ulab-detail-panel__pos-chip--primary" : ""}`}>
                  {/* Preferir el código raw (RCMF) → nueva etiqueta oficial;
                      si no hay código, caer al label guardado en BD */}
                  {p.raw ? normalizePositionLabel(p.raw) : positionDisplayLabel(p.label)}
                  {p.pct != null ? <em>{p.pct}%</em> : null}
                </span>
              ))}
            </div>
          </div>
        ) : null}
        <div className="ulab-detail-panel__physicals">
          {footLabel ? (
            <span title="Pie dominante">
              <i className="ulab-icon">⚽</i> {footLabel}
            </span>
          ) : null}
          {height ? (
            <span title="Altura">
              <i className="ulab-icon">📏</i> {height} cm
            </span>
          ) : null}
          {weight ? (
            <span title="Peso">
              <i className="ulab-icon">⚖️</i> {weight} kg
            </span>
          ) : null}
        </div>
      </div>

      {/* Aviso si no hay datos radar */}
      {!hasRadar ? (
        <div className="ulab-no-radar">
          <span>📊</span>
          <p>Wyscout no tiene suficientes datos de rendimiento para este jugador esta temporada. Las funciones de similares y comparación no están disponibles.</p>
        </div>
      ) : null}

      {/* CTAs — solo si hay radar */}
      {hasRadar ? (
        <div className="ulab-detail-panel__actions">
          <button
            type="button"
            className={`ulab-action-btn${ulabMode === "similar" ? " ulab-action-btn--active" : ""}`}
            onClick={() => setULabMode(ulabMode === "similar" ? "idle" : "similar")}
          >
            <span>🔍</span> Buscar similares
          </button>
          <button
            type="button"
            className={`ulab-action-btn${ulabMode === "compare" ? " ulab-action-btn--active" : ""}`}
            onClick={() => {
              setULabMode(ulabMode === "compare" ? "idle" : "compare");
              setComparePlayers([]);
            }}
          >
            <span>⚖️</span> Comparar
          </button>
        </div>
      ) : null}

      {/* Radar del jugador (modo idle y compare) */}
      {hasRadar && activeRadar && ulabMode !== "similar" ? (
        <div className="ulab-detail-panel__radar">
          {ulabMode === "compare" && comparePlayers.length > 0 ? (
            <CompareRadar entries={compareEntries} mode={radarMode} />
          ) : (
            <ObjectiveRadar
              compact
              mode={radarMode}
              onModeChange={setRadarMode}
              radar={activeRadar}
              radarSpecific={radarSpecific}
              radarGeneral={radarGeneral}
            />
          )}
        </div>
      ) : null}

      {/* Modo comparación — selector de rivales */}
      {ulabMode === "compare" ? (
        <div className="ulab-compare-panel">
          <p className="ulab-compare-panel__hint">
            Añade hasta 3 jugadores de la base de datos para comparar
          </p>
          <div className="ulab-compare-selected">
            {comparePlayers.map((p, i) => (
              <div key={p.id} className="ulab-compare-chip" style={{ borderColor: COMPARE_PALETTE[i] }}>
                <span style={{ color: COMPARE_PALETTE[i] }}>●</span>
                <strong>{playerShortName(p)}</strong>
                <small>{p.current_team_name}</small>
                <button type="button" onClick={() => removeComparePlayer(p.id)}>×</button>
              </div>
            ))}
          </div>
          {comparePlayers.length < 3 ? (
            <div className="ulab-compare-search">
              <input
                type="text"
                placeholder="Buscar jugador por nombre o equipo…"
                value={compareSearch}
                onChange={(e) => setCompareSearch(e.target.value)}
              />
              {searchResults.length > 0 ? (
                <ul className="ulab-compare-search__results">
                  {searchResults.map((p) => (
                    <li key={p.id}>
                      <button type="button" onClick={() => addComparePlayer(p)}>
                        <strong>{p.name || p.full_name}</strong>
                        <span>{p.current_team_name} · {p.primary_position_label}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}

          {/* Toggle modo del radar en comparación */}
          {comparePlayers.length > 0 ? (
            <div className="ulab-compare-mode-toggle">
              <button
                type="button"
                className={radarMode === "specific" ? "active" : ""}
                onClick={() => setRadarMode("specific")}
              >
                Posición específica
              </button>
              <button
                type="button"
                className={radarMode === "general" ? "active" : ""}
                onClick={() => setRadarMode("general")}
              >
                Posición general
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Modo similares */}
      {ulabMode === "similar" ? (
        <div className="ulab-similar-panel">
          <div className="ulab-similar-panel__head">
            <h3>Jugadores similares</h3>
            <div className="objective-radar-controls" style={{ fontSize: "0.72rem" }}>
              <button
                type="button"
                className={radarMode === "specific" ? "active" : ""}
                onClick={() => setRadarMode("specific")}
              >
                Posición específica
              </button>
              <button
                type="button"
                className={radarMode === "general" ? "active" : ""}
                onClick={() => setRadarMode("general")}
              >
                Posición general
              </button>
            </div>
          </div>
          {similarPlayers.length === 0 ? (
            <p className="ulab-similar-panel__empty">No hay datos suficientes para calcular similares en este modo.</p>
          ) : (
            <ul className="ulab-similar-list">
              {similarPlayers.map((s, i) => {
                const sAge = s.player.birth_year ? new Date().getFullYear() - s.player.birth_year : null;
                const sUV = getUnionValue(s.blockBalance);
                const simColor = s.similarity >= 85 ? "#16813a" : s.similarity >= 70 ? "#e0d200" : "#d9480f";
                return (
                  <li key={s.player.id} className="ulab-similar-item">
                    <span className="ulab-similar-item__rank">{i + 1}</span>
                    {s.player.image ? (
                      <img src={s.player.image} alt={s.player.name || ""} className="ulab-similar-item__photo" />
                    ) : (
                      <div className="ulab-similar-item__photo-placeholder" />
                    )}
                    <div className="ulab-similar-item__info">
                      <strong>{s.player.name || s.player.full_name}</strong>
                      <span>{s.player.current_team_name}</span>
                      <small>
                        {s.player.primary_position_label}
                        {sAge ? ` · ${sAge} años` : ""}
                        {sUV > 0 ? ` · UV ${sUV}` : ""}
                      </small>
                    </div>
                    <span className="ulab-similar-item__sim" style={{ color: simColor }}>
                      {s.similarity}%
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}
    </aside>
  );
}

// ─────────────────────────────────────────────────────────
// Vista principal ULab
// ─────────────────────────────────────────────────────────
export function ULabView({ objectivePlayers }: { objectivePlayers: ObjectivePlayer[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Filtrar jugadores de Unionistas
  const unionistasPlayers = useMemo(
    () =>
      objectivePlayers.filter((p) =>
        UNIONISTAS_FULL_NAMES.has(normalizeFullName(p.full_name || "")),
      ),
    [objectivePlayers],
  );

  // Agrupar por línea
  const byLine = useMemo(() => {
    const groups: Record<PositionLine, ObjectivePlayer[]> = {
      portero: [],
      defensas: [],
      centrocampistas: [],
      delanteros: [],
    };
    for (const p of unionistasPlayers) {
      groups[positionLine(p.primary_position || p.primary_position_label)].push(p);
    }
    return groups;
  }, [unionistasPlayers]);

  const selectedPlayer = useMemo(
    () => unionistasPlayers.find((p) => p.id === selectedId) ?? null,
    [selectedId, unionistasPlayers],
  );

  return (
    <section className="ulab-view">
      {/* Cabecera */}
      <div className="ulab-header">
        <div>
          <span className="profile-kicker">Análisis de plantilla</span>
          <h2>ULab</h2>
          <p>Explora la plantilla de Unionistas con datos objetivos Wyscout. Selecciona un jugador para buscar similares en 1ª RFEF o comparar perfiles.</p>
        </div>
        <div className="ulab-header__badge">
          <img src="/escudo/unionistar.png" alt="Unionistas" />
          <div>
            <strong>Unionistas CF</strong>
            <span>1ª RFEF · 2025/26</span>
          </div>
        </div>
      </div>

      <div className={`ulab-layout${selectedPlayer ? " ulab-layout--with-panel" : ""}`}>
        {/* Plantilla por líneas */}
        <div className="ulab-squad">
          {LINE_ORDER.map((line) => {
            const group = byLine[line];
            if (group.length === 0) return null;
            return (
              <div key={line} className="ulab-squad-group">
                <div className="ulab-squad-group__label" style={{ color: LINE_COLOR[line] }}>
                  <span style={{ background: LINE_COLOR[line] }} />
                  {LINE_LABEL[line]}
                  <em>{group.length}</em>
                </div>
                <div className="ulab-squad-group__cards">
                  {group.map((player) => (
                    <SquadPlayerCard
                      key={player.id}
                      player={player}
                      isSelected={selectedId === player.id}
                      onSelect={() =>
                        setSelectedId(selectedId === player.id ? null : player.id)
                      }
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* Panel de detalle */}
        {selectedPlayer ? (
          <PlayerDetailPanel
            player={selectedPlayer}
            allObjectivePlayers={objectivePlayers}
            onClose={() => setSelectedId(null)}
          />
        ) : null}
      </div>
    </section>
  );
}
