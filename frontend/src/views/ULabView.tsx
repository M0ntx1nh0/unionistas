import { useEffect, useMemo, useRef, useState } from "react";
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
  "extremo izquierdo": "delanteros",
  "extremo derecho": "delanteros",
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
  lw: "delanteros",
  rw: "delanteros",
  lwf: "delanteros",
  rwf: "delanteros",
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
type GlossaryFamily = "laterales" | "centrales" | "centrocampistas" | "delanteros" | "extremos";

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

const PROFILE_LABEL_ES: Record<string, string> = {
  "Attacking FB": "Lateral ofensivo",
  "Inverted FB": "Lateral interior",
  "Defensive FB": "Lateral defensivo",
  "Ball playing CB": "Central constructor",
  "Defensive CB": "Central defensivo",
  "Fast CB": "Central veloz",
  Pivot: "Pivote",
  "Midfield Creator": "Mediocentro creador",
  "Box to Box": "Box to Box",
  "Attacking Mid Creator": "Mediapunta-asistente",
  "Second Striker": "Segundo punta",
  "Target Man": "Delantero referencia",
  "Advanced Striker": "Delantero profundo",
  "Creative Winger": "Extremo creador",
  "Traditional Winger": "Extremo clásico",
  "Inside Forward": "Extremo finalizador",
};

const PRIMARY_LATERAL_CODES = new Set(["LB", "RB", "LWB", "RWB"]);
const PRIMARY_CENTER_BACK_CODES = new Set(["CB", "LCB", "RCB"]);
const PRIMARY_MIDFIELD_CODES = new Set(["DMF", "LDMF", "RDMF", "CMF", "LCMF", "RCMF", "AMF", "LAMF", "RAMF"]);
const PRIMARY_STRIKER_CODES = new Set(["CF", "SS"]);
const PRIMARY_WINGER_CODES = new Set(["LW", "RW", "LWF", "RWF"]);

function profileLabelEs(profile: string | null | undefined): string | null {
  if (!profile) return null;
  return PROFILE_LABEL_ES[profile] || profile;
}

function isPrimaryLateralPlayer(player: ObjectivePlayer): boolean {
  const code = (player.primary_position || "").trim().toUpperCase();
  if (PRIMARY_LATERAL_CODES.has(code)) return true;
  const label = (player.primary_position_label || "").toLowerCase();
  return label.includes("lateral") || label.includes("carrilero");
}

function isPrimaryCenterBackPlayer(player: ObjectivePlayer): boolean {
  const code = (player.primary_position || "").trim().toUpperCase();
  if (PRIMARY_CENTER_BACK_CODES.has(code)) return true;
  const label = (player.primary_position_label || "").toLowerCase();
  return label.includes("central");
}

function isPrimaryMidfielderPlayer(player: ObjectivePlayer): boolean {
  const code = (player.primary_position || "").trim().toUpperCase();
  if (PRIMARY_MIDFIELD_CODES.has(code)) return true;
  const label = (player.primary_position_label || "").toLowerCase();
  return label.includes("mediocampista") || label.includes("mediocentro") || label.includes("mediapunta");
}

function isPrimaryStrikerPlayer(player: ObjectivePlayer): boolean {
  const code = (player.primary_position || "").trim().toUpperCase();
  if (PRIMARY_STRIKER_CODES.has(code)) return true;
  const label = (player.primary_position_label || "").toLowerCase();
  return label.includes("delantero") || label.includes("segunda punta");
}

function isPrimaryWingerPlayer(player: ObjectivePlayer): boolean {
  const code = (player.primary_position || "").trim().toUpperCase();
  if (PRIMARY_WINGER_CODES.has(code)) return true;
  const label = (player.primary_position_label || "").toLowerCase();
  return label.includes("extremo");
}

function supportsProfileBadge(player: ObjectivePlayer): boolean {
  if (player.profile_family === "Laterales") return isPrimaryLateralPlayer(player);
  if (player.profile_family === "Centrales") return isPrimaryCenterBackPlayer(player);
  if (player.profile_family === "Centrocampistas") return isPrimaryMidfielderPlayer(player);
  if (player.profile_family === "Delanteros") return isPrimaryStrikerPlayer(player);
  if (player.profile_family === "Extremos") return isPrimaryWingerPlayer(player);
  return false;
}

function playerPrimaryProfileBadge(player: ObjectivePlayer): string | null {
  if (!supportsProfileBadge(player)) return null;
  return profileLabelEs(player.primary_profile);
}

function playerProfileBadges(player: ObjectivePlayer): string[] {
  if (!supportsProfileBadge(player)) return [];
  const primary = profileLabelEs(player.primary_profile);
  const secondary = profileLabelEs(player.secondary_profile);
  return [primary, secondary].filter((value): value is string => Boolean(value));
}

function lateralProfileDistribution(player: ObjectivePlayer) {
  if (player.profile_family !== "Laterales" || !supportsProfileBadge(player)) return [];
  const scoreMap = ((player.profile_score_map as Record<string, unknown> | null) || {});
  const entries = [
    { key: "Attacking FB", label: "Lateral ofensivo", value: Number(scoreMap["Attacking FB"]) || 0 },
    { key: "Inverted FB", label: "Lateral interior", value: Number(scoreMap["Inverted FB"]) || 0 },
    { key: "Defensive FB", label: "Lateral defensivo", value: Number(scoreMap["Defensive FB"]) || 0 },
  ];
  const total = entries.reduce((sum, entry) => sum + Math.max(0, entry.value), 0);
  return entries
    .map((entry) => ({
      ...entry,
      percent: total > 0 ? Math.round((Math.max(0, entry.value) / total) * 100) : 0,
    }))
    .sort((a, b) => b.percent - a.percent || b.value - a.value);
}

function centerBackProfileDistribution(player: ObjectivePlayer) {
  if (player.profile_family !== "Centrales" || !supportsProfileBadge(player)) return [];
  const scoreMap = ((player.profile_score_map as Record<string, unknown> | null) || {});
  const entries = [
    { key: "Ball playing CB", label: "Central constructor", value: Number(scoreMap["Ball playing CB"]) || 0 },
    { key: "Defensive CB", label: "Central defensivo", value: Number(scoreMap["Defensive CB"]) || 0 },
    { key: "Fast CB", label: "Central veloz", value: Number(scoreMap["Fast CB"]) || 0 },
  ];
  const total = entries.reduce((sum, entry) => sum + Math.max(0, entry.value), 0);
  return entries
    .map((entry) => ({
      ...entry,
      percent: total > 0 ? Math.round((Math.max(0, entry.value) / total) * 100) : 0,
    }))
    .sort((a, b) => b.percent - a.percent || b.value - a.value);
}

function midfieldProfileDistribution(player: ObjectivePlayer) {
  if (player.profile_family !== "Centrocampistas" || !supportsProfileBadge(player)) return [];
  const scoreMap = ((player.profile_score_map as Record<string, unknown> | null) || {});
  const allEntries = [
    { key: "Pivot", label: "Pivote", value: Number(scoreMap["Pivot"]) || 0 },
    { key: "Midfield Creator", label: "Mediocentro creador", value: Number(scoreMap["Midfield Creator"]) || 0 },
    { key: "Attacking Mid Creator", label: "Mediapunta-asistente", value: Number(scoreMap["Attacking Mid Creator"]) || 0 },
    { key: "Box to Box", label: "Box to Box", value: Number(scoreMap["Box to Box"]) || 0 },
  ];
  const primaryCode = (player.primary_position || "").trim().toUpperCase();
  const allowedByPosition: Record<string, string[]> = {
    DMF: ["Pivot", "Midfield Creator", "Box to Box"],
    LDMF: ["Pivot", "Midfield Creator", "Box to Box"],
    RDMF: ["Pivot", "Midfield Creator", "Box to Box"],
    CMF: ["Midfield Creator", "Box to Box", "Pivot"],
    LCMF: ["Midfield Creator", "Box to Box", "Pivot"],
    RCMF: ["Midfield Creator", "Box to Box", "Pivot"],
    AMF: ["Attacking Mid Creator", "Box to Box"],
    LAMF: ["Attacking Mid Creator", "Box to Box"],
    RAMF: ["Attacking Mid Creator", "Box to Box"],
  };
  const allowedKeys = allowedByPosition[primaryCode] || allEntries.map((entry) => entry.key);
  const entries = allEntries.filter((entry) => allowedKeys.includes(entry.key));
  const total = entries.reduce((sum, entry) => sum + Math.max(0, entry.value), 0);
  return entries
    .map((entry) => ({
      ...entry,
      percent: total > 0 ? Math.round((Math.max(0, entry.value) / total) * 100) : 0,
    }))
    .sort((a, b) => b.percent - a.percent || b.value - a.value);
}

