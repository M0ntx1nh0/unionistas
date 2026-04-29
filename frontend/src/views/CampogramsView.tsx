import { useCallback, useEffect, useMemo, useState } from "react";

/**
 * Como useState pero persiste el valor en sessionStorage.
 * Sobrevive desmontajes del componente por refrescos de token u otras causas.
 */
function useSessionState<T>(key: string, initial: T): [T, (value: T | ((prev: T) => T)) => void] {
  const [state, setStateRaw] = useState<T>(() => {
    try {
      const stored = sessionStorage.getItem(key);
      return stored !== null ? (JSON.parse(stored) as T) : initial;
    } catch {
      return initial;
    }
  });

  const setState = useCallback(
    (value: T | ((prev: T) => T)) => {
      setStateRaw((prev) => {
        const next = typeof value === "function" ? (value as (p: T) => T)(prev) : value;
        try {
          sessionStorage.setItem(key, JSON.stringify(next));
        } catch {
          // sessionStorage lleno o no disponible — continuar sin persistir
        }
        return next;
      });
    },
    [key],
  );

  return [state, setState];
}
import type {
  Campogram,
  CampogramPlayer,
  CampogramReport,
  ObjectivePlayer,
  ObjectivePlayerMatch,
  UserProfile,
} from "../types";
import { formatDate } from "../utils/format";
import {
  calculateRadarSimilarity,
  formatComparableVolume,
  formatObjectiveAge,
  formatObjectiveUpdatedAt,
  getObjectiveRadarBlockBalance,
  getObjectiveRadarForMode,
  getObjectiveRadarItems,
  getUnionValue,
  ObjectiveRadar,
  objectiveMatchRank,
  objectivePlayerIdentityKey,
  objectiveStatusClass,
  objectiveStatusLabel,
  radarPercentileClass,
  type ObjectiveRadarMode,
} from "./PlayersView";

const POSITION_ORDER = [
  "POR 1",
  "LTD 2",
  "DFC 4",
  "DFC 5",
  "LTI 3",
  "MC 8",
  "MC 6",
  "ED 7",
  "DC/MP 10",
  "EI 11",
  "DC 9",
] as const;

const FIELD_ROWS: Array<Array<(typeof POSITION_ORDER)[number] | null>> = [
  [null, null, "POR 1", null, null],
  ["LTD 2", "DFC 4", null, "DFC 5", "LTI 3"],
  [null, "MC 8", null, "MC 6", null],
  ["ED 7", null, "DC/MP 10", null, "EI 11"],
  [null, null, "DC 9", null, null],
];

const PITCH_LINES = [
  { className: "campogram-pitch-line--gk", positions: ["POR 1"] },
  { className: "campogram-pitch-line--defense", positions: ["LTI 3", "DFC 5", "DFC 4", "LTD 2"] },
  { className: "campogram-pitch-line--midfield", positions: ["MC 6", "MC 8"] },
  { className: "campogram-pitch-line--attack-mid", positions: ["EI 11", "DC/MP 10", "ED 7"] },
  { className: "campogram-pitch-line--striker", positions: ["DC 9"] },
] as const;

const CONSENSUS_ORDER = [
  "Fichar",
  "Duda",
  "Seguir viendo",
  "Descartar",
  "Sin consenso",
  "Sin informes",
] as const;

const CONSENSUS_COLORS: Record<string, string> = {
  Fichar: "#0f8a3b",
  Duda: "#d4b000",
  "Seguir viendo": "#3b82f6",
  Descartar: "#d9480f",
  "Sin consenso": "#7b2cbf",
  "Sin informes": "#8f8f8f",
};

const CONSENSUS_CLASS: Record<string, string> = {
  Fichar: "campogram-consensus--fichar",
  Duda: "campogram-consensus--duda",
  "Seguir viendo": "campogram-consensus--seguir",
  Descartar: "campogram-consensus--descartar",
  "Sin consenso": "campogram-consensus--sin-consenso",
  "Sin informes": "campogram-consensus--sin-informes",
};

const CATEGORY_LEGEND = [
  { label: "2ª DIV", className: "campogram-category--second" },
  { label: "1RFEF", className: "campogram-category--first-rfef" },
  { label: "2RFEF", className: "campogram-category--second-rfef" },
  { label: "3RFEF/DH/SE", className: "campogram-category--lower" },
  { label: "Internacional", className: "campogram-category--foreign" },
  { label: "Otra", className: "campogram-category--other" },
];

