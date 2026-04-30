import { useMemo, useState, useRef } from "react";
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
// Utilidad foto: Wyscout usa "photo-not-found.png" en vez de null
// ─────────────────────────────────────────────────────────
function isRealPhoto(url: string | null | undefined): boolean {
  return !!url && !url.includes("photo-not-found");
}

// ─────────────────────────────────────────────────────────
// Config de 20 métricas para Rankings y Scatterplot
// ─────────────────────────────────────────────────────────
interface MetricConfig {
  key: string;
  label: string;
  short: string;
  getValue: (m: Record<string, unknown>) => number | null;
  decimals: number;
  isEfficiency?: boolean;
  unit?: string;
  higherIsBetter: boolean;
}

function metricsMinutes(m: Record<string, unknown>): number {
  return Number(m.minutes_on_field) || 0;
}

const METRICS_CONFIG: MetricConfig[] = [
  {
    key: "total_matches",
    label: "Partidos Jugados",
    short: "PJ",
    getValue: (m) => { const v = Number(m.total_matches); return v > 0 ? v : null; },
    decimals: 0,
    higherIsBetter: true,
  },
  {
    key: "minutes_on_field",
    label: "Minutos Disputados",
    short: "MIN",
    getValue: (m) => { const v = Number(m.minutes_on_field); return v > 0 ? v : null; },
    decimals: 0,
    higherIsBetter: true,
  },
  {
    key: "goals_total",
    label: "Goles",
    short: "G",
    getValue: (m) => {
      const min = metricsMinutes(m);
      const avg = Number(m.goals_avg);
      if (!min) return null;
      return Math.round(avg * min / 90 * 10) / 10;
    },
    decimals: 1,
    higherIsBetter: true,
  },
  {
    key: "xg_total",
    label: "xG",
    short: "xG",
    getValue: (m) => {
      const min = metricsMinutes(m);
      const avg = Number(m.xg_shot_avg);
      if (!min) return null;
      return Math.round(avg * min / 90 * 100) / 100;
    },
    decimals: 2,
    higherIsBetter: true,
  },
  {
    key: "assists_total",
    label: "Asistencias",
    short: "A",
    getValue: (m) => {
      const min = metricsMinutes(m);
      const avg = Number(m.assists_avg);
      if (!min) return null;
      return Math.round(avg * min / 90 * 10) / 10;
    },
    decimals: 1,
    higherIsBetter: true,
  },
  {
    key: "xa_total",
    label: "xA",
    short: "xA",
    getValue: (m) => {
      const min = metricsMinutes(m);
      const avg = Number(m.xg_assist_avg);
      if (!min) return null;
      return Math.round(avg * min / 90 * 100) / 100;
    },
    decimals: 2,
    higherIsBetter: true,
  },
  {
    key: "efficiency_goal",
    label: "Eficiencia Gol",
    short: "G − xG",
    getValue: (m) => {
      const min = metricsMinutes(m);
      if (!min) return null;
      const goals = Number(m.goals_avg) * min / 90;
      const xg = Number(m.xg_shot_avg) * min / 90;
      return Math.round((goals - xg) * 100) / 100;
    },
    decimals: 2,
    isEfficiency: true,
    higherIsBetter: true,
  },
  {
    key: "efficiency_assists",
    label: "Eficiencia Asistencias",
    short: "A − xA",
    getValue: (m) => {
      const min = metricsMinutes(m);
      if (!min) return null;
      const assists = Number(m.assists_avg) * min / 90;
      const xa = Number(m.xg_assist_avg) * min / 90;
      return Math.round((assists - xa) * 100) / 100;
    },
    decimals: 2,
    isEfficiency: true,
    higherIsBetter: true,
  },
  {
    key: "shots_avg",
    label: "Remates/90",
    short: "REM/90",
    getValue: (m) => { const v = Number(m.shots_avg); return v > 0 ? v : null; },
    decimals: 2,
    higherIsBetter: true,
  },
  {
    key: "xg_per_shot",
    label: "xG/Remate",
    short: "xG/REM",
    getValue: (m) => { const v = Number(m.xg_per_shot); return v > 0 ? v : null; },
    decimals: 3,
    higherIsBetter: true,
  },
  {
    key: "touch_in_box_avg",
    label: "Toques en área/90",
    short: "TOC.ÁR/90",
    getValue: (m) => { const v = Number(m.touch_in_box_avg); return v > 0 ? v : null; },
    decimals: 2,
    higherIsBetter: true,
  },
  {
    key: "passes_avg",
    label: "Pases/90",
    short: "PAS/90",
    getValue: (m) => { const v = Number(m.passes_avg); return v > 0 ? v : null; },
    decimals: 1,
    higherIsBetter: true,
  },
  {
    key: "accurate_passes_percent",
    label: "% Pases acertados",
    short: "%PAS",
    getValue: (m) => { const v = Number(m.accurate_passes_percent); return v > 0 ? v : null; },
    decimals: 1,
    unit: "%",
    higherIsBetter: true,
  },
  {
    key: "progressive_pass_avg",
    label: "Pases prog./90",
    short: "PAS.PROG/90",
    getValue: (m) => { const v = Number(m.progressive_pass_avg); return v > 0 ? v : null; },
    decimals: 2,
    higherIsBetter: true,
  },
  {
    key: "progressive_run_avg",
    label: "Conducciones prog./90",
    short: "COND.PROG/90",
    getValue: (m) => { const v = Number(m.progressive_run_avg); return v > 0 ? v : null; },
    decimals: 2,
    higherIsBetter: true,
  },
  {
    key: "dribbles_avg",
    label: "Regates/90",
    short: "REG/90",
    getValue: (m) => { const v = Number(m.dribbles_avg); return v > 0 ? v : null; },
    decimals: 2,
    higherIsBetter: true,
  },
  {
    key: "duels_avg",
    label: "Duelos/90",
    short: "DUE/90",
    getValue: (m) => { const v = Number(m.duels_avg); return v > 0 ? v : null; },
    decimals: 1,
    higherIsBetter: true,
  },
  {
    key: "duels_won",
    label: "% Duelos ganados",
    short: "%DUE",
    getValue: (m) => { const v = Number(m.duels_won); return v > 0 ? v : null; },
    decimals: 1,
    unit: "%",
    higherIsBetter: true,
  },
  {
    key: "successful_defensive_actions_avg",
    label: "Acc. Defensivas/90",
    short: "ACC.DEF/90",
    getValue: (m) => { const v = Number(m.successful_defensive_actions_avg); return v > 0 ? v : null; },
    decimals: 2,
    higherIsBetter: true,
  },
  {
    key: "interceptions_avg",
    label: "Intercepciones/90",
    short: "INT/90",
    getValue: (m) => { const v = Number(m.interceptions_avg); return v > 0 ? v : null; },
    decimals: 2,
    higherIsBetter: true,
  },
];

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
        {isRealPhoto(player.image) ? (
          <img src={player.image!} alt={playerShortName(player)} />
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
          {isRealPhoto(player.image) ? (
            <img src={player.image!} alt={playerShortName(player)} className="ulab-detail-panel__photo" />
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
                    {isRealPhoto(s.player.image) ? (
                      <img src={s.player.image!} alt={s.player.name || ""} className="ulab-similar-item__photo" />
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
// Rankings de plantilla
// ─────────────────────────────────────────────────────────
function RankingsSection({ players }: { players: ObjectivePlayer[] }) {
  return (
    <div className="ulab-rankings">
      <h3 className="ulab-section-title">Rankings de plantilla</h3>
      <div className="ulab-rankings-grid">
        {METRICS_CONFIG.map((metric) => {
          const rows = players
            .map((p) => {
              const mObj = (p.metrics as Record<string, unknown>) || {};
              const val = metric.getValue(mObj);
              return val !== null ? { player: p, value: val } : null;
            })
            .filter((x): x is NonNullable<typeof x> => x !== null)
            .sort((a, b) => metric.higherIsBetter ? b.value - a.value : a.value - b.value);

          if (rows.length === 0) return null;

          const best = rows[0].value;
          const worst = rows[rows.length - 1].value;
          const range = best - worst || 1;

          return (
            <div key={metric.key} className="ulab-ranking-card">
              <div className="ulab-ranking-card__title">{metric.label}</div>
              <ul className="ulab-ranking-list">
                {rows.map((row, i) => {
                  const barPct = metric.higherIsBetter
                    ? ((row.value - worst) / range) * 100
                    : ((best - row.value) / range) * 100;

                  const isPos = metric.isEfficiency && row.value > 0;
                  const isNeg = metric.isEfficiency && row.value < 0;
                  const valColor = isPos ? "#16813a" : isNeg ? "#d9480f" : undefined;
                  const barColor = isPos ? "#16813a" : isNeg ? "#d9480f" : "#e0d200";
                  const sign = isPos ? "+" : "";
                  const displayVal = `${sign}${row.value.toFixed(metric.decimals)}${metric.unit ?? ""}`;

                  return (
                    <li key={row.player.id} className="ulab-ranking-row">
                      <span className="ulab-ranking-row__rank">{i + 1}</span>
                      {isRealPhoto(row.player.image) ? (
                        <img src={row.player.image!} alt="" className="ulab-ranking-row__photo" />
                      ) : (
                        <span className="ulab-ranking-row__photo-ph">
                          {playerShortName(row.player)[0]}
                        </span>
                      )}
                      <span className="ulab-ranking-row__name">{playerShortName(row.player)}</span>
                      <div className="ulab-ranking-row__bar-wrap">
                        <div
                          className="ulab-ranking-row__bar"
                          style={{ width: `${barPct}%`, background: barColor }}
                        />
                      </div>
                      <span className="ulab-ranking-row__val" style={{ color: valColor }}>
                        {displayVal}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// Scatterplot de plantilla
// ─────────────────────────────────────────────────────────
interface ScatterPoint {
  player: ObjectivePlayer;
  x: number;
  y: number;
}

interface ScatterTooltip {
  svgX: number;
  svgY: number;
  player: ObjectivePlayer;
  xVal: number;
  yVal: number;
}

const SCATTER_PAD = { top: 32, right: 24, bottom: 48, left: 52 };
const SCATTER_W = 600;
const SCATTER_H = 420;
const PLOT_W = SCATTER_W - SCATTER_PAD.left - SCATTER_PAD.right;
const PLOT_H = SCATTER_H - SCATTER_PAD.top - SCATTER_PAD.bottom;

function ScatterPlot({ players }: { players: ObjectivePlayer[] }) {
  const [xKey, setXKey] = useState(METRICS_CONFIG[2].key); // Goles
  const [yKey, setYKey] = useState(METRICS_CONFIG[3].key); // xG
  const [tooltip, setTooltip] = useState<ScatterTooltip | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const xConfig = METRICS_CONFIG.find((m) => m.key === xKey) ?? METRICS_CONFIG[2];
  const yConfig = METRICS_CONFIG.find((m) => m.key === yKey) ?? METRICS_CONFIG[3];

  const plotData = useMemo<ScatterPoint[]>(() => {
    return players
      .map((p) => {
        const mObj = (p.metrics as Record<string, unknown>) || {};
        const x = xConfig.getValue(mObj);
        const y = yConfig.getValue(mObj);
        if (x === null || y === null) return null;
        return { player: p, x, y };
      })
      .filter((d): d is ScatterPoint => d !== null);
  }, [players, xConfig, yConfig]);

  const xs = plotData.map((d) => d.x);
  const ys = plotData.map((d) => d.y);
  const xMin = xs.length ? Math.min(...xs) : 0;
  const xMax = xs.length ? Math.max(...xs) : 1;
  const yMin = ys.length ? Math.min(...ys) : 0;
  const yMax = ys.length ? Math.max(...ys) : 1;
  const xMean = xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
  const yMean = ys.length ? ys.reduce((a, b) => a + b, 0) / ys.length : 0;

  // Padding around data extremes so dots don't sit on axes
  const xPad = (xMax - xMin) * 0.1 || 0.5;
  const yPad = (yMax - yMin) * 0.1 || 0.5;
  const xLo = xMin - xPad;
  const xHi = xMax + xPad;
  const yLo = yMin - yPad;
  const yHi = yMax + yPad;

  function toSvgX(v: number) { return SCATTER_PAD.left + ((v - xLo) / (xHi - xLo)) * PLOT_W; }
  function toSvgY(v: number) { return SCATTER_PAD.top + PLOT_H - ((v - yLo) / (yHi - yLo)) * PLOT_H; }

  const meanSvgX = toSvgX(xMean);
  const meanSvgY = toSvgY(yMean);

  // Axis ticks (up to 5)
  function niceSteps(lo: number, hi: number, n = 5) {
    const raw = (hi - lo) / n;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const nice = [1, 2, 2.5, 5, 10].map((f) => f * mag).find((s) => s >= raw) ?? raw;
    const start = Math.ceil(lo / nice) * nice;
    const ticks: number[] = [];
    for (let t = start; t <= hi + 1e-9; t += nice) ticks.push(Math.round(t * 1000) / 1000);
    return ticks;
  }
  const xTicks = niceSteps(xLo, xHi);
  const yTicks = niceSteps(yLo, yHi);

  return (
    <div className="ulab-scatter">
      <div className="ulab-scatter__header">
        <h3 className="ulab-section-title">Dispersión de plantilla</h3>
        <div className="ulab-scatter__selectors">
          <label>
            <span>Eje X</span>
            <select value={xKey} onChange={(e) => { setXKey(e.target.value); setTooltip(null); }}>
              {METRICS_CONFIG.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
            </select>
          </label>
          <label>
            <span>Eje Y</span>
            <select value={yKey} onChange={(e) => { setYKey(e.target.value); setTooltip(null); }}>
              {METRICS_CONFIG.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
            </select>
          </label>
        </div>
      </div>

      <div className="ulab-scatter__wrap" onMouseLeave={() => setTooltip(null)}>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${SCATTER_W} ${SCATTER_H}`}
          className="ulab-scatter__svg"
          aria-label="Scatter de plantilla"
        >
          {/* Plot background */}
          <rect
            x={SCATTER_PAD.left} y={SCATTER_PAD.top}
            width={PLOT_W} height={PLOT_H}
            fill="rgba(255,255,255,0.03)" rx={4}
          />

          {/* Horizontal grid lines */}
          {yTicks.map((t) => {
            const sy = toSvgY(t);
            return sy >= SCATTER_PAD.top - 2 && sy <= SCATTER_PAD.top + PLOT_H + 2 ? (
              <line key={`yg-${t}`}
                x1={SCATTER_PAD.left} y1={sy} x2={SCATTER_PAD.left + PLOT_W} y2={sy}
                stroke="rgba(255,255,255,0.06)" strokeWidth={1}
              />
            ) : null;
          })}

          {/* Vertical grid lines */}
          {xTicks.map((t) => {
            const sx = toSvgX(t);
            return sx >= SCATTER_PAD.left - 2 && sx <= SCATTER_PAD.left + PLOT_W + 2 ? (
              <line key={`xg-${t}`}
                x1={sx} y1={SCATTER_PAD.top} x2={sx} y2={SCATTER_PAD.top + PLOT_H}
                stroke="rgba(255,255,255,0.06)" strokeWidth={1}
              />
            ) : null;
          })}

          {/* X axis ticks + labels */}
          {xTicks.map((t) => {
            const sx = toSvgX(t);
            return sx >= SCATTER_PAD.left - 2 && sx <= SCATTER_PAD.left + PLOT_W + 2 ? (
              <g key={`xt-${t}`}>
                <line x1={sx} y1={SCATTER_PAD.top + PLOT_H} x2={sx} y2={SCATTER_PAD.top + PLOT_H + 5} stroke="#666" strokeWidth={1} />
                <text x={sx} y={SCATTER_PAD.top + PLOT_H + 18} textAnchor="middle" fontSize={10} fill="#777">
                  {t.toFixed(xConfig.decimals <= 1 ? 0 : 1)}
                </text>
              </g>
            ) : null;
          })}

          {/* Y axis ticks + labels */}
          {yTicks.map((t) => {
            const sy = toSvgY(t);
            return sy >= SCATTER_PAD.top - 2 && sy <= SCATTER_PAD.top + PLOT_H + 2 ? (
              <g key={`yt-${t}`}>
                <line x1={SCATTER_PAD.left - 5} y1={sy} x2={SCATTER_PAD.left} y2={sy} stroke="#666" strokeWidth={1} />
                <text x={SCATTER_PAD.left - 8} y={sy} textAnchor="end" dominantBaseline="middle" fontSize={10} fill="#777">
                  {t.toFixed(yConfig.decimals <= 1 ? 0 : 1)}
                </text>
              </g>
            ) : null;
          })}

          {/* Axis labels */}
          <text
            x={SCATTER_PAD.left + PLOT_W / 2}
            y={SCATTER_H - 4}
            textAnchor="middle" fontSize={11} fill="#aaa" fontWeight={600}
          >
            {xConfig.label}
          </text>
          <text
            x={14}
            y={SCATTER_PAD.top + PLOT_H / 2}
            textAnchor="middle" fontSize={11} fill="#aaa" fontWeight={600}
            transform={`rotate(-90, 14, ${SCATTER_PAD.top + PLOT_H / 2})`}
          >
            {yConfig.label}
          </text>

          {/* Mean lines (dashed gray) */}
          <line
            x1={meanSvgX} y1={SCATTER_PAD.top}
            x2={meanSvgX} y2={SCATTER_PAD.top + PLOT_H}
            stroke="#555" strokeWidth={1.5} strokeDasharray="5 4"
          />
          <line
            x1={SCATTER_PAD.left} y1={meanSvgY}
            x2={SCATTER_PAD.left + PLOT_W} y2={meanSvgY}
            stroke="#555" strokeWidth={1.5} strokeDasharray="5 4"
          />
          <text x={meanSvgX + 4} y={SCATTER_PAD.top + 10} fontSize={9} fill="#666">media</text>
          <text x={SCATTER_PAD.left + 4} y={meanSvgY - 5} fontSize={9} fill="#666">media</text>

          {/* Dots */}
          {plotData.map((d) => {
            const cx = toSvgX(d.x);
            const cy = toSvgY(d.y);
            const line = positionLine(d.player.primary_position || d.player.primary_position_label);
            const dotColor = LINE_COLOR[line];
            const isActive = tooltip?.player.id === d.player.id;
            return (
              <g
                key={d.player.id}
                style={{ cursor: "pointer" }}
                onMouseEnter={() => setTooltip({ svgX: cx, svgY: cy, player: d.player, xVal: d.x, yVal: d.y })}
              >
                <circle
                  cx={cx} cy={cy} r={isActive ? 10 : 7}
                  fill={dotColor} fillOpacity={isActive ? 1 : 0.8}
                  stroke={isActive ? "#fff" : "#1a1a1a"} strokeWidth={isActive ? 2 : 1}
                />
                <text
                  x={cx} y={cy - 11}
                  textAnchor="middle" fontSize={9} fill="#ddd"
                  paintOrder="stroke" stroke="#111" strokeWidth={2}
                >
                  {playerShortName(d.player)}
                </text>
              </g>
            );
          })}
        </svg>

        {/* Leyenda líneas */}
        <div className="ulab-scatter__legend">
          {(Object.entries(LINE_COLOR) as [PositionLine, string][]).map(([line, color]) => (
            <span key={line} className="ulab-scatter__legend-item">
              <i style={{ background: color }} />
              {LINE_LABEL[line]}
            </span>
          ))}
          <span className="ulab-scatter__legend-item ulab-scatter__legend-item--mean">
            <i />
            Media equipo
          </span>
        </div>

        {/* Tooltip */}
        {tooltip ? (
          <div
            className="ulab-scatter__tooltip"
            style={{
              left: `calc(${(tooltip.svgX / SCATTER_W) * 100}% + 14px)`,
              top: `calc(${(tooltip.svgY / SCATTER_H) * 100}% - 28px)`,
            }}
          >
            <strong>{playerShortName(tooltip.player)}</strong>
            <span>{xConfig.short}: <b>{tooltip.xVal.toFixed(xConfig.decimals)}{xConfig.unit ?? ""}</b></span>
            <span>{yConfig.short}: <b>{tooltip.yVal.toFixed(yConfig.decimals)}{yConfig.unit ?? ""}</b></span>
          </div>
        ) : null}
      </div>
    </div>
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

      {/* Rankings */}
      <RankingsSection players={unionistasPlayers} />

      {/* Scatter */}
      <ScatterPlot players={unionistasPlayers} />
    </section>
  );
}