function strikerProfileDistribution(player: ObjectivePlayer) {
  if (player.profile_family !== "Delanteros" || !supportsProfileBadge(player)) return [];
  const scoreMap = ((player.profile_score_map as Record<string, unknown> | null) || {});
  const entries = [
    { key: "Second Striker", label: "Segundo punta", value: Number(scoreMap["Second Striker"]) || 0 },
    { key: "Target Man", label: "Delantero referencia", value: Number(scoreMap["Target Man"]) || 0 },
    { key: "Advanced Striker", label: "Delantero profundo", value: Number(scoreMap["Advanced Striker"]) || 0 },
  ];
  const total = entries.reduce((sum, entry) => sum + Math.max(0, entry.value), 0);
  return entries
    .map((entry) => ({
      ...entry,
      percent: total > 0 ? Math.round((Math.max(0, entry.value) / total) * 100) : 0,
    }))
    .sort((a, b) => b.percent - a.percent || b.value - a.value);
}

function wingerProfileDistribution(player: ObjectivePlayer) {
  if (player.profile_family !== "Extremos" || !supportsProfileBadge(player)) return [];
  const scoreMap = ((player.profile_score_map as Record<string, unknown> | null) || {});
  const entries = [
    { key: "Traditional Winger", label: "Extremo clásico", value: Number(scoreMap["Traditional Winger"]) || 0 },
    { key: "Creative Winger", label: "Extremo creador", value: Number(scoreMap["Creative Winger"]) || 0 },
    { key: "Inside Forward", label: "Extremo finalizador", value: Number(scoreMap["Inside Forward"]) || 0 },
  ];
  const total = entries.reduce((sum, entry) => sum + Math.max(0, entry.value), 0);
  return entries
    .map((entry) => ({
      ...entry,
      percent: total > 0 ? Math.round((Math.max(0, entry.value) / total) * 100) : 0,
    }))
    .sort((a, b) => b.percent - a.percent || b.value - a.value);
}

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
  /** % de minutos disputados respecto al jugador con más minutos de la muestra */
  minutesPct: number;
}

function getMaxMinutes(players: ObjectivePlayer[]): number {
  return players.reduce((maxMinutes, currentPlayer) => {
    const metrics = (currentPlayer.metrics as Record<string, unknown>) || {};
    const minutes = Number(metrics.minutes_on_field) || 0;
    return Math.max(maxMinutes, minutes);
  }, 0);
}