function normalizeKey(value: string | null | undefined) {
  return (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .toLocaleLowerCase("es");
}

function normalizePosition(value: string | null | undefined) {
  const raw = (value || "").trim().toLocaleUpperCase("es").replace(/\s+/g, " ");
  if (!raw) return "Sin posición";
  const compact = raw.replace(/\s+/g, "");
  const aliases: Record<string, string> = {
    POR1: "POR 1",
    LTD2: "LTD 2",
    LTI3: "LTI 3",
    DFC4: "DFC 4",
    DFC5: "DFC 5",
    MC6: "MC 6",
    MC8: "MC 8",
    ED7: "ED 7",
    EI11: "EI 11",
    DC9: "DC 9",
    "DC/MP10": "DC/MP 10",
    "SD/MP10": "DC/MP 10",
    MP10: "DC/MP 10",
  };
  return aliases[compact] || raw;
}

function positionSortValue(position: string) {
  const index = POSITION_ORDER.indexOf(position as (typeof POSITION_ORDER)[number]);
  return index === -1 ? 100 + position.localeCompare("ZZZ", "es") : index;
}

function consensusSortValue(status: string) {
  const index = CONSENSUS_ORDER.indexOf(status as (typeof CONSENSUS_ORDER)[number]);
  return index === -1 ? CONSENSUS_ORDER.length : index;
}

function normalizeVerdict(value: string | null | undefined) {
  const key = normalizeKey(value);
  if (!key) return "";
  if (key.includes("fichar")) return "Fichar";
  if (key.includes("duda")) return "Duda";
  if (key.includes("seguir")) return "Seguir viendo";
  if (key.includes("descartar")) return "Descartar";
  return value?.trim() || "";
}

function textValue(value: unknown) {
  if (value === null || value === undefined) return "";
  const text = String(value).trim();
  return text;
}

function firstText(...values: unknown[]) {
  for (const value of values) {
    const text = textValue(value);
    if (text) return text;
  }
  return "";
}

function rawText(row: { raw_data: Record<string, unknown> | null }, ...keys: string[]) {
  const raw = row.raw_data || {};
  for (const key of keys) {
    const value = firstText(raw[key]);
    if (value) return value;
  }
  return "";
}

function displayText(...values: unknown[]) {
  return firstText(...values) || "-";
}

function displayLoaned(player: CampogramPlayer) {
  const rawLoaned = rawText(player, "cedido", "cesion");
  if (rawLoaned) return rawLoaned;
  if (player.loaned === null) return "-";
  return player.loaned ? "Sí" : "No";
}

function birthYearWithAge(value: unknown) {
  const text = textValue(value);
  if (!text) return "-";
  const year = Number.parseInt(text, 10);
  if (!Number.isFinite(year)) return text;
  const age = 2026 - year;
  if (age < 0 || age > 80) return text;
  return `${year} / ${age} años`;
}

function reportScoutName(report: CampogramReport) {
  return displayText(report.scout_name, rawText(report, "scout", "nombre_del_scout"));
}

function reportComment(report: CampogramReport, field: "technical" | "physical" | "psychological") {
  if (field === "technical") {
    return displayText(report.technical_comment, rawText(report, "comentario_tecnico", "valoracion_tecnico_tactica"));
  }
  if (field === "physical") {
    return displayText(report.physical_comment, rawText(report, "comentario_fisico", "valoracion_fisica_condicional"));
  }
  return displayText(report.psychological_comment, rawText(report, "comentario_psicologico", "valoracion_psicologica_actitudinal"));
}

function consensusFromReports(reports: CampogramReport[]) {
  if (!reports.length) return "Sin informes";
  const counts = new Map<string, number>();
  for (const report of reports) {
    const verdict = normalizeVerdict(report.verdict);
    if (!verdict) continue;
    counts.set(verdict, (counts.get(verdict) || 0) + 1);
  }
  if (!counts.size) return "Sin informes";
  const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  if (sorted.length > 1 && sorted[0][1] === sorted[1][1]) return "Sin consenso";
  return sorted[0][0];
}

function categoryClass(category: string | null) {
  const key = normalizeKey(category);
  if (key.includes("2 div")) return "campogram-category--second";
  if (key.includes("1 rfef") || key.includes("1rfef")) return "campogram-category--first-rfef";
  if (key.includes("2 rfef") || key.includes("2rfef")) return "campogram-category--second-rfef";
  if (key.includes("3 rfef") || key.includes("dh") || key.includes("se")) return "campogram-category--lower";
  if (key.includes("extranj") || key.includes("francia") || key.includes("grecia")) {
    return "campogram-category--foreign";
  }
  return "campogram-category--other";
}

function campogramPlayerIdentity(player: CampogramPlayer) {
  return [
    player.campogram_id,
    normalizeKey(player.player_name),
    normalizeKey(player.team_name),
    normalizePosition(player.position),
    textValue(player.birth_year),
  ].join("|");
}

function mergeCampogramPlayer(base: CampogramPlayer, duplicate: CampogramPlayer): CampogramPlayer {
  return {
    ...base,
    team_name: base.team_name || duplicate.team_name,
    loaned: base.loaned ?? duplicate.loaned,
    owner_team_name: base.owner_team_name || duplicate.owner_team_name,
    category: base.category || duplicate.category,
    birth_year: base.birth_year ?? duplicate.birth_year,
    position: base.position || duplicate.position,
    agent: base.agent || duplicate.agent,
    foot: base.foot || duplicate.foot,
    raw_data: {
      ...(duplicate.raw_data || {}),
      ...(base.raw_data || {}),
    },
  };
}

function dedupeCampogramPlayers(players: CampogramPlayer[]) {
  const byKey = new Map<string, CampogramPlayer>();
  const order: string[] = [];

  for (const player of players) {
    const key = campogramPlayerIdentity(player);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, player);
      order.push(key);
      continue;
    }
    byKey.set(key, mergeCampogramPlayer(existing, player));
  }

  return order.map((key) => byKey.get(key)).filter(Boolean) as CampogramPlayer[];
}

function buildCanonicalPlayerIdMap(players: CampogramPlayer[], canonicalPlayers: CampogramPlayer[]) {
  const canonicalByKey = new Map(canonicalPlayers.map((player) => [campogramPlayerIdentity(player), player.id]));
  const canonicalIdByPlayerId = new Map<string, string>();

  for (const player of players) {
    canonicalIdByPlayerId.set(player.id, canonicalByKey.get(campogramPlayerIdentity(player)) || player.id);
  }

  return canonicalIdByPlayerId;
}

function reportIdentity(report: CampogramReport) {
  // El nombre del equipo queda intencionalmente fuera de la clave:
  // el mismo informe puede llegar con grafías distintas del equipo
  // ("Juventus Torremolinos" vs "JUVENTUD TORREMOLINOS") y provocar
  // duplicados aunque el contenido sea idéntico. La huella se basa
  // en campograma + jugador + scout + contenido de los tres bloques.
  return [
    report.campogram_id || normalizeKey(report.campogram_name),
    normalizeKey(report.player_name),
    normalizeKey(report.scout_email || report.scout_name),
    normalizePosition(report.position),
    normalizeVerdict(report.verdict),
    textValue(report.report_date),
    normalizeKey(report.technical_comment || rawText(report, "comentario_tecnico", "valoracion_tecnico_tactica")),
    normalizeKey(report.physical_comment || rawText(report, "comentario_fisico", "valoracion_fisica_condicional")),
    normalizeKey(report.psychological_comment || rawText(report, "comentario_psicologico", "valoracion_psicologica_actitudinal")),
  ].join("|");
}

function dedupeCampogramReports(reports: CampogramReport[]) {
  const byKey = new Map<string, CampogramReport>();
  const order: string[] = [];

  for (const report of reports) {
    const key = reportIdentity(report);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, report);
      order.push(key);
      continue;
    }
    byKey.set(key, {
      ...existing,
      campogram_player_id: existing.campogram_player_id || report.campogram_player_id,
      raw_data: {
        ...(report.raw_data || {}),
        ...(existing.raw_data || {}),
      },
    });
  }

  return order.map((key) => byKey.get(key)).filter(Boolean) as CampogramReport[];
}

function reportsForPlayer(
  player: CampogramPlayer,
  reports: CampogramReport[],
  canonicalIdByPlayerId: Map<string, string>,
) {
  const playerKey = normalizeKey(player.player_name);
  const playerTeamKey = normalizeKey(player.team_name);
  return reports.filter((report) => {
    if (report.campogram_player_id) {
      const canonicalReportPlayerId = canonicalIdByPlayerId.get(report.campogram_player_id) || report.campogram_player_id;
      if (canonicalReportPlayerId === player.id) return true;
    }

    const reportTeamKey = normalizeKey(report.team_name);
    const sameTeam = !playerTeamKey || !reportTeamKey || playerTeamKey === reportTeamKey;
    return report.campogram_id === player.campogram_id && normalizeKey(report.player_name) === playerKey && sameTeam;
  });
}

function buildReportMap(
  players: CampogramPlayer[],
  reports: CampogramReport[],
  canonicalIdByPlayerId: Map<string, string>,
) {
  const map = new Map<string, CampogramReport[]>();
  for (const player of players) {
    map.set(player.id, reportsForPlayer(player, reports, canonicalIdByPlayerId));
  }
  return map;
}

function playerStatus(player: CampogramPlayer, reportMap: Map<string, CampogramReport[]>) {
  return consensusFromReports(reportMap.get(player.id) || []);
}

// Palabras irrelevantes en nombres de equipos (artículos, prefijos, abreviaciones comunes)
const TEAM_STOPWORDS = new Set([
  "cf", "ud", "cd", "sd", "rc", "fc", "club", "real", "de", "la", "el",
  "los", "las", "at", "b", "ii", "c", "juventud",
]);

/**
 * Normaliza el nombre del equipo eliminando stopwords para comparaciones más robustas.
 * "ZAMORA CF" → "zamora", "Real Avilés" → "aviles", "Atlético Madrid B" → "atletico madrid"
 */
function normalizeTeamKey(team: string | null | undefined): string {
  return normalizeKey(team || "")
    .split(/\s+/)
    .filter((t) => t && !TEAM_STOPWORDS.has(t))
    .join(" ");
}

/**
 * Solapamiento de tokens entre dos nombres de equipo normalizados (0–1).
 * Incluye coincidencia por subcadena (≥4 chars) para cubrir abreviaciones:
 * "nastic" ⊂ "gimnastic" → 1.0  ("Nástic" = "Gimnàstic Tarragona")
 */
function teamTokenOverlap(teamA: string, teamB: string): number {
  const tA = teamA.split(/\s+/).filter(Boolean);
  const tB = teamB.split(/\s+/).filter(Boolean);
  if (!tA.length || !tB.length) return 0;
  let shared = 0;
  for (const a of tA) {
    const match = tB.some(
      (b) =>
        b === a ||
        (a.length >= 4 && b.includes(a)) ||
        (b.length >= 4 && a.includes(b)),
    );
    if (match) shared++;
  }
  return shared / Math.min(tA.length, tB.length);
}

function objectiveTeamKey(player: ObjectivePlayer | undefined) {
  return normalizeTeamKey(player?.current_team_name || player?.last_club_name || "");
}

function compactMetricLabel(label: string) {
  return label.length > 24 ? `${label.slice(0, 24)}…` : label;
}

/** Devuelve el dataset de Wyscout correspondiente a la categoría del campograma, o null si no aplica. */
function campogramCategoryToDataset(category: string | null): string | null {
  const key = normalizeKey(category || "");
  if (key.includes("1 rfef") || key.includes("1rfef") || key.includes("primera division rfef")) {
    return "1rfef_2025_26";
  }
  if (key.includes("2 rfef") || key.includes("2rfef") || key.includes("segunda division rfef")) {
    return "2rfef_2025_26";
  }
  return null;
}

/** Similitud Jaccard entre tokens de dos nombres normalizados (0–1). */
function nameTokenSimilarity(a: string, b: string): number {
  const tokensA = new Set(normalizeKey(a).split(/\s+/).filter(Boolean));
  const tokensB = new Set(normalizeKey(b).split(/\s+/).filter(Boolean));
  if (!tokensA.size || !tokensB.size) return 0;
  let shared = 0;
  for (const token of tokensA) {
    if (tokensB.has(token)) shared++;
  }
  const union = tokensA.size + tokensB.size - shared;
  return union > 0 ? shared / union : 0;
}

/**
 * Búsqueda directa en objectivePlayers por nombre + dataset derivado de la categoría.
 * Se usa como fallback cuando el jugador no tiene informes subjetivos cruzados.
 *
 * Estrategia de scoring (mayor primero):
 *  1. Coincidencia exacta normalizada → 1.0
 *  2. Containment check: todos los tokens del campograma (≥2) aparecen en el nombre objetivo → 0.85
 *  3. Apellido + equipo + inicial/prefijo del primer nombre → 0.70
 *     ("Josh Farrell" ZAMORA CF → "J. Farrell"/"Joshua Farrell" Zamora)
 *  4. Primer nombre + equipo (cubre cambio de apellido) → 0.60
 *     ("Salifo Mendes" Guadalajara → "Salifo Caropitche" Guadalajara)
 *     ("Marco Manchón" Extremadura → "Marco González" Extremadura)
 *  5. Token único + equipo + inicial (apodos de un solo token) → 0.60
 *     ("Dela" Celta Fortuna → "David De La Iglesia" Celta Fortuna)
 *  6. Jaccard token similarity ≥ 0.4
 */
function findDirectObjectivePlayer(
  player: CampogramPlayer,
  objectivePlayers: ObjectivePlayer[],
  minSimilarity = 0.4,
): ObjectivePlayer | null {
  const dataset = campogramCategoryToDataset(player.category);
  if (!dataset) return null;

  const playerNameKey = normalizeKey(player.player_name);
  const playerTokens = playerNameKey.split(/\s+/).filter(Boolean);
  const playerTeamKey = normalizeTeamKey(player.team_name);
  let bestPlayer: ObjectivePlayer | null = null;
  let bestScore = -1;

  for (const op of objectivePlayers) {
    if (op.objective_dataset !== dataset) continue;

    const opFullKey = normalizeKey(op.full_name || "");
    const opShortKey = normalizeKey(op.name || "");

    // 1. Coincidencia exacta → mejor puntuación posible
    if (opFullKey === playerNameKey || opShortKey === playerNameKey) {
      if (1.0 > bestScore) {
        bestScore = 1.0;
        bestPlayer = op;
      }
      continue;
    }

    // 2. Containment: todos los tokens del campograma aparecen en el nombre objetivo (≥ 2 tokens)
    let containScore = 0;
    if (playerTokens.length >= 2) {
      const opFullTokens = new Set(opFullKey.split(/\s+/).filter(Boolean));
      const opShortTokens = new Set(opShortKey.split(/\s+/).filter(Boolean));
      if (playerTokens.every((t) => opFullTokens.has(t)) || playerTokens.every((t) => opShortTokens.has(t))) {
        containScore = 0.85;
      }
    }

    const opTeamKey = playerTeamKey ? normalizeTeamKey(op.current_team_name) : "";
    const teamOverlap = playerTeamKey && opTeamKey ? teamTokenOverlap(playerTeamKey, opTeamKey) : 0;

    // 3. Apellido + equipo + inicial/prefijo del primer nombre
    //    Cubre apodos abreviados: "Josh"→"Joshua", "Gero"→"Gerónimo", "Fran"→"Francisco"
    let surnameTeamScore = 0;
    if (playerTokens.length >= 2 && teamOverlap >= 0.4) {
      const surname = playerTokens[playerTokens.length - 1];
      const opFullTokens = new Set(opFullKey.split(/\s+/).filter(Boolean));
      const opShortTokens = new Set(opShortKey.split(/\s+/).filter(Boolean));
      if (opFullTokens.has(surname) || opShortTokens.has(surname)) {
        const campFirstToken = playerTokens[0] ?? "";
        const campFirstInitial = campFirstToken[0] ?? "";
        const opFullFirstToken = opFullKey.split(/\s+/)[0] ?? "";
        const opShortFirstToken = opShortKey.split(/\s+/)[0] ?? "";
        const initialMatches =
          campFirstInitial !== "" &&
          (opFullFirstToken[0] === campFirstInitial ||
            opShortFirstToken[0] === campFirstInitial ||
            opShortFirstToken === campFirstInitial ||
            opFullKey.split(/\s+/).some((t) => t.startsWith(campFirstToken)));
        if (initialMatches) {
          surnameTeamScore = 0.70;
        }
      }
    }

    // 4. Primer nombre + equipo (cubre cambio de apellido real vs apodo/mote)
    //    "Salifo Mendes" Guadalajara → "Salifo Caropitche" Guadalajara
    //    "Marco Manchón" Extremadura → "Marco González Martínez" Extremadura
    let firstNameTeamScore = 0;
    if (playerTokens.length >= 2 && teamOverlap >= 0.5) {
      const firstName = playerTokens[0];
      const opFullTokens = opFullKey.split(/\s+/).filter(Boolean);
      if (opFullTokens.some((t) => t === firstName || t.startsWith(firstName))) {
        firstNameTeamScore = 0.60;
      }
    }

    // 5. Token único + equipo + subcadena en nombre concatenado
    //    "Dela" Celta Fortuna → "David De La Iglesia Rey" Celta Fortuna
    //    "dela" ⊂ "david"+"de"+"la"+"iglesia"+"rey" = "davidelaiglesiarey" ✓
    //    Rechaza "Juanda" → "Jonnier Fernando Torres Bazán" porque "juanda" ∉ "jonnierfernandotorresbazan" ✓
    let singleTokenTeamScore = 0;
    if (playerTokens.length === 1 && teamOverlap >= 0.5) {
      const campToken = playerTokens[0];
      if (campToken.length >= 3) {
        const opConcatKey = opFullKey.replace(/\s+/g, "");
        if (opConcatKey.includes(campToken)) {
          singleTokenTeamScore = 0.60;
        }
      }
    }

    // 6. Jaccard token similarity
    const jaccardFull = nameTokenSimilarity(playerNameKey, op.full_name || "");
    const jaccardShort = nameTokenSimilarity(playerNameKey, op.name || "");
    const score = Math.max(containScore, surnameTeamScore, firstNameTeamScore, singleTokenTeamScore, jaccardFull, jaccardShort);

    if (score >= minSimilarity && score > bestScore) {
      bestScore = score;
      bestPlayer = op;
    }
  }
  return bestPlayer;
}