function extractStats(player: ObjectivePlayer, maxMinutesReference = 0): RawStats {
  const m = (player.metrics as Record<string, unknown>) || {};
  const matches = Number(m.total_matches) || 0;
  const minutes = Number(m.minutes_on_field) || 0;
  const goalsAvg = Number(m.goals_avg) || 0;
  const assistsAvg = Number(m.assists_avg) || 0;
  const goals = minutes > 0 ? Math.round(goalsAvg * minutes / 90) : 0;
  const assists = minutes > 0 ? Math.round(assistsAvg * minutes / 90) : 0;
  const minutesPct =
    maxMinutesReference > 0 ? Math.min(100, Math.round((minutes / maxMinutesReference) * 100)) : 0;
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
const COMPARE_PALETTE = ["#3b82f6", "#d9480f", "#16813a"];

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

function overlayPolarPoint(center: number, radius: number, angle: number, value: number) {
  const scaledRadius = radius * Math.max(0, Math.min(100, value)) / 100;
  return {
    x: center + scaledRadius * Math.cos(angle),
    y: center + scaledRadius * Math.sin(angle),
  };
}

function overlayBuildRadarPoints(values: number[], center: number, radius: number) {
  const total = values.length;
  const points = values.map((value, index) => {
    const angle = -Math.PI / 2 + (index * Math.PI * 2) / total;
    const point = overlayPolarPoint(center, radius, angle, value);
    return `${point.x.toFixed(1)},${point.y.toFixed(1)}`;
  });

  return points.join(" ");
}

function overlayBuildRadarPointList(values: number[], center: number, radius: number) {
  const total = values.length;
  return values.map((value, index) => {
    const angle = -Math.PI / 2 + (index * Math.PI * 2) / total;
    return {
      angle,
      ...overlayPolarPoint(center, radius, angle, value),
    };
  });
}

function overlaySplitRadarLabel(value: string) {
  const label = formatLabel(value);
  if (label.length <= 13) return [label];
  const parts = label.split(" ");
  const lines: string[] = [];
  let current = "";

  for (const part of parts) {
    const candidate = current ? `${current} ${part}` : part;
    if (candidate.length > 13 && current) {
      lines.push(current);
      current = part;
    } else {
      current = candidate;
    }
  }

  if (current) lines.push(current);
  return lines;
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

function normalizeRadarKey(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLocaleLowerCase("es");
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

function buildSharedRadarSeries(baseRadar: ReturnType<typeof getObjectiveRadarForMode>, candidateRadar: ReturnType<typeof getObjectiveRadarForMode>) {
  if (!baseRadar || !candidateRadar) return null;

  const baseItems = getObjectiveRadarItems(baseRadar);
  const candidateItems = getObjectiveRadarItems(candidateRadar);
  const candidateValues = new Map(candidateItems.map((item) => [normalizeRadarKey(item.label), item]));
  const sharedItems = baseItems
    .map((baseItem) => {
      const candidateItem = candidateValues.get(normalizeRadarKey(baseItem.label));
      if (!candidateItem) return null;
      return {
        label: baseItem.label,
        baseValue: baseItem.value,
        candidateValue: candidateItem.value,
        candidateColor: candidateItem.color,
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  if (sharedItems.length < 3) return null;

  return {
    labels: sharedItems.map((item) => item.label),
    baseValues: sharedItems.map((item) => item.baseValue),
    candidateValues: sharedItems.map((item) => item.candidateValue),
    candidateColors: sharedItems.map((item) => item.candidateColor),
  };
}

function SimilarOverlayRadar({
  baseRadar,
  candidateRadar,
}: {
  baseRadar: ReturnType<typeof getObjectiveRadarForMode>;
  candidateRadar: ReturnType<typeof getObjectiveRadarForMode>;
}) {
  const shared = buildSharedRadarSeries(baseRadar, candidateRadar);
  if (!shared) return null;

  const center = 170;
  const radius = 100;
  const labelRadius = 136;
  const gridLevels = [25, 50, 75, 100];
  const labelPoints = overlayBuildRadarPointList(new Array(shared.labels.length).fill(100), center, labelRadius);
  const valuePoints = overlayBuildRadarPointList(shared.candidateValues, center, radius + 8);
  const basePoints = overlayBuildRadarPointList(shared.baseValues, center, radius);

  return (
    <div className="objective-radar-card objective-radar-card--compact ulab-similar-overlay-radar-card">
      <div className="objective-radar-card__head">
        <div>
          <span className="profile-kicker">Radar Wyscout</span>
          <h3>Percentiles por rol</h3>
        </div>
      </div>
      <div className="objective-radar-layout objective-radar-layout--compact">
        <svg aria-label="Radar comparado con Unionistas" className="objective-radar" viewBox="0 0 340 340">
          {gridLevels.map((level) => (
            <polygon
              className="objective-radar__grid"
              key={level}
              points={overlayBuildRadarPoints(new Array(shared.labels.length).fill(level), center, radius)}
            />
          ))}
          {shared.labels.map((label, index) => {
            const angle = -Math.PI / 2 + (index * Math.PI * 2) / shared.labels.length;
            const valuePoint = valuePoints[index];
            const labelPoint = labelPoints[index];
            const labelLines = overlaySplitRadarLabel(label);
            const anchor = labelPoint.x < center - 8 ? "end" : labelPoint.x > center + 8 ? "start" : "middle";
            return (
              <g key={`${label}-${index}`}>
                <line
                  className="objective-radar__axis"
                  x1={center}
                  x2={overlayPolarPoint(center, radius, angle, 100).x}
                  y1={center}
                  y2={overlayPolarPoint(center, radius, angle, 100).y}
                />
                <text
                  className="objective-radar__metric-label"
                  textAnchor={anchor}
                  x={labelPoint.x}
                  y={labelPoint.y}
                >
                  {labelLines.map((line: string, lineIndex: number) => (
                    <tspan dy={lineIndex === 0 ? 0 : 10} key={`${label}-${line}`} x={labelPoint.x}>
                      {line}
                    </tspan>
                  ))}
                </text>
                <circle
                  cx={valuePoint.x}
                  cy={valuePoint.y}
                  fill={shared.candidateColors[index] || "#16813a"}
                  r="3.5"
                />
                <text
                  className="objective-radar__value-label"
                  textAnchor="middle"
                  x={valuePoint.x}
                  y={valuePoint.y - 7}
                >
                  {shared.candidateValues[index] || 0}
                </text>
              </g>
            );
          })}
          <polygon className="objective-radar__area" points={overlayBuildRadarPoints(shared.candidateValues, center, radius)} />
          <polygon className="objective-radar__stroke" points={overlayBuildRadarPoints(shared.candidateValues, center, radius)} />
          <polygon
            className="ulab-similar-overlay-radar__reference"
            points={overlayBuildRadarPoints(shared.baseValues, center, radius)}
          />
          {basePoints.map((point, index) => (
            <g key={`reference-point-${shared.labels[index]}-${index}`}>
              <line
                className="ulab-similar-overlay-radar__reference-mark"
                x1={point.x - 2.4}
                x2={point.x + 2.4}
                y1={point.y - 2.4}
                y2={point.y + 2.4}
              />
              <line
                className="ulab-similar-overlay-radar__reference-mark"
                x1={point.x - 2.4}
                x2={point.x + 2.4}
                y1={point.y + 2.4}
                y2={point.y - 2.4}
              />
            </g>
          ))}
        </svg>
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
  maxMinutesReference,
  isSelected,
  onSelect,
}: {
  player: ObjectivePlayer;
  maxMinutesReference: number;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const stats = useMemo(
    () => extractStats(player, maxMinutesReference),
    [maxMinutesReference, player],
  );
  const line = positionLine(player.primary_position || player.primary_position_label);
  const color = LINE_COLOR[line];
  const flag = countryFlag(player.birth_country_name);
  const age = player.birth_year ? new Date().getFullYear() - player.birth_year : null;
  const radar = getObjectiveRadarForMode(player, "specific") || getObjectiveRadarForMode(player, "general");
  const radarItems = radar ? getObjectiveRadarItems(radar) : [];
  const blockBalance = getObjectiveRadarBlockBalance(radarItems);
  const unionValue = getUnionValue(blockBalance);
  const profileBadge = playerPrimaryProfileBadge(player);

  return (
    <button
      type="button"
      className={`ulab-squad-card${isSelected ? " ulab-squad-card--selected" : ""}`}
      onClick={onSelect}
      aria-pressed={isSelected}
      style={{ "--line-color": color } as React.CSSProperties}
    >
      <span className="ulab-squad-card__crest" aria-hidden="true">
        <img src="/escudo/unionistar.png" alt="" />
      </span>
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
        {profileBadge ? (
          <span className="ulab-squad-card__profile-badge" title={profileBadge}>
            {profileBadge}
          </span>
        ) : null}
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
            <span>{stats.minutesPct}% min. máx.</span>
          </div>
        ) : null}
      </div>
    </button>
  );
}

// ─────────────────────────────────────────────────────────
// Panel de detalle del jugador seleccionado
// ─────────────────────────────────────────────────────────
type ULabMode = "radar" | "similar" | "compare" | "ranking";

function PlayerDetailPanel({
  player,
  allObjectivePlayers,
  squadPlayers,
  maxMinutesReference,
  onClose,
}: {
  player: ObjectivePlayer;
  allObjectivePlayers: ObjectivePlayer[];
  squadPlayers: ObjectivePlayer[];
  maxMinutesReference: number;
  onClose: () => void;
}) {
  const [ulabMode, setULabMode] = useState<ULabMode>("radar");
  const [radarMode, setRadarMode] = useState<ObjectiveRadarMode>("specific");
  const [compareSearch, setCompareSearch] = useState("");
  const [comparePlayers, setComparePlayers] = useState<ObjectivePlayer[]>([]);
  const [expandedSimilarPlayerId, setExpandedSimilarPlayerId] = useState<string | null>(null);

  const stats = useMemo(
    () => extractStats(player, maxMinutesReference),
    [maxMinutesReference, player],
  );
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
  const rankedRadarItems = [...radarItems].sort((a, b) => b.value - a.value);
  const radarStrengths = rankedRadarItems.slice(0, 3);
  const radarAlerts = [...radarItems].sort((a, b) => a.value - b.value).slice(0, 3);

  useEffect(() => {
    if (!hasRadar && ulabMode !== "ranking") {
      setULabMode("ranking");
    }
    if (hasRadar && ulabMode === "radar") {
      return;
    }
  }, [hasRadar, ulabMode]);

  useEffect(() => {
    if (ulabMode !== "compare" && comparePlayers.length > 0) {
      setComparePlayers([]);
      setCompareSearch("");
    }
  }, [comparePlayers.length, ulabMode]);

  useEffect(() => {
    if (ulabMode !== "similar" && expandedSimilarPlayerId) {
      setExpandedSimilarPlayerId(null);
    }
  }, [expandedSimilarPlayerId, ulabMode]);

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
        const radarItems = getObjectiveRadarItems(cRadar);
        const cb = getObjectiveRadarBlockBalance(radarItems);
        return { player: candidate, similarity: sim, blockBalance: cb, radar: cRadar, radarItems };
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

  // ── Posición del jugador en cada ranking de equipo ────────
  const playerRankings = useMemo(() => {
    const mObj = (player.metrics as Record<string, unknown>) || {};
    return METRICS_CONFIG.map((metric) => {
      const myVal = metric.getValue(mObj);
      if (myVal === null) return null;
      const sorted = squadPlayers
        .map((p) => {
          const pm = (p.metrics as Record<string, unknown>) || {};
          return metric.getValue(pm);
        })
        .filter((v): v is number => v !== null)
        .sort((a, b) => metric.higherIsBetter ? b - a : a - b);
      const rank = sorted.findIndex((v) => Math.abs(v - myVal) < 1e-6) + 1;
      return { metric, value: myVal, rank, total: sorted.length };
    }).filter((r): r is NonNullable<typeof r> => r !== null);
  }, [player, squadPlayers]);
  const profileBadges = playerProfileBadges(player);
  const lateralProfileMix = lateralProfileDistribution(player);
  const centerBackProfileMix = centerBackProfileDistribution(player);
  const midfieldProfileMix = midfieldProfileDistribution(player);
  const strikerProfileMix = strikerProfileDistribution(player);
  const wingerProfileMix = wingerProfileDistribution(player);
  const detailProfileMix = lateralProfileMix.length
    ? lateralProfileMix
    : centerBackProfileMix.length
      ? centerBackProfileMix
      : midfieldProfileMix.length
        ? midfieldProfileMix
        : strikerProfileMix.length
          ? strikerProfileMix
          : wingerProfileMix;

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
            {profileBadges.length ? (
              <div className="ulab-detail-panel__profiles">
                {profileBadges.map((badge) => (
                  <span key={badge} className="ulab-detail-panel__profile-badge">
                    {badge}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        </div>
        <span className="ulab-detail-panel__crest" aria-hidden="true">
          <img src="/escudo/unionistar.png" alt="" />
        </span>
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
            <div><strong>{stats.minutesPct}%</strong><span>min. máx.</span></div>
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

      {detailProfileMix.length ? (
        <div className="ulab-detail-panel__profile-mix">
          <span className="ulab-detail-panel__physical-label">Encaje por perfil</span>
          <div className="ulab-detail-panel__profile-mix-list">
            {detailProfileMix.map((entry) => (
              <div key={entry.key} className="ulab-detail-panel__profile-mix-row">
                <div className="ulab-detail-panel__profile-mix-head">
                  <strong>{entry.label}</strong>
                  <span>{entry.percent}%</span>
                </div>
                <div className="ulab-detail-panel__profile-mix-track">
                  <span
                    style={{ width: `${Math.max(6, entry.percent)}%`, background: color }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* Aviso si no hay datos radar */}
      {!hasRadar ? (
        <div className="ulab-no-radar">
          <span>📊</span>
          <p>Wyscout no tiene suficientes datos de rendimiento para este jugador esta temporada. Las funciones de similares y comparación no están disponibles.</p>
        </div>
      ) : null}

      {/* Navegación principal del panel */}
      {hasRadar ? (
        <div className="ulab-detail-panel__actions">
          <button
            type="button"
            className={`ulab-action-btn${ulabMode === "radar" ? " ulab-action-btn--active" : ""}`}
            onClick={() => setULabMode("radar")}
          >
            <span>📊</span> Radar
          </button>
          <button
            type="button"
            className={`ulab-action-btn${ulabMode === "similar" ? " ulab-action-btn--active" : ""}`}
            onClick={() => setULabMode("similar")}
          >
            <span>🔍</span> Similares
          </button>
          <button
            type="button"
            className={`ulab-action-btn${ulabMode === "compare" ? " ulab-action-btn--active" : ""}`}
            onClick={() => setULabMode("compare")}
          >
            <span>⚖️</span> Comparar
          </button>
          <button
            type="button"
            className={`ulab-action-btn${ulabMode === "ranking" ? " ulab-action-btn--active" : ""}`}
            onClick={() => setULabMode("ranking")}
          >
            <span>🏅</span> Ranking
          </button>
        </div>
      ) : (
        <div className="ulab-detail-panel__actions">
          <button
            type="button"
            className="ulab-action-btn ulab-action-btn--active"
            onClick={() => setULabMode("ranking")}
          >
            <span>🏅</span> Ranking
          </button>
        </div>
      )}

      {/* Radar del jugador */}
      {hasRadar && activeRadar && ulabMode === "radar" ? (
        <div className="ulab-detail-panel__radar">
          <ObjectiveRadar
            compact
            mode={radarMode}
            onModeChange={setRadarMode}
            radar={activeRadar}
            radarSpecific={radarSpecific}
            radarGeneral={radarGeneral}
          />
          <div className="objective-radar-legend ulab-detail-panel__radar-legend">
            {blockBalance.map((group) => (
              <span key={group.key}>
                <i className={group.className} />
                {group.title}
              </span>
            ))}
          </div>
          <div className="ulab-detail-panel__radar-insights">
            <div className="ulab-detail-panel__radar-card">
              <h4>Fortalezas</h4>
              {radarStrengths.map((item) => (
                <div className="ulab-detail-panel__radar-row" key={`strength-${item.key}`}>
                  <span className={radarPercentileClass(item.value)}>{item.value}</span>
                  <p>{item.label}</p>
                </div>
              ))}
            </div>
            <div className="ulab-detail-panel__radar-card">
              <h4>A mejorar</h4>
              {radarAlerts.map((item) => (
                <div className="ulab-detail-panel__radar-row" key={`alert-${item.key}`}>
                  <span className={radarPercentileClass(item.value)}>{item.value}</span>
                  <p>{item.label}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="ulab-detail-panel__radar-card ulab-detail-panel__radar-card--balance">
            <h4>Balance por bloques</h4>
            <div className="ulab-detail-panel__radar-balance-grid">
              {blockBalance.map((group) => (
                <div className="ulab-detail-panel__radar-balance-row" key={`balance-${group.key}`}>
                  <div>
                    <span>
                      <i className={group.className} />
                      {group.title}
                    </span>
                    <strong>{group.average}</strong>
                  </div>
                  <div className="ulab-detail-panel__radar-balance-track">
                    <span
                      className={radarPercentileClass(group.average)}
                      style={{ width: `${Math.max(4, group.average)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
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
            <>
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
              <div className="ulab-detail-panel__radar">
                <CompareRadar entries={compareEntries} mode={radarMode} />
              </div>
            </>
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
                const isExpanded = expandedSimilarPlayerId === s.player.id;
                const rankedRadarItems = [...s.radarItems].sort((a, b) => b.value - a.value);
                const radarStrengths = rankedRadarItems.slice(0, 3);
                const radarAlerts = [...s.radarItems].sort((a, b) => a.value - b.value).slice(0, 3);
                return (
                  <li
                    key={s.player.id}
                    className={`ulab-similar-item${isExpanded ? " ulab-similar-item--expanded" : ""}`}
                  >
                    <button
                      className="ulab-similar-item__trigger"
                      onClick={() =>
                        setExpandedSimilarPlayerId((current) => (current === s.player.id ? null : s.player.id))
                      }
                      type="button"
                    >
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
                      <div className="ulab-similar-item__summary">
                        <span className="ulab-similar-item__sim" style={{ color: simColor }}>
                          {s.similarity}%
                        </span>
                        <span className="ulab-similar-item__chevron">{isExpanded ? "−" : "+"}</span>
                      </div>
                    </button>
                    {isExpanded ? (
                      <div className="ulab-similar-item__details">
                        <div className="objective-radar-legend ulab-similar-item__legend">
                          {s.blockBalance.map((group) => (
                            <span key={group.key}>
                              <i className={group.className} />
                              {group.title}
                            </span>
                          ))}
                        </div>
                        <div className="ulab-similar-item__radar">
                          <div className="objective-radar-controls ulab-similar-item__radar-controls">
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
                          <SimilarOverlayRadar baseRadar={activeRadar} candidateRadar={s.radar} />
                        </div>
                        <div className="objective-percentile-legend ulab-similar-item__percentile-legend">
                          <span><i className="percentile-low" />0-24 Bajo</span>
                          <span><i className="percentile-medium" />25-49 Medio-bajo</span>
                          <span><i className="percentile-good" />50-79 Bueno</span>
                          <span><i className="percentile-elite" />80-100 Alto</span>
                        </div>
                        <div className="ulab-similar-item__insights">
                          <div className="ulab-similar-item__insight-card">
                            <h4>Fortalezas</h4>
                            {radarStrengths.map((item) => (
                              <div className="ulab-similar-item__insight-row" key={`strength-${s.player.id}-${item.key}`}>
                                <span className={radarPercentileClass(item.value)}>{item.value}</span>
                                <p>{item.label}</p>
                              </div>
                            ))}
                          </div>
                          <div className="ulab-similar-item__insight-card">
                            <h4>A mejorar</h4>
                            {radarAlerts.map((item) => (
                              <div className="ulab-similar-item__insight-row" key={`alert-${s.player.id}-${item.key}`}>
                                <span className={radarPercentileClass(item.value)}>{item.value}</span>
                                <p>{item.label}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                        <div className="ulab-similar-item__balance-card">
                          <h4>Balance por bloques</h4>
                          <div className="ulab-similar-item__balance-grid">
                            {s.blockBalance.map((group) => (
                              <div className="ulab-similar-item__balance-row" key={`balance-${s.player.id}-${group.key}`}>
                                <div>
                                  <span>
                                    <i className={group.className} />
                                    {group.title}
                                  </span>
                                  <strong>{group.average}</strong>
                                </div>
                                <div className="ulab-similar-item__balance-track">
                                  <span
                                    className={radarPercentileClass(group.average)}
                                    style={{ width: `${Math.max(4, group.average)}%` }}
                                  />
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                        <div className="ulab-similar-item__uv-card ulab-similar-item__uv-card--full">
                          <span>Union Value</span>
                          <strong>{sUV}</strong>
                          <small>Similitud {s.similarity}%</small>
                        </div>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}

      {/* Ranking individual del jugador en el equipo */}
      {ulabMode === "ranking" && playerRankings.length > 0 ? (
        <div className="ulab-player-rankings">
          <p className="ulab-player-rankings__title">Posición en el equipo</p>
          <div className="ulab-player-rankings__grid">
            {playerRankings.map(({ metric, value, rank, total }) => {
              const rankClass =
                rank === 1 ? "ulab-player-rankings__rank--top1"
                : rank <= 3 ? "ulab-player-rankings__rank--top3"
                : rank <= 5 ? "ulab-player-rankings__rank--top5"
                : "ulab-player-rankings__rank--other";
              const isPos = metric.isEfficiency && value > 0;
              const isNeg = metric.isEfficiency && value < 0;
              const sign = isPos ? "+" : "";
              const displayVal = `${sign}${value.toFixed(metric.decimals)}${metric.unit ?? ""}`;
              const valColor = isPos ? "#16813a" : isNeg ? "#d9480f" : undefined;
              return (
                <div key={metric.key} className="ulab-player-rankings__row">
                  <span className="ulab-player-rankings__label">{metric.label}</span>
                  <span className={`ulab-player-rankings__rank ${rankClass}`}>
                    {rank}º/{total}
                  </span>
                  <span className="ulab-player-rankings__val" style={{ color: valColor }}>
                    {displayVal}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </aside>
  );
}

// ─────────────────────────────────────────────────────────
// Rankings de plantilla
// ─────────────────────────────────────────────────────────
function formatUpdatedAt(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr);
    return `Actualizado el ${d.toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" })}`;
  } catch {
    return "";
  }
}

function formatRangeSummary(min: number, max: number, suffix = "") {
  return `${min}${suffix} - ${max}${suffix}`;
}

function rangePercent(value: number, min: number, max: number) {
  if (max <= min) return 0;
  return ((value - min) / (max - min)) * 100;
}

export function RankingsSection({
  players,
  updatedAt,
}: {
  players: ObjectivePlayer[];
  updatedAt: string | null;
}) {
  const maxMinutesReference = useMemo(() => getMaxMinutes(players), [players]);
  const [isPositionFilterOpen, setIsPositionFilterOpen] = useState(false);
  const [selectedLines, setSelectedLines] = useState<PositionLine[]>(() => [...LINE_ORDER]);
  const minutePctValues = useMemo(
    () =>
      players
        .map((player) => extractStats(player, maxMinutesReference).minutesPct)
        .filter((value) => Number.isFinite(value)),
    [maxMinutesReference, players],
  );
  const ages = useMemo(
    () =>
      players
        .map((player) => (player.birth_year ? new Date().getFullYear() - player.birth_year : null))
        .filter((value): value is number => value !== null && Number.isFinite(value)),
    [players],
  );
  const minutePctBounds = useMemo(() => {
    if (!minutePctValues.length) return { min: 0, max: 100 };
    return {
      min: Math.min(...minutePctValues),
      max: Math.max(...minutePctValues),
    };
  }, [minutePctValues]);
  const ageBounds = useMemo(() => {
    if (!ages.length) return { min: 16, max: 40 };
    return {
      min: Math.min(...ages),
      max: Math.max(...ages),
    };
  }, [ages]);
  const [minMinutesPct, setMinMinutesPct] = useState(0);
  const [maxMinutesPct, setMaxMinutesPct] = useState(100);
  const [minAge, setMinAge] = useState(16);
  const [maxAge, setMaxAge] = useState(40);

  useEffect(() => {
    setMinMinutesPct(minutePctBounds.min);
    setMaxMinutesPct(minutePctBounds.max);
  }, [minutePctBounds.max, minutePctBounds.min]);

  useEffect(() => {
    setMinAge(ageBounds.min);
    setMaxAge(ageBounds.max);
  }, [ageBounds.max, ageBounds.min]);

  const filteredPlayers = useMemo(
    () =>
      players.filter((player) => {
        const minutesPct = extractStats(player, maxMinutesReference).minutesPct;
        const line = positionLine(player.primary_position || player.primary_position_label);
        const age = player.birth_year ? new Date().getFullYear() - player.birth_year : null;
        const matchesLine = selectedLines.includes(line);
        const matchesMinutes = minutesPct >= minMinutesPct && minutesPct <= maxMinutesPct;
        const matchesAge = age === null ? false : age >= minAge && age <= maxAge;
        return matchesLine && matchesMinutes && matchesAge;
      }),
    [maxAge, maxMinutesPct, maxMinutesReference, minAge, minMinutesPct, players, selectedLines],
  );

  const selectedMinuteRange =
    minutePctBounds.max > minutePctBounds.min
      ? ((maxMinutesPct - minMinutesPct) / (minutePctBounds.max - minutePctBounds.min)) * 100
      : 0;
  const selectedAgeRange =
    ageBounds.max > ageBounds.min
      ? ((maxAge - minAge) / (ageBounds.max - ageBounds.min)) * 100
      : 0;
  const selectedPositionSummary =
    selectedLines.length === LINE_ORDER.length
      ? "Todas las posiciones"
      : selectedLines.length === 0
        ? "Sin posiciones seleccionadas"
        : selectedLines.map((line) => LINE_LABEL[line]).join(" · ");
  const minAgePercent = rangePercent(minAge, ageBounds.min, ageBounds.max);
  const maxAgePercent = rangePercent(maxAge, ageBounds.min, ageBounds.max);
  const minMinutePercent = rangePercent(minMinutesPct, minutePctBounds.min, minutePctBounds.max);
  const maxMinutePercent = rangePercent(maxMinutesPct, minutePctBounds.min, minutePctBounds.max);

  function toggleLine(line: PositionLine) {
    setSelectedLines((current) =>
      current.includes(line) ? current.filter((item) => item !== line) : [...current, line],
    );
  }

  return (
    <div className="ulab-rankings">
      <div className="ulab-rankings__head">
        <h3 className="ulab-rankings__title">Rankings de plantilla</h3>
        {updatedAt ? <span className="ulab-rankings__date">{formatUpdatedAt(updatedAt)}</span> : null}
      </div>
      <div className="ulab-rankings__filters">
        <div className="ulab-rankings__filter-card ulab-rankings__filter-card--positions">
          <div className="ulab-rankings__filter-head">
            <strong>
              <img alt="" aria-hidden="true" src="/escudo/unionistar.png" />
              Posición general
            </strong>
          </div>
          <div className="ulab-rankings__multiselect">
            <button
              className={`ulab-rankings__multiselect-trigger${isPositionFilterOpen ? " is-open" : ""}`}
              onClick={() => setIsPositionFilterOpen((value) => !value)}
              type="button"
            >
              <span>{selectedLines.length}/{LINE_ORDER.length} seleccionadas</span>
              <strong>{isPositionFilterOpen ? "Cerrar" : "Elegir"}</strong>
            </button>
            {isPositionFilterOpen ? (
              <div className="ulab-rankings__multiselect-menu">
                {LINE_ORDER.map((line) => (
                  <label key={line} className="ulab-rankings__multiselect-option">
                    <input
                      checked={selectedLines.includes(line)}
                      onChange={() => toggleLine(line)}
                      type="checkbox"
                    />
                    <span className="ulab-rankings__multiselect-swatch" style={{ background: LINE_COLOR[line] }} />
                    <span>{LINE_LABEL[line]}</span>
                  </label>
                ))}
              </div>
            ) : null}
          </div>
        </div>
        <div className="ulab-rankings__filter-card">
          <div className="ulab-rankings__filter-head">
            <strong>
              <img alt="" aria-hidden="true" src="/escudo/unionistar.png" />
              Edad
            </strong>
          </div>
          <div className="ulab-rankings__range-wrap">
            <div className="ulab-rankings__range-track" />
            <div className="ulab-rankings__range-values">
              <span className="ulab-rankings__range-value" style={{ left: `${minAgePercent}%` }}>
                {minAge}
              </span>
              <span className="ulab-rankings__range-value" style={{ left: `${maxAgePercent}%` }}>
                {maxAge}
              </span>
            </div>
            <div
              className="ulab-rankings__range-active"
              style={{
                left: `${minAgePercent}%`,
                width: `${selectedAgeRange}%`,
              }}
            />
            <input
              className="ulab-rankings__range ulab-rankings__range--min"
              max={Math.max(ageBounds.min, maxAge)}
              min={ageBounds.min}
              onChange={(event) => setMinAge(Math.min(Number(event.target.value), maxAge))}
              step={1}
              type="range"
              value={minAge}
            />
            <input
              className="ulab-rankings__range ulab-rankings__range--max"
              max={ageBounds.max}
              min={Math.min(minAge, ageBounds.max)}
              onChange={(event) => setMaxAge(Math.max(Number(event.target.value), minAge))}
              step={1}
              type="range"
              value={maxAge}
            />
          </div>
        </div>
        <div className="ulab-rankings__filter-card">
          <div className="ulab-rankings__filter-head">
            <strong>
              <img alt="" aria-hidden="true" src="/escudo/unionistar.png" />
              % minutos vs máximo
            </strong>
          </div>
          <div className="ulab-rankings__range-wrap">
            <div className="ulab-rankings__range-track" />
            <div className="ulab-rankings__range-values">
              <span className="ulab-rankings__range-value" style={{ left: `${minMinutePercent}%` }}>
                {minMinutesPct}%
              </span>
              <span className="ulab-rankings__range-value" style={{ left: `${maxMinutePercent}%` }}>
                {maxMinutesPct}%
              </span>
            </div>
            <div
              className="ulab-rankings__range-active"
              style={{
                left: `${minMinutePercent}%`,
                width: `${selectedMinuteRange}%`,
              }}
            />
            <input
              className="ulab-rankings__range ulab-rankings__range--min"
              max={Math.max(minutePctBounds.min, maxMinutesPct)}
              min={minutePctBounds.min}
              onChange={(event) =>
                setMinMinutesPct(Math.min(Number(event.target.value), maxMinutesPct))
              }
              step={1}
              type="range"
              value={minMinutesPct}
            />
            <input
              className="ulab-rankings__range ulab-rankings__range--max"
              max={minutePctBounds.max}
              min={Math.min(minMinutesPct, minutePctBounds.max)}
              onChange={(event) =>
                setMaxMinutesPct(Math.max(Number(event.target.value), minMinutesPct))
              }
              step={1}
              type="range"
              value={maxMinutesPct}
            />
          </div>
        </div>
      </div>
      {filteredPlayers.length === 0 ? (
        <div className="ulab-rankings__empty">
          Ningún jugador entra en los filtros seleccionados.
        </div>
      ) : null}
      <div className="ulab-rankings-grid">
        {METRICS_CONFIG.map((metric) => {
          const rows = filteredPlayers
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

interface ScatterSelectedRow extends ScatterPoint {
  cx: number;
  cy: number;
}

interface ScatterTooltip {
  svgX: number;
  svgY: number;
  player: ObjectivePlayer;
  xVal: number;
  yVal: number;
}

const SCATTER_PAD = { top: 28, right: 20, bottom: 44, left: 50 };
const SCATTER_W = 820;
const SCATTER_H = 460;
const PLOT_W = SCATTER_W - SCATTER_PAD.left - SCATTER_PAD.right;
const PLOT_H = SCATTER_H - SCATTER_PAD.top - SCATTER_PAD.bottom;

/** Jitter determinista basado en el ID del jugador — evita que los puntos
 *  se solapen sin cambiar entre renders */
function deterministicJitter(id: string, range: number): [number, number] {
  let h = 5381;
  for (let i = 0; i < id.length; i++) {
    h = (((h << 5) + h) ^ id.charCodeAt(i)) & 0x7fffffff;
  }
  const h2 = ((h * 1664525 + 1013904223) & 0x7fffffff);
  const dx = ((h & 0xff) / 255 - 0.5) * 2 * range;
  const dy = ((h2 & 0xff) / 255 - 0.5) * 2 * range;
  return [dx, dy];
}

export function ScatterPlot({ players }: { players: ObjectivePlayer[] }) {
  // Blank initial state — user must choose both axes
  const [xKey, setXKey] = useState<string | null>(null);
  const [yKey, setYKey] = useState<string | null>(null);
  const [filterZero, setFilterZero] = useState(false);
  const [tooltip, setTooltip] = useState<ScatterTooltip | null>(null);
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<string[]>([]);
  const [focusedPlayerId, setFocusedPlayerId] = useState<string | null>(null);
  const [visibleLines, setVisibleLines] = useState<PositionLine[]>(() => [...LINE_ORDER]);
  const svgRef = useRef<SVGSVGElement>(null);

  const xConfig = xKey ? METRICS_CONFIG.find((m) => m.key === xKey) ?? null : null;
  const yConfig = yKey ? METRICS_CONFIG.find((m) => m.key === yKey) ?? null : null;
  const ready = !!(xConfig && yConfig);

  const plotData = useMemo<ScatterPoint[]>(() => {
    if (!xConfig || !yConfig) return [];
    return players
      .map((p) => {
        const mObj = (p.metrics as Record<string, unknown>) || {};
        const x = xConfig.getValue(mObj);
        const y = yConfig.getValue(mObj);
        const line = positionLine(p.primary_position || p.primary_position_label);
        if (x === null || y === null) return null;
        if (filterZero && (x === 0 || y === 0)) return null;
        if (!visibleLines.includes(line)) return null;
        return { player: p, x, y };
      })
      .filter((d): d is ScatterPoint => d !== null);
  }, [players, xConfig, yConfig, filterZero, visibleLines]);

  const xs = plotData.map((d) => d.x);
  const ys = plotData.map((d) => d.y);
  const xMin = xs.length ? Math.min(...xs) : 0;
  const xMax = xs.length ? Math.max(...xs) : 1;
  const yMin = ys.length ? Math.min(...ys) : 0;
  const yMax = ys.length ? Math.max(...ys) : 1;
  const xMean = xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
  const yMean = ys.length ? ys.reduce((a, b) => a + b, 0) / ys.length : 0;

  const xPad = (xMax - xMin) * 0.12 || 0.5;
  const yPad = (yMax - yMin) * 0.12 || 0.5;
  const xLo = xMin - xPad;
  const xHi = xMax + xPad;
  const yLo = yMin - yPad;
  const yHi = yMax + yPad;

  function toSvgX(v: number) { return SCATTER_PAD.left + ((v - xLo) / (xHi - xLo)) * PLOT_W; }
  function toSvgY(v: number) { return SCATTER_PAD.top + PLOT_H - ((v - yLo) / (yHi - yLo)) * PLOT_H; }

  function niceSteps(lo: number, hi: number, n = 5) {
    const raw = (hi - lo) / n;
    const mag = Math.pow(10, Math.floor(Math.log10(Math.max(raw, 1e-9))));
    const nice = [1, 2, 2.5, 5, 10].map((f) => f * mag).find((s) => s >= raw) ?? raw;
    const start = Math.ceil(lo / nice) * nice;
    const ticks: number[] = [];
    for (let t = start; t <= hi + 1e-9; t += nice) ticks.push(Math.round(t * 1000) / 1000);
    return ticks;
  }
  const xTicks = ready ? niceSteps(xLo, xHi) : [];
  const yTicks = ready ? niceSteps(yLo, yHi) : [];
  const meanSvgX = ready ? toSvgX(xMean) : 0;
  const meanSvgY = ready ? toSvgY(yMean) : 0;
  const selectedRows = useMemo<ScatterSelectedRow[]>(() => {
    if (!ready) return [];
    const selectedSet = new Set(selectedPlayerIds);
    return plotData
      .filter((d) => selectedSet.has(d.player.id))
      .map((d) => {
        const [jx, jy] = deterministicJitter(d.player.id, 6);
        return {
          ...d,
          cx: toSvgX(d.x) + jx,
          cy: toSvgY(d.y) + jy,
        };
      });
  }, [plotData, ready, selectedPlayerIds]);
  const focusedRow = selectedRows.find((row) => row.player.id === focusedPlayerId) || null;

  useEffect(() => {
    const availableIds = new Set(plotData.map((row) => row.player.id));
    setSelectedPlayerIds((current) => current.filter((id) => availableIds.has(id)));
    setFocusedPlayerId((current) => (current && availableIds.has(current) ? current : null));
  }, [plotData]);

  function swapAxes() {
    setXKey(yKey);
    setYKey(xKey);
    setTooltip(null);
  }

  function toggleSelectedPlayer(playerId: string) {
    setSelectedPlayerIds((current) =>
      current.includes(playerId) ? current.filter((id) => id !== playerId) : [...current, playerId],
    );
    setFocusedPlayerId(playerId);
  }

  function toggleVisibleLine(line: PositionLine) {
    setVisibleLines((current) =>
      current.includes(line) ? current.filter((item) => item !== line) : [...current, line],
    );
  }

  return (
    <div className="ulab-scatter">
      <div className="ulab-scatter__card">

        {/* Cabecera del cajetín */}
        <div className="ulab-scatter__card-head">
          <h3 className="ulab-scatter__title">Dispersión de plantilla</h3>
          <div className="ulab-scatter__selectors">
            <label>
              <span>Eje X</span>
              <select
                value={xKey ?? ""}
                onChange={(e) => { setXKey(e.target.value || null); setTooltip(null); }}
              >
                <option value="">— Seleccionar métrica —</option>
                {METRICS_CONFIG.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
              </select>
            </label>
            <label>
              <span>Eje Y</span>
              <select
                value={yKey ?? ""}
                onChange={(e) => { setYKey(e.target.value || null); setTooltip(null); }}
              >
                <option value="">— Seleccionar métrica —</option>
                {METRICS_CONFIG.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
              </select>
            </label>
            <button
              type="button"
              className="ulab-scatter__swap-btn"
              disabled={!xConfig || !yConfig}
              onClick={swapAxes}
            >
              Intercambiar ejes
            </button>
            <label className="ulab-scatter__zero-filter">
              <input
                type="checkbox"
                checked={filterZero}
                onChange={(e) => { setFilterZero(e.target.checked); setTooltip(null); }}
              />
              <span>Ocultar valor cero</span>
            </label>
          </div>
        </div>

        {/* Cuerpo */}
        <div className="ulab-scatter__body">
          {!ready ? (
            <div className="ulab-scatter__empty">
              <div className="ulab-scatter__empty-icon">📊</div>
              <p>Selecciona las métricas para los ejes X e Y<br />y visualiza la distribución de la plantilla</p>
            </div>
          ) : (
            <div className="ulab-scatter__layout">
              <aside className="ulab-scatter__sidebar">
                <div className="ulab-scatter__selection-head">
                  <strong>Jugadores seleccionados</strong>
                  <span>
                    {selectedRows.length
                      ? `${selectedRows.length} marcados en el gráfico`
                      : "Haz clic en un punto para añadirlo"}
                  </span>
                </div>
                {selectedRows.length ? (
                  <div className="ulab-scatter__selection-table">
                    <div className="ulab-scatter__selection-row ulab-scatter__selection-row--head">
                      <span>Jugador</span>
                      <span>{xConfig?.short}</span>
                      <span>{yConfig?.short}</span>
                      <span>Ubicación</span>
                    </div>
                    {selectedRows.map((row) => (
                      <button
                        key={row.player.id}
                        type="button"
                        className={`ulab-scatter__selection-row${focusedPlayerId === row.player.id ? " is-focused" : ""}`}
                        onClick={() => {
                          setFocusedPlayerId(row.player.id);
                          setTooltip({
                            svgX: row.cx,
                            svgY: row.cy,
                            player: row.player,
                            xVal: row.x,
                            yVal: row.y,
                          });
                        }}
                      >
                        <span>{playerShortName(row.player)}</span>
                        <span>{row.x.toFixed(xConfig?.decimals ?? 0)}{xConfig?.unit ?? ""}</span>
                        <span>{row.y.toFixed(yConfig?.decimals ?? 0)}{yConfig?.unit ?? ""}</span>
                        <span>{focusedPlayerId === row.player.id ? "▲ En foco" : "Ver en gráfico"}</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="ulab-scatter__selection-empty">
                    Selecciona jugadores desde el gráfico para ver sus valores aquí.
                  </div>
                )}
              </aside>

              <div className="ulab-scatter__main">
                <div className="ulab-scatter__wrap" onMouseLeave={() => setTooltip(null)}>
                  <div className="ulab-scatter__watermark" aria-hidden="true">
                    <img src="/escudo/unionistar.png" alt="" />
                  </div>
                  <svg
                    ref={svgRef}
                    viewBox={`0 0 ${SCATTER_W} ${SCATTER_H}`}
                    className="ulab-scatter__svg"
                    aria-label="Scatter de plantilla"
                  >
                {/* Axes */}
                <line
                  x1={SCATTER_PAD.left} y1={SCATTER_PAD.top}
                  x2={SCATTER_PAD.left} y2={SCATTER_PAD.top + PLOT_H}
                  stroke="rgba(224, 210, 0, 0.38)" strokeWidth={1.1}
                />
                <line
                  x1={SCATTER_PAD.left} y1={SCATTER_PAD.top + PLOT_H}
                  x2={SCATTER_PAD.left + PLOT_W} y2={SCATTER_PAD.top + PLOT_H}
                  stroke="rgba(224, 210, 0, 0.38)" strokeWidth={1.1}
                />

                {/* X axis ticks + labels */}
                {xTicks.map((t) => {
                  const sx = toSvgX(t);
                  if (sx < SCATTER_PAD.left - 2 || sx > SCATTER_PAD.left + PLOT_W + 2) return null;
                  return (
                    <g key={`xt-${t}`}>
                      <line x1={sx} y1={SCATTER_PAD.top + PLOT_H} x2={sx} y2={SCATTER_PAD.top + PLOT_H + 4} stroke="rgba(224, 210, 0, 0.42)" strokeWidth={1} />
                      <text x={sx} y={SCATTER_PAD.top + PLOT_H + 16} textAnchor="middle" fontSize={10} fill="rgba(224, 210, 0, 0.62)">
                        {t.toFixed(xConfig!.decimals <= 1 ? 0 : 1)}{xConfig!.unit ?? ""}
                      </text>
                    </g>
                  );
                })}

                {/* Y axis ticks + labels */}
                {yTicks.map((t) => {
                  const sy = toSvgY(t);
                  if (sy < SCATTER_PAD.top - 2 || sy > SCATTER_PAD.top + PLOT_H + 2) return null;
                  return (
                    <g key={`yt-${t}`}>
                      <line x1={SCATTER_PAD.left - 4} y1={sy} x2={SCATTER_PAD.left} y2={sy} stroke="rgba(224, 210, 0, 0.42)" strokeWidth={1} />
                      <text x={SCATTER_PAD.left - 7} y={sy} textAnchor="end" dominantBaseline="middle" fontSize={10} fill="rgba(224, 210, 0, 0.62)">
                        {t.toFixed(yConfig!.decimals <= 1 ? 0 : 1)}{yConfig!.unit ?? ""}
                      </text>
                    </g>
                  );
                })}

                {/* Axis labels */}
                <text
                  x={SCATTER_PAD.left + PLOT_W / 2}
                  y={SCATTER_H - 2}
                  textAnchor="middle" fontSize={11} fill="rgba(224, 210, 0, 0.72)" fontWeight={700}
                >
                  {xConfig!.label}
                </text>
                <text
                  x={13}
                  y={SCATTER_PAD.top + PLOT_H / 2}
                  textAnchor="middle" fontSize={11} fill="rgba(224, 210, 0, 0.72)" fontWeight={700}
                  transform={`rotate(-90, 13, ${SCATTER_PAD.top + PLOT_H / 2})`}
                >
                  {yConfig!.label}
                </text>

                {/* Mean lines (dashed) */}
                <line
                  x1={meanSvgX} y1={SCATTER_PAD.top}
                  x2={meanSvgX} y2={SCATTER_PAD.top + PLOT_H}
                  stroke="rgba(224, 210, 0, 0.55)" strokeWidth={1.6} strokeDasharray="6 4"
                />
                <line
                  x1={SCATTER_PAD.left} y1={meanSvgY}
                  x2={SCATTER_PAD.left + PLOT_W} y2={meanSvgY}
                  stroke="rgba(224, 210, 0, 0.55)" strokeWidth={1.6} strokeDasharray="6 4"
                />
                <text x={meanSvgX + 5} y={SCATTER_PAD.top + 12} fontSize={9} fill="rgba(224, 210, 0, 0.58)">media</text>
                <text x={SCATTER_PAD.left + 5} y={meanSvgY - 5} fontSize={9} fill="rgba(224, 210, 0, 0.58)">media</text>

                {/* Dots — con jitter determinista para separar puntos solapados */}
                {plotData.map((d) => {
                  const baseCx = toSvgX(d.x);
                  const baseCy = toSvgY(d.y);
                  const [jx, jy] = deterministicJitter(d.player.id, 6);
                  const cx = baseCx + jx;
                  const cy = baseCy + jy;
                  const ln = positionLine(d.player.primary_position || d.player.primary_position_label);
                  const dotColor = LINE_COLOR[ln];
                  const isActive = tooltip?.player.id === d.player.id;
                  return (
                    <g
                      key={d.player.id}
                      style={{ cursor: "pointer" }}
                      onMouseEnter={() => setTooltip({ svgX: cx, svgY: cy, player: d.player, xVal: d.x, yVal: d.y })}
                      onClick={() => toggleSelectedPlayer(d.player.id)}
                    >
                      <circle
                        cx={cx} cy={cy} r={isActive ? 9 : 6}
                        fill={dotColor} fillOpacity={isActive ? 1 : 0.85}
                        stroke={isActive ? "#fff" : "#0d0d0d"} strokeWidth={isActive ? 2 : 1.5}
                      />
                      <text
                        x={cx} y={cy - 10}
                        textAnchor="middle" fontSize={8.5} fill="#bbb"
                        paintOrder="stroke" stroke="#0d0d0d" strokeWidth={2.5}
                      >
                        {playerShortName(d.player)}
                      </text>
                    </g>
                  );
                })}

                {focusedRow ? (
                  <g className="ulab-scatter__focus-marker">
                    <line
                      x1={focusedRow.cx}
                      y1={SCATTER_PAD.top}
                      x2={focusedRow.cx}
                      y2={SCATTER_PAD.top + PLOT_H}
                      stroke="#f2e400"
                      strokeDasharray="4 4"
                      strokeOpacity="0.35"
                      strokeWidth={1.5}
                    />
                    <line
                      x1={SCATTER_PAD.left}
                      y1={focusedRow.cy}
                      x2={SCATTER_PAD.left + PLOT_W}
                      y2={focusedRow.cy}
                      stroke="#f2e400"
                      strokeDasharray="4 4"
                      strokeOpacity="0.35"
                      strokeWidth={1.5}
                    />
                    <line
                      x1={focusedRow.cx}
                      y1={focusedRow.cy - 28}
                      x2={focusedRow.cx}
                      y2={focusedRow.cy - 10}
                      stroke="#f2e400"
                      strokeWidth={2}
                    />
                    <path
                      d={`M ${focusedRow.cx - 5} ${focusedRow.cy - 11} L ${focusedRow.cx} ${focusedRow.cy - 2} L ${focusedRow.cx + 5} ${focusedRow.cy - 11}`}
                      fill="none"
                      stroke="#f2e400"
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <circle
                      cx={focusedRow.cx}
                      cy={focusedRow.cy}
                      r={11}
                      fill="none"
                      stroke="#f2e400"
                      strokeWidth={2.2}
                      strokeDasharray="4 3"
                    />
                    <circle
                      cx={focusedRow.cx}
                      cy={focusedRow.cy}
                      r={15}
                      fill="none"
                      stroke="#f2e400"
                      strokeOpacity="0.25"
                      strokeWidth={1.4}
                    />
                  </g>
                ) : null}
                  </svg>

                  {/* Leyenda */}
                  <div className="ulab-scatter__legend">
                    {(Object.entries(LINE_COLOR) as [PositionLine, string][]).map(([ln, color]) => (
                      <button
                        key={ln}
                        type="button"
                        className={`ulab-scatter__legend-item${visibleLines.includes(ln) ? " is-active" : ""}`}
                        aria-pressed={visibleLines.includes(ln)}
                        onClick={() => toggleVisibleLine(ln)}
                      >
                        <i style={{ background: color }} />
                        {LINE_LABEL[ln]}
                      </button>
                    ))}
                    <span className="ulab-scatter__legend-item ulab-scatter__legend-item--mean">
                      <i />
                      Media equipo
                    </span>
                  </div>

                  {/* Tooltip flotante */}
                  {tooltip && xConfig && yConfig ? (
                    <div
                      className="ulab-scatter__tooltip"
                      style={{
                        left: `calc(${(tooltip.svgX / SCATTER_W) * 100}% + 14px)`,
                        top: `calc(${(tooltip.svgY / SCATTER_H) * 100}% - 24px)`,
                      }}
                    >
                      <strong>{playerShortName(tooltip.player)}</strong>
                      <span>{xConfig.short}: <b>{tooltip.xVal.toFixed(xConfig.decimals)}{xConfig.unit ?? ""}</b></span>
                      <span>{yConfig.short}: <b>{tooltip.yVal.toFixed(yConfig.decimals)}{yConfig.unit ?? ""}</b></span>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


// ─────────────────────────────────────────────────────────
// Vista principal ULab
// ─────────────────────────────────────────────────────────
export function ULabView({ objectivePlayers }: { objectivePlayers: ObjectivePlayer[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [openGlossaryFamily, setOpenGlossaryFamily] = useState<GlossaryFamily | null>(null);

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
  const squadMaxMinutes = useMemo(() => getMaxMinutes(unionistasPlayers), [unionistasPlayers]);

  const selectedPlayer = useMemo(
    () => unionistasPlayers.find((p) => p.id === selectedId) ?? null,
    [selectedId, unionistasPlayers],
  );

  useEffect(() => {
    if (!selectedId) return;
    if (!unionistasPlayers.some((player) => player.id === selectedId)) {
      setSelectedId(null);
    }
  }, [selectedId, unionistasPlayers]);

  function toggleGlossaryFamily(family: GlossaryFamily) {
    setOpenGlossaryFamily((current) => (current === family ? null : family));
  }

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
          <details
            className="ulab-profiles-glossary"
            onToggle={(event) => {
              const element = event.currentTarget as HTMLDetailsElement;
              if (!element.open) setOpenGlossaryFamily(null);
            }}
          >
            <summary>Glosario de perfiles</summary>
            <div className="ulab-profiles-glossary__content">
              <details className="ulab-profiles-glossary__family" open={openGlossaryFamily === "laterales"}>
                <summary
                  onClick={(event) => {
                    event.preventDefault();
                    toggleGlossaryFamily("laterales");
                  }}
                >
                  Laterales
                </summary>
                <div className="ulab-profiles-glossary__family-content">
                  <div className="ulab-profiles-glossary__item">
                    <strong>Lateral ofensivo</strong>
                    <span>Llega arriba, pisa área y produce peligro en campo rival.</span>
                  </div>
                  <div className="ulab-profiles-glossary__item">
                    <strong>Lateral interior</strong>
                    <span>Se mete por dentro para ayudar en la salida, la circulación y la construcción.</span>
                  </div>
                  <div className="ulab-profiles-glossary__item">
                    <strong>Lateral defensivo</strong>
                    <span>Destaca más en duelo, contención y trabajo sin balón.</span>
                  </div>
                </div>
              </details>

              <details className="ulab-profiles-glossary__family" open={openGlossaryFamily === "centrales"}>
                <summary
                  onClick={(event) => {
                    event.preventDefault();
                    toggleGlossaryFamily("centrales");
                  }}
                >
                  Centrales
                </summary>
                <div className="ulab-profiles-glossary__family-content">
                  <div className="ulab-profiles-glossary__item">
                    <strong>Central constructor</strong>
                    <span>Saca el balón con calidad, filtra pases y activa la progresión desde atrás.</span>
                  </div>
                  <div className="ulab-profiles-glossary__item">
                    <strong>Central defensivo</strong>
                    <span>Se impone en duelos, área y acciones de contención cerca de portería.</span>
                  </div>
                  <div className="ulab-profiles-glossary__item">
                    <strong>Central veloz</strong>
                    <span>Central ágil y rápido para cubrir espacios, corregir errores y defender transiciones.</span>
                  </div>
                </div>
              </details>

              <details className="ulab-profiles-glossary__family" open={openGlossaryFamily === "centrocampistas"}>
                <summary
                  onClick={(event) => {
                    event.preventDefault();
                    toggleGlossaryFamily("centrocampistas");
                  }}
                >
                  Centrocampistas
                </summary>
                <div className="ulab-profiles-glossary__family-content">
                  <div className="ulab-profiles-glossary__item">
                    <strong>Pivote</strong>
                    <span>Protege el carril central, roba, da equilibrio y sostiene al equipo por delante de la defensa.</span>
                  </div>
                  <div className="ulab-profiles-glossary__item">
                    <strong>Mediocentro creador</strong>
                    <span>Conecta ataque y defensa con pase, visión y capacidad para hacer jugar al equipo.</span>
                  </div>
                  <div className="ulab-profiles-glossary__item">
                    <strong>Box to Box</strong>
                    <span>Recorre grandes distancias y participa con impacto en defensa y ataque.</span>
                  </div>
                  <div className="ulab-profiles-glossary__item">
                    <strong>Mediapunta-asistente</strong>
                    <span>Genera ventajas cerca del área con último pase, xA, creatividad y asistencia.</span>
                  </div>
                </div>
              </details>

              <details className="ulab-profiles-glossary__family" open={openGlossaryFamily === "delanteros"}>
                <summary
                  onClick={(event) => {
                    event.preventDefault();
                    toggleGlossaryFamily("delanteros");
                  }}
                >
                  Delanteros
                </summary>
                <div className="ulab-profiles-glossary__family-content">
                  <div className="ulab-profiles-glossary__item">
                    <strong>Segundo punta</strong>
                    <span>Se mueve alrededor del nueve, llega al área y mezcla remate con apoyo creativo.</span>
                  </div>
                  <div className="ulab-profiles-glossary__item">
                    <strong>Delantero referencia</strong>
                    <span>Fija centrales, gana juego aéreo y da una salida frontal al equipo.</span>
                  </div>
                  <div className="ulab-profiles-glossary__item">
                    <strong>Delantero profundo</strong>
                    <span>Amenaza a la espalda, ataca el área con ritmo y vive mucho del desmarque.</span>
                  </div>
                </div>
              </details>

              <details className="ulab-profiles-glossary__family" open={openGlossaryFamily === "extremos"}>
                <summary
                  onClick={(event) => {
                    event.preventDefault();
                    toggleGlossaryFamily("extremos");
                  }}
                >
                  Extremos
                </summary>
                <div className="ulab-profiles-glossary__family-content">
                  <div className="ulab-profiles-glossary__item">
                    <strong>Extremo clásico</strong>
                    <span>Juega abierto, desborda por fuera y genera peligro con centro y aceleración.</span>
                  </div>
                  <div className="ulab-profiles-glossary__item">
                    <strong>Extremo creador</strong>
                    <span>Recibe abierto o viene dentro para filtrar, asistir y crear ventajas desde banda.</span>
                  </div>
                  <div className="ulab-profiles-glossary__item">
                    <strong>Extremo finalizador</strong>
                    <span>Ataca el área con mentalidad de gol y busca acabar la jugada más que alargarla.</span>
                  </div>
                </div>
              </details>
            </div>
          </details>
          {unionistasPlayers.length === 0 ? (
            <div className="content-card">
              <div className="section-title">
                <h2>Plantilla no disponible</h2>
              </div>
              <p>
                No se han encontrado jugadores de Unionistas en `objective_players` para esta
                temporada. Revisa la carga Wyscout o la lista de nombres usada por `ULab`.
              </p>
            </div>
          ) : null}
          {LINE_ORDER.map((line) => {
            const group = byLine[line];
            if (!group.length) return null;

            return (
              <section key={line} className="ulab-squad-row">
                <div className="ulab-squad-row__header">
                  <div
                    className="ulab-squad-row__badge"
                    style={{ background: LINE_COLOR[line] }}
                  >
                    <strong>{LINE_LABEL[line]}</strong>
                    <em>{group.length}</em>
                  </div>
                </div>
                <div className="ulab-squad-row__scroller">
                  <div className="ulab-squad-row__track">
                    {group.map((player) => (
                      <div key={player.id} className="ulab-squad-row__card">
                        <div
                          className="ulab-squad-item__tone"
                          style={{ background: LINE_COLOR[line] }}
                        />
                        <SquadPlayerCard
                          player={player}
                          maxMinutesReference={squadMaxMinutes}
                          isSelected={selectedId === player.id}
                          onSelect={() =>
                            setSelectedId(selectedId === player.id ? null : player.id)
                          }
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            );
          })}
        </div>

        {/* Panel de detalle */}
        {selectedPlayer ? (
          <PlayerDetailPanel
            player={selectedPlayer}
            allObjectivePlayers={objectivePlayers}
            squadPlayers={unionistasPlayers}
            maxMinutesReference={squadMaxMinutes}
            onClose={() => setSelectedId(null)}
          />
        ) : null}
      </div>

      {/* Rankings */}
      <RankingsSection
        players={unionistasPlayers}
        updatedAt={unionistasPlayers[0]?.updated_at ?? null}
      />

      {/* Scatter */}
      <ScatterPlot players={unionistasPlayers} />
    </section>
  );
}