function buildCampogramObjectiveCandidates(
  player: CampogramPlayer,
  objectiveMatches: ObjectivePlayerMatch[],
  objectivePlayersById: Map<string, ObjectivePlayer>,
) {
  const playerNameKey = normalizeKey(player.player_name);
  const teamKey = normalizeTeamKey(player.team_name);
  const positionKey = normalizeKey(player.position);

  return objectiveMatches
    .map((match) => {
      const objectivePlayer =
        match.objective_player ||
        (match.objective_player_id ? objectivePlayersById.get(match.objective_player_id) : undefined);
      if (!objectivePlayer) return null;

      // Fuzzy name matching: exact → 1.0, Jaccard ≥ 0.5 → accepted
      const exactMatch =
        normalizeKey(match.scouting_player_name) === playerNameKey ||
        normalizeKey(match.objective_full_name) === playerNameKey ||
        normalizeKey(objectivePlayer.full_name || objectivePlayer.name) === playerNameKey;

      const nameSimilarity = exactMatch
        ? 1.0
        : Math.max(
            nameTokenSimilarity(match.scouting_player_name || "", player.player_name),
            nameTokenSimilarity(match.objective_full_name || "", player.player_name),
            nameTokenSimilarity(objectivePlayer.full_name || "", player.player_name),
            nameTokenSimilarity(objectivePlayer.name || "", player.player_name),
          );

      if (nameSimilarity < 0.5) return null;

      const objectivePlayerTeamKey = objectiveTeamKey(objectivePlayer);
      const sameTeam = !teamKey || !objectivePlayerTeamKey || teamTokenOverlap(teamKey, objectivePlayerTeamKey) >= 0.4;
      const samePosition =
        !positionKey ||
        positionKey === normalizeKey(objectivePlayer.primary_position_label) ||
        positionKey === normalizeKey(objectivePlayer.secondary_position_label);

      return {
        match,
        objectivePlayer,
        nameSimilarity,
        samePosition,
        sameTeam,
      };
    })
    .filter(
      (
        item,
      ): item is {
        match: ObjectivePlayerMatch;
        objectivePlayer: ObjectivePlayer;
        nameSimilarity: number;
        samePosition: boolean;
        sameTeam: boolean;
      } => item !== null,
    )
    .sort((a, b) => {
      if (a.sameTeam !== b.sameTeam) return a.sameTeam ? -1 : 1;
      if (a.samePosition !== b.samePosition) return a.samePosition ? -1 : 1;
      const statusDiff = objectiveMatchRank(a.match.match_status) - objectiveMatchRank(b.match.match_status);
      if (statusDiff !== 0) return statusDiff;
      const nameDiff = b.nameSimilarity - a.nameSimilarity;
      if (Math.abs(nameDiff) > 0.05) return nameDiff;
      return Number(b.match.match_score || 0) - Number(a.match.match_score || 0);
    });
}

function CampogramObjectiveBlock({
  objectiveMatches,
  objectivePlayers,
  player,
}: {
  objectiveMatches: ObjectivePlayerMatch[];
  objectivePlayers: ObjectivePlayer[];
  player: CampogramPlayer;
}) {
  const [mode, setMode] = useState<ObjectiveRadarMode>("specific");
  const objectivePlayersById = useMemo(
    () => new Map(objectivePlayers.map((objectivePlayer) => [objectivePlayer.id, objectivePlayer])),
    [objectivePlayers],
  );

  const bestCandidate = useMemo(() => {
    const candidates = buildCampogramObjectiveCandidates(player, objectiveMatches, objectivePlayersById);
    return candidates[0] || null;
  }, [objectiveMatches, objectivePlayersById, player]);

  // Si no hay match por informes subjetivos, intentamos matching directo por nombre + categoría
  const directObjectivePlayer = useMemo(() => {
    if (bestCandidate) return null;
    return findDirectObjectivePlayer(player, objectivePlayers);
  }, [bestCandidate, objectivePlayers, player]);

  const selectedObjectivePlayer = bestCandidate?.objectivePlayer ?? directObjectivePlayer;
  const radarSpecific = getObjectiveRadarForMode(selectedObjectivePlayer, "specific");
  const radarGeneral = getObjectiveRadarForMode(selectedObjectivePlayer, "general");
  const activeRadar = (mode === "specific" ? radarSpecific : radarGeneral) || radarSpecific || radarGeneral;

  const radarItems = useMemo(() => (activeRadar ? getObjectiveRadarItems(activeRadar) : []), [activeRadar]);
  const radarStrengths = useMemo(
    () => [...radarItems].sort((a, b) => b.value - a.value).slice(0, 3),
    [radarItems],
  );
  const radarAlerts = useMemo(
    () => [...radarItems].sort((a, b) => a.value - b.value).slice(0, 3),
    [radarItems],
  );
  const blockBalance = useMemo(() => getObjectiveRadarBlockBalance(radarItems), [radarItems]);
  const unionValue = useMemo(() => getUnionValue(blockBalance), [blockBalance]);

  const similarPlayers = useMemo(() => {
    if (!selectedObjectivePlayer || !activeRadar) return [];

    const selectedKey = objectivePlayerIdentityKey(selectedObjectivePlayer);
    const seenKeys = new Set<string>(selectedKey ? [selectedKey] : []);
    const comparisonLabelKey = normalizeKey(activeRadar.comparison_label || "");
    const competitionKey = normalizeKey(activeRadar.competition_name || "");

    return objectivePlayers
      .map((candidate) => {
        const candidateKey = objectivePlayerIdentityKey(candidate);
        if (!candidateKey || seenKeys.has(candidateKey)) return null;

        const candidateRadar = getObjectiveRadarForMode(candidate, mode);
        if (!candidateRadar) return null;
        const sameCompetition = normalizeKey(candidateRadar.competition_name || "") === competitionKey;
        const sameComparison = normalizeKey(candidateRadar.comparison_label || "") === comparisonLabelKey;
        if (!sameCompetition || !sameComparison) return null;

        const similarity = calculateRadarSimilarity(activeRadar, candidateRadar);
        if (similarity === null) return null;
        seenKeys.add(candidateKey);

        return {
          objectivePlayer: candidate,
          similarity,
          blockBalance: getObjectiveRadarBlockBalance(getObjectiveRadarItems(candidateRadar)),
        };
      })
      .filter(
        (
          candidate,
        ): candidate is {
          objectivePlayer: ObjectivePlayer;
          similarity: number;
          blockBalance: ReturnType<typeof getObjectiveRadarBlockBalance>;
        } => candidate !== null,
      )
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 3);
  }, [activeRadar, mode, objectivePlayers, selectedObjectivePlayer]);

  if (!selectedObjectivePlayer || !activeRadar) return null;

  return (
    <section className="campogram-objective">
      <div className="campogram-objective__head">
        <div>
          <span className="profile-kicker">Datos objetivos Wyscout</span>
          <h3>Parte objetiva del jugador</h3>
        </div>
        <div className="campogram-objective__status">
          {bestCandidate ? (
            <span className={objectiveStatusClass(bestCandidate.match.match_status)}>
              {objectiveStatusLabel(bestCandidate.match.match_status)}
            </span>
          ) : (
            <span className="objective-status objective-status--directo">Match directo</span>
          )}
        </div>
      </div>
      <p className="campogram-objective__meta">
        {mode === "specific" ? "Según posición específica" : "Según posición general"} ·{" "}
        {activeRadar.competition_name || "Competición"} · muestra {activeRadar.sample_count || "-"} · actualizado{" "}
        {formatObjectiveUpdatedAt(selectedObjectivePlayer.updated_at) || "-"}
      </p>
      {/* Radar + insights en dos columnas para aprovechar el espacio lateral */}
      <div className="campogram-objective__radar-panel">
        <ObjectiveRadar
          compact
          mode={mode}
          onModeChange={setMode}
          radar={activeRadar}
          radarGeneral={radarGeneral}
          radarSpecific={radarSpecific}
        />
        <div className="campogram-objective__insights-panel">
          {/* Encabezado de comparación: categoría + perfil de comparación */}
          <p className="campogram-objective__comparison-head">
            vs {activeRadar.comparison_label || (mode === "specific" ? "posición específica" : "familia posicional")}
            {activeRadar.competition_name ? ` · ${activeRadar.competition_name}` : ""}
            {activeRadar.sample_count ? ` · muestra ${activeRadar.sample_count}` : ""}
            {" · percentiles 0-100"}
          </p>
          <div className="campogram-objective__summary-grid">
            <div className="campogram-objective__summary-card">
              <h4>Fortalezas</h4>
              {radarStrengths.map((item) => (
                <div className="objective-radar-insight-row" key={`camp-strength-${item.key}`}>
                  <span className={radarPercentileClass(item.value)}>{item.value}</span>
                  <p>{compactMetricLabel(item.label)}</p>
                </div>
              ))}
            </div>
            <div className="campogram-objective__summary-card">
              <h4>A revisar</h4>
              {radarAlerts.map((item) => (
                <div className="objective-radar-insight-row" key={`camp-alert-${item.key}`}>
                  <span className={radarPercentileClass(item.value)}>{item.value}</span>
                  <p>{compactMetricLabel(item.label)}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="campogram-objective__summary-card">
            <h4>Balance por bloques</h4>
            {blockBalance.map((group) => (
              <div className="objective-radar-balance-row" key={`camp-balance-${group.key}`}>
                <div>
                  <span>
                    <i className={group.className} />
                    {group.title}
                  </span>
                  <strong>{group.average}</strong>
                </div>
                <div className="objective-radar-balance-track">
                  <span
                    className={radarPercentileClass(group.average)}
                    style={{ width: `${Math.max(4, group.average)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
          <div className="objective-radar-union-value">
            <span>Union Value</span>
            <strong>{unionValue}</strong>
            <p>Promedio de Ataque, Posesión y Defensa</p>
          </div>
        </div>
      </div>
      <div className="campogram-objective__similar">
        <div className="campogram-objective__similar-head">
          <h4>3 jugadores similares</h4>
          <span>{activeRadar.competition_name || "Competición"}</span>
        </div>
        <div className="campogram-objective__similar-grid">
          {similarPlayers.map((candidate) => {
            const candidateUnionValue = getUnionValue(candidate.blockBalance);
            return (
              <article className="objective-similar-card campogram-objective__similar-card" key={candidate.objectivePlayer.id}>
                <div className="objective-similar-card__head">
                  <div className="objective-similar-card__identity">
                    <img
                      alt={candidate.objectivePlayer.full_name || candidate.objectivePlayer.name || "Jugador similar"}
                      src={candidate.objectivePlayer.image || candidate.objectivePlayer.current_team_logo || ""}
                    />
                    <div>
                      <strong>{candidate.objectivePlayer.full_name || candidate.objectivePlayer.name || "Jugador similar"}</strong>
                      <span>{candidate.objectivePlayer.current_team_name || "-"}</span>
                    </div>
                  </div>
                  <span className="objective-similar-card__badge">{candidate.similarity}%</span>
                </div>
                <div className="objective-similar-card__meta">
                  <span>{formatObjectiveAge(candidate.objectivePlayer)}</span>
                  <span>{candidate.objectivePlayer.primary_position_label || "-"}</span>
                  {formatComparableVolume(candidate.objectivePlayer) ? (
                    <span>{formatComparableVolume(candidate.objectivePlayer)}</span>
                  ) : null}
                </div>
                <div className="objective-similar-card__balance">
                  {candidate.blockBalance.map((group) => (
                    <div className="objective-radar-balance-row" key={`sim-bal-${group.key}`}>
                      <div>
                        <span>
                          <i className={group.className} />
                          {group.title}
                        </span>
                        <strong>{group.average}</strong>
                      </div>
                      <div className="objective-radar-balance-track">
                        <span
                          className={radarPercentileClass(group.average)}
                          style={{ width: `${Math.max(4, group.average)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                  <div className="objective-similar-card__union-value-row">
                    <span>Union Value</span>
                    <strong>{candidateUnionValue}</strong>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="mini-metric campogram-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function OverviewLegend() {
  return (
    <div className="campogram-legend">
      <strong>Leyenda General de los Minigráficos</strong>
      <div>
        {CONSENSUS_ORDER.map((label) => (
          <span key={label}>
            <i style={{ background: CONSENSUS_COLORS[label] }} />
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}

function PositionMiniBars({
  players,
  reportMap,
}: {
  players: CampogramPlayer[];
  reportMap: Map<string, CampogramReport[]>;
}) {
  const maxTotal = Math.max(1, ...POSITION_ORDER.map((position) => players.filter((p) => normalizePosition(p.position) === position).length));

  return (
    <div className="campogram-mini-bars">
      {POSITION_ORDER.map((position) => {
        const positionPlayers = players.filter((player) => normalizePosition(player.position) === position);
        const total = positionPlayers.length;
        const counts = CONSENSUS_ORDER.map((label) => ({
          label,
          value: positionPlayers.filter((player) => playerStatus(player, reportMap) === label).length,
        }));
        return (
          <div className="campogram-mini-position" key={position}>
            <div className="campogram-mini-position__bars" style={{ height: `${Math.max(18, (total / maxTotal) * 78)}px` }}>
              {counts.map((count) =>
                count.value ? (
                  <i
                    key={count.label}
                    data-label={count.label}
                    style={{
                      background: CONSENSUS_COLORS[count.label],
                      height: `${Math.max(16, (count.value / Math.max(1, total)) * 100)}%`,
                    }}
                    title={`${count.label}: ${count.value}`}
                  >
                    <span>{count.value}</span>
                  </i>
                ) : null,
              )}
            </div>
            <strong>{position}</strong>
            <span>{total}J</span>
          </div>
        );
      })}
    </div>
  );
}

function OverviewCard({
  campogram,
  players,
  reportMap,
}: {
  campogram: Campogram;
  players: CampogramPlayer[];
  reportMap: Map<string, CampogramReport[]>;
}) {
  return (
    <article className="campogram-overview-card">
      <h3>{campogram.name}</h3>
      <PositionMiniBars players={players} reportMap={reportMap} />
    </article>
  );
}

function PositionDistribution({
  players,
  reportMap,
}: {
  players: CampogramPlayer[];
  reportMap: Map<string, CampogramReport[]>;
}) {
  return (
    <article className="campogram-position-distribution">
      <PositionMiniBars players={players} reportMap={reportMap} />
    </article>
  );
}

function PlayerDetailContent({
  player,
  reports,
  status,
  objectiveMatches,
  objectivePlayers,
}: {
  player: CampogramPlayer;
  reports: CampogramReport[];
  status: string;
  objectiveMatches: ObjectivePlayerMatch[];
  objectivePlayers: ObjectivePlayer[];
}) {
  const scouts = Array.from(new Set(reports.map((report) => reportScoutName(report)).filter((value) => value !== "-"))).join(", ");
  const latestReport = reports[0]?.report_date || null;
  const campogramName = displayText(
    rawText(player, "campograma_canonico", "campograma"),
    reports[0]?.campogram_name,
  );

  return (
    <div className="campogram-detail-content">
      <div className="campogram-detail__grid">
        <span><strong>Equipo</strong>{displayText(player.team_name, rawText(player, "equipo_actual", "situacion_equipo"))}</span>
        <span><strong>Categoría</strong>{displayText(player.category, rawText(player, "categoria"))}</span>
        <span><strong>Año nac.</strong>{birthYearWithAge(firstText(player.birth_year, rawText(player, "ano_nacimiento", "edad")))}</span>
        <span><strong>Posición base</strong>{normalizePosition(player.position)}</span>
        <span><strong>Campograma</strong>{campogramName}</span>
        <span><strong>Situación equipo</strong>{displayText(rawText(player, "situacion_equipo"), player.team_name)}</span>
        <span><strong>Agente</strong>{displayText(player.agent, rawText(player, "agente"))}</span>
        <span><strong>Cesión</strong>{displayLoaned(player)}</span>
        <span><strong>Propietario</strong>{displayText(player.owner_team_name, rawText(player, "equipo_propietario"))}</span>
        <span><strong>Lateralidad</strong>{displayText(player.foot, rawText(player, "lateralidad"))}</span>
        <span><strong>Consenso</strong>{status}</span>
        <span><strong>Nº informes</strong>{reports.length}</span>
        <span><strong>Scouts</strong>{displayText(scouts)}</span>
        <span><strong>Último informe</strong>{latestReport ? formatDate(latestReport) : "-"}</span>
      </div>

      <CampogramObjectiveBlock
        objectiveMatches={objectiveMatches}
        objectivePlayers={objectivePlayers}
        player={player}
      />

      <div className="campogram-report-list">
        {reports.length ? (
          reports.map((report) => (
            <article className="campogram-report-card" key={report.id}>
              <div className="campogram-report-card__head">
                <strong>{reportScoutName(report)}</strong>
                <span className={CONSENSUS_CLASS[normalizeVerdict(report.verdict)] || "campogram-consensus--sin-informes"}>
                  {normalizeVerdict(report.verdict) || "Sin valoración"}
                </span>
              </div>
              <small>{formatDate(report.report_date)}</small>
              <div className="campogram-report-card__facts">
                <span>{displayText(report.team_name, rawText(report, "equipo"))}</span>
                <span>{displayText(report.category, rawText(report, "categoria"))}</span>
                <span>{displayText(normalizePosition(report.position), rawText(report, "posicion"))}</span>
              </div>
              <p><strong>Técnico/táctico:</strong> {reportComment(report, "technical")}</p>
              <p><strong>Físico/condicional:</strong> {reportComment(report, "physical")}</p>
              <p><strong>Psicológico/actitudinal:</strong> {reportComment(report, "psychological")}</p>
            </article>
          ))
        ) : (
          <p className="empty-state">Sin informes asociados todavía.</p>
        )}
      </div>
    </div>
  );
}

function PlayerDetail({
  player,
  reports,
  status,
  objectiveMatches,
  objectivePlayers,
}: {
  player: CampogramPlayer;
  reports: CampogramReport[];
  status: string;
  objectiveMatches: ObjectivePlayerMatch[];
  objectivePlayers: ObjectivePlayer[];
}) {
  return (
    <details className="campogram-detail">
      <summary>Detalle | {player.player_name}</summary>
      <PlayerDetailContent
        objectiveMatches={objectiveMatches}
        objectivePlayers={objectivePlayers}
        player={player}
        reports={reports}
        status={status}
      />
    </details>
  );
}

function PlayerCard({
  player,
  reports,
  objectiveMatches,
  objectivePlayers,
}: {
  player: CampogramPlayer;
  reports: CampogramReport[];
  objectiveMatches: ObjectivePlayerMatch[];
  objectivePlayers: ObjectivePlayer[];
}) {
  const status = consensusFromReports(reports);
  return (
    <article className={`campogram-player-card ${categoryClass(player.category)}`}>
      <div className="campogram-player-card__top">
        <div>
          <strong>{player.player_name}</strong>
          <span>{player.team_name || "Sin equipo"}</span>
        </div>
        <div className="campogram-player-card__badges">
          <em className={CONSENSUS_CLASS[status] || "campogram-consensus--sin-informes"}>{status}</em>
          <em>{player.category || "Sin categoría"}</em>
        </div>
      </div>
      <small>
        Año nac. {player.birth_year || "-"} · {normalizePosition(player.position)} · Informes {reports.length}
      </small>
      <PlayerDetail
        objectiveMatches={objectiveMatches}
        objectivePlayers={objectivePlayers}
        player={player}
        reports={reports}
        status={status}
      />
    </article>
  );
}

function CompactPlayerCard({
  player,
  reports,
  onSelect,
}: {
  player: CampogramPlayer;
  reports: CampogramReport[];
  onSelect: (player: CampogramPlayer) => void;
}) {
  const status = consensusFromReports(reports);
  return (
    <button
      className={`campogram-compact-card ${categoryClass(player.category)}`}
      onClick={() => onSelect(player)}
      type="button"
    >
      <span className="campogram-compact-card__name">{player.player_name}</span>
      <span className="campogram-compact-card__club">{player.team_name || "Sin equipo"}</span>
      <span className="campogram-compact-card__meta">
        {birthYearWithAge(player.birth_year)} · {player.category || "Sin categoría"}
      </span>
      <em className={CONSENSUS_CLASS[status] || "campogram-consensus--sin-informes"}>{status}</em>
    </button>
  );
}

function PositionPanel({
  players,
  position,
  reportMap,
  objectiveMatches,
  objectivePlayers,
}: {
  players: CampogramPlayer[];
  position: string;
  reportMap: Map<string, CampogramReport[]>;
  objectiveMatches: ObjectivePlayerMatch[];
  objectivePlayers: ObjectivePlayer[];
}) {
  const positionPlayers = players
    .filter((player) => normalizePosition(player.position) === position)
    .sort((a, b) => a.player_name.localeCompare(b.player_name, "es"));

  return (
    <section className="campogram-position-panel">
      <h3>{position}</h3>
      {positionPlayers.length ? (
        positionPlayers.map((player) => (
          <PlayerCard
            key={player.id}
            objectiveMatches={objectiveMatches}
            objectivePlayers={objectivePlayers}
            player={player}
            reports={reportMap.get(player.id) || []}
          />
        ))
      ) : (
        <p>Sin jugadores</p>
      )}
    </section>
  );
}

function PitchPositionPanel({
  players,
  position,
  reportMap,
  onSelectPlayer,
}: {
  players: CampogramPlayer[];
  position: string;
  reportMap: Map<string, CampogramReport[]>;
  onSelectPlayer: (player: CampogramPlayer) => void;
}) {
  const positionPlayers = players
    .filter((player) => normalizePosition(player.position) === position)
    .sort((a, b) => {
      const statusCompare =
        consensusSortValue(playerStatus(a, reportMap)) - consensusSortValue(playerStatus(b, reportMap));
      if (statusCompare !== 0) return statusCompare;
      return a.player_name.localeCompare(b.player_name, "es");
    });

  return (
    <section className={`campogram-pitch-position campogram-pitch-position--${position.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}>
      <div className="campogram-pitch-position__head">
        <h3>{position}</h3>
        <span>{positionPlayers.length}</span>
      </div>
      <div className="campogram-pitch-position__players">
        {positionPlayers.length ? (
          positionPlayers.map((player) => (
            <CompactPlayerCard
              key={player.id}
              onSelect={onSelectPlayer}
              player={player}
              reports={reportMap.get(player.id) || []}
            />
          ))
        ) : (
          <p>Sin jugadores</p>
        )}
      </div>
    </section>
  );
}

function CampogramPitch({
  players,
  reportMap,
  onSelectPlayer,
  objectiveMatches,
  objectivePlayers,
}: {
  players: CampogramPlayer[];
  reportMap: Map<string, CampogramReport[]>;
  onSelectPlayer: (player: CampogramPlayer) => void;
  objectiveMatches: ObjectivePlayerMatch[];
  objectivePlayers: ObjectivePlayer[];
}) {
  const standardPositions = new Set(POSITION_ORDER);
  const extraPositions = Array.from(new Set(players.map((player) => normalizePosition(player.position))))
    .filter((position) => !standardPositions.has(position as (typeof POSITION_ORDER)[number]))
    .sort((a, b) => positionSortValue(a) - positionSortValue(b));

  return (
    <>
      <div className="campogram-pitch-scroll">
        <div className="campogram-pitch">
          <div className="campogram-pitch__grass" />
          <div className="campogram-pitch__center-circle" />
          <div className="campogram-pitch__box campogram-pitch__box--left" />
          <div className="campogram-pitch__box campogram-pitch__box--right" />
          <div className="campogram-pitch__content">
            {PITCH_LINES.map((line) => (
              <div className={`campogram-pitch-line ${line.className}`} key={line.className}>
                {line.positions.map((position) => (
                  <PitchPositionPanel
                    key={position}
                    onSelectPlayer={onSelectPlayer}
                    players={players}
                    position={position}
                    reportMap={reportMap}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="campogram-pitch-legend">
        <div>
          <strong>Categoría</strong>
          <div className="campogram-pitch-legend__items">
            {CATEGORY_LEGEND.map((category) => (
              <span key={category.label}>
                <i className={category.className} />
                {category.label}
              </span>
            ))}
          </div>
        </div>
        <div>
          <strong>Valoración</strong>
          <div className="campogram-pitch-legend__items">
            {CONSENSUS_ORDER.map((label) => (
              <span key={label}>
                <i style={{ background: CONSENSUS_COLORS[label] }} />
                {label}
              </span>
            ))}
          </div>
        </div>
      </div>
      <details className="campogram-classic-list">
        <summary>Ver resumen por posiciones en formato listado</summary>
        <div className="campogram-field">
          {FIELD_ROWS.map((row, rowIndex) => (
            <div className="campogram-field-row" key={rowIndex}>
              {row.map((position, columnIndex) =>
                position ? (
                  <PositionPanel
                    key={position}
                    objectiveMatches={objectiveMatches}
                    objectivePlayers={objectivePlayers}
                    players={players}
                    position={position}
                    reportMap={reportMap}
                  />
                ) : (
                  <div className="campogram-field-spacer" key={`spacer-${rowIndex}-${columnIndex}`} />
                ),
              )}
            </div>
          ))}
        </div>
      </details>
      {extraPositions.length ? (
        <>
          <div className="section-title">
            <h2>Otras posiciones</h2>
            <span>{extraPositions.length}</span>
          </div>
          <div className="campogram-extra-grid">
            {extraPositions.map((position) => (
              <PositionPanel
                key={position}
                objectiveMatches={objectiveMatches}
                objectivePlayers={objectivePlayers}
                players={players}
                position={position}
                reportMap={reportMap}
              />
            ))}
          </div>
        </>
      ) : null}
    </>
  );
}

export function CampogramsView({
  campograms,
  campogramPlayers,
  campogramReports,
  objectiveMatches,
  objectivePlayers,
  focusPlayerId,
  focusPlayerName,
  profile,
}: {
  campograms: Campogram[];
  campogramPlayers: CampogramPlayer[];
  campogramReports: CampogramReport[];
  objectiveMatches: ObjectivePlayerMatch[];
  objectivePlayers: ObjectivePlayer[];
  focusPlayerId?: string;
  focusPlayerName?: string;
  profile?: UserProfile;
}) {
  const [selectedCampogramId, setSelectedCampogramId] = useSessionState<string>("camp:selectedCampogramId", "");
  const [selectedPlayerId, setSelectedPlayerId] = useSessionState<string | null>("camp:selectedPlayerId", null);

  const visibleCampogramPlayers = useMemo(
    () => dedupeCampogramPlayers(campogramPlayers),
    [campogramPlayers],
  );
  const visibleCampogramReports = useMemo(
    () => dedupeCampogramReports(campogramReports),
    [campogramReports],
  );
  const canonicalIdByPlayerId = useMemo(
    () => buildCanonicalPlayerIdMap(campogramPlayers, visibleCampogramPlayers),
    [campogramPlayers, visibleCampogramPlayers],
  );
  const reportMap = useMemo(
    () => buildReportMap(visibleCampogramPlayers, visibleCampogramReports, canonicalIdByPlayerId),
    [visibleCampogramPlayers, visibleCampogramReports, canonicalIdByPlayerId],
  );

  useEffect(() => {
    if (!selectedCampogramId && campograms.length) {
      setSelectedCampogramId(campograms[0].id);
    }
  }, [campograms, selectedCampogramId]);

  useEffect(() => {
    if (!focusPlayerId && !focusPlayerName) return;
    const normalizedFocus = normalizeKey(focusPlayerName);
    const canonicalFocusId = focusPlayerId ? canonicalIdByPlayerId.get(focusPlayerId) || focusPlayerId : "";
    const target = canonicalFocusId
      ? visibleCampogramPlayers.find((player) => player.id === canonicalFocusId)
      : visibleCampogramPlayers.find((player) => normalizeKey(player.player_name) === normalizedFocus);
    if (target?.campogram_id) {
      setSelectedCampogramId(target.campogram_id);
      setSelectedPlayerId(target.id);
    }
  }, [canonicalIdByPlayerId, focusPlayerId, focusPlayerName, visibleCampogramPlayers]);

  const selectedPlayers = visibleCampogramPlayers.filter((player) => player.campogram_id === selectedCampogramId);
  const selectedCampogram = campograms.find((campogram) => campogram.id === selectedCampogramId);
  const selectedPlayer = selectedPlayers.find((player) => player.id === selectedPlayerId) || null;
  const withReports = selectedPlayers.filter((player) => (reportMap.get(player.id) || []).length > 0).length;
  const selectedStatuses = selectedPlayers.map((player) => playerStatus(player, reportMap));
  const sinConsenso = selectedStatuses.filter((status) => status === "Sin consenso").length;
  const allStatuses = visibleCampogramPlayers.map((player) => playerStatus(player, reportMap));
  const isScoutScope = profile?.role === "scout";

  return (
    <section className="campograms-view">
      <div className="section-title">
        <h2>Campogramas</h2>
        <span>{visibleCampogramPlayers.length} jugadores</span>
      </div>

      {isScoutScope ? (
        <div className="role-scope-note">
          <strong>Vista scout</strong>
          <span>
            Ves la estructura completa de campogramas, pero el detalle de informes queda limitado a
            tus valoraciones.
          </span>
        </div>
      ) : null}

      <section className="mini-metrics-grid">
        <Metric label="Jugadores" value={visibleCampogramPlayers.length} />
        <Metric label="Jugadores con informe" value={visibleCampogramPlayers.filter((player) => (reportMap.get(player.id) || []).length > 0).length} />
        <Metric label="Jugadores sin informe" value={allStatuses.filter((status) => status === "Sin informes").length} />
      </section>

      <div className="section-title">
        <h2>Panorama Campogramas</h2>
        <span>{campograms.length}</span>
      </div>
      <section className="campogram-overview-grid">
        {campograms.map((campogram) => (
          <OverviewCard
            campogram={campogram}
            key={campogram.id}
            players={visibleCampogramPlayers.filter((player) => player.campogram_id === campogram.id)}
            reportMap={reportMap}
          />
        ))}
      </section>
      <OverviewLegend />

      <div className="section-title">
        <h2>Seleccionar Campograma</h2>
      </div>
      <label className="inline-control campogram-selector">
        Campograma
        <select
          onChange={(event) => setSelectedCampogramId(event.target.value)}
          value={selectedCampogramId}
        >
          {campograms.map((campogram) => (
            <option key={campogram.id} value={campogram.id}>
              {campogram.name}
            </option>
          ))}
        </select>
      </label>

      <section className="mini-metrics-grid campogram-selected-metrics">
        <Metric label="Jugadores" value={selectedPlayers.length} />
        <Metric label="Con informes" value={withReports} />
        <Metric label="Sin informes" value={selectedPlayers.length - withReports} />
        <Metric label="Sin consenso" value={sinConsenso} />
      </section>

      <div className="section-title">
        <h2>Valoración por posición</h2>
      </div>
      <PositionDistribution players={selectedPlayers} reportMap={reportMap} />

      <div className="section-title">
        <h2>{selectedCampogram?.name || "Campograma"}</h2>
        <span>{selectedPlayers.length} jugadores</span>
      </div>
      <CampogramPitch
        onSelectPlayer={(player) => setSelectedPlayerId(player.id)}
        players={selectedPlayers}
        reportMap={reportMap}
        objectiveMatches={objectiveMatches}
        objectivePlayers={objectivePlayers}
      />
      {selectedPlayer ? (
        <div className="campogram-player-modal" role="dialog" aria-modal="true" aria-label={`Detalle ${selectedPlayer.player_name}`}>
          <button
            aria-label="Cerrar detalle"
            className="campogram-player-modal__backdrop"
            onClick={() => setSelectedPlayerId(null)}
            type="button"
          />
          <article className="campogram-player-modal__panel">
            <header>
              <div>
                <span>Detalle jugador</span>
                <h3>{selectedPlayer.player_name}</h3>
                <p>{selectedPlayer.team_name || "Sin equipo"} · {normalizePosition(selectedPlayer.position)}</p>
              </div>
              <button onClick={() => setSelectedPlayerId(null)} type="button">Cerrar</button>
            </header>
            <PlayerDetailContent
              objectiveMatches={objectiveMatches}
              objectivePlayers={objectivePlayers}
              player={selectedPlayer}
              reports={reportMap.get(selectedPlayer.id) || []}
              status={playerStatus(selectedPlayer, reportMap)}
            />
          </article>
        </div>
      ) : null}
    </section>
  );
}
