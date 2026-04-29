import { useEffect, useState } from "react";
import type { ObjectivePlayer, ObjectivePlayerMatch, PlayerSummary, ScoutingReport } from "../types";
import { formatDate } from "../utils/format";

function normalizeKey(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLocaleLowerCase("es");
}

function rawText(report: ScoutingReport, key: string) {
  const rawData = typeof report.raw_data === "string" ? tryParseJson(report.raw_data) : report.raw_data;
  const value = rawData?.[key];
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value);
  return "";
}

function tryParseJson(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function displayValue(value: string | null | undefined, fallback = "-") {
  return value && value.trim() ? value : fallback;
}

function rawTextFromReports(reports: ScoutingReport[], key: string) {
  for (const report of reports) {
    const value = rawText(report, key);
    if (value) return value;
  }
  return "";
}

function formatRawNumber(value: string) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? String(Math.trunc(numeric)) : value;
}

function formatRawDate(value: string) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(parsed);
}

function formatBirthYearWithAge(value: string) {
  const birthYear = Number(formatRawNumber(value));
  if (!Number.isFinite(birthYear)) return value;
  const currentYear = new Date().getFullYear();
  return `${birthYear} / ${currentYear - birthYear} años`;
}

const VERDICT_ORDER = [
  "A+",
  "A",
  "B",
  "C",
  "D",
  "E",
  "Seguir Valorando",
  "Sin valorar",
  "Filial/Juvenil DH",
  "Sin valoración",
];

const OBJECTIVE_METRICS = [
  ["minutes_on_field", "Minutos"],
  ["total_matches", "Partidos"],
  ["goals", "Goles"],
  ["goals_avg", "Goles/90"],
  ["non_penalty_goal", "Goles sin penalti"],
  ["non_penalty_goal_avg", "Goles sin penalti/90"],
  ["assists_avg", "Asist./90"],
  ["xg_shot", "xG"],
  ["xg_shot_avg", "xG/90"],
  ["xg_assist", "xA"],
  ["xg_assist_avg", "xA/90"],
  ["xg_per_shot", "xG por tiro"],
  ["shots", "Tiros"],
  ["shots_avg", "Tiros/90"],
  ["touch_in_box_avg", "Toques area/90"],
  ["passes_avg", "Pases/90"],
  ["accurate_passes_percent", "% pase"],
  ["forward_passes_avg", "Pases adelante/90"],
  ["passes_to_final_third_avg", "Pases ultimo tercio/90"],
  ["progressive_pass_avg", "Pases prog."],
  ["progressive_run_avg", "Conducciones prog./90"],
  ["dribbles_avg", "Regates/90"],
  ["successful_dribbles_percent", "% regate"],
  ["duels_avg", "Duelos/90"],
  ["duels_won", "% duelos"],
  ["offensive_duels_avg", "Duelos ofens./90"],
  ["offensive_duels_won", "% duelo ofens."],
  ["defensive_duels_avg", "Duelos def."],
  ["defensive_duels_won", "% duelo def."],
  ["aerial_duels_avg", "Aereos/90"],
  ["aerial_duels_won", "% aéreos"],
  ["successful_defensive_actions_avg", "Acciones def./90"],
  ["tackle_avg", "Entradas/90"],
  ["interceptions_avg", "Intercepc."],
  ["shot_block_avg", "Bloqueos/90"],
  ["save_percent", "% paradas"],
  ["clean_sheets", "Porterias a cero"],
  ["prevented_goals", "Goles evitados"],
  ["prevented_goals_avg", "Goles evitados/90"],
  ["xg_save_avg", "xG save/90"],
  ["shots_against", "Tiros recibidos"],
  ["conceded_goals", "Goles encajados"],
  ["goalkeeper_exits_avg", "Salidas/90"],
  ["gk_aerial_duels_avg", "Aereos portero/90"],
  ["back_pass_to_gk_avg", "Cesiones recibidas/90"],
] as const;

const OBJECTIVE_METRIC_LABELS = new Map<string, string>(OBJECTIVE_METRICS);

export type ObjectiveRadarData = {
  params?: string[];
  values?: number[];
  slice_colors?: string[];
  comparison_label?: string | null;
  sample_count?: number | null;
  minimum_minutes?: number | null;
  competition_name?: string | null;
  radar_group?: string | null;
  compare_mode?: string | null;
  fallback_reason?: string | null;
};

export type ObjectiveRadarMode = "specific" | "general";
export type ObjectiveRadarItem = {
  color: string;
  key: string;
  label: string;
  value: number;
  category: "attack" | "possession" | "defense" | "other";
};

export type ObjectiveRadarBlockBalance = {
  key: string;
  title: string;
  className: string;
  average: number;
};

export type ObjectiveSimilarCandidate = {
  objectivePlayer: ObjectivePlayer;
  radar: ObjectiveRadarData;
  similarity: number;
  blockBalance: ObjectiveRadarBlockBalance[];
};

function verdictClass(value: string | null | undefined) {
  const rawValue = value || "Sin valoración";
  if (rawValue === "A+") return "verdict-a-plus";
  const normalized = normalizeKey(rawValue).replace(/[^a-z0-9]+/g, "-");
  return `verdict-${normalized || "sin-valoracion"}`;
}

function reportToneClass(value: string | null | undefined) {
  return verdictClass(value).replace("verdict-", "report-tone-");
}

export function objectiveStatusLabel(value: string | null | undefined) {
  if (value === "seguro") return "Match seguro";
  if (value === "probable") return "Match probable";
  if (value === "dudoso") return "Match dudoso";
  return "Sin match";
}

export function objectiveStatusClass(value: string | null | undefined) {
  return `objective-status objective-status--${value || "sin-match"}`;
}

export function objectiveMatchRank(value: string | null | undefined) {
  return { seguro: 0, probable: 1, dudoso: 2, sin_match: 3 }[value || "sin_match"] ?? 9;
}

function formatMetricValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "-";
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return String(value);
  if (Math.abs(numeric) >= 100) return String(Math.round(numeric));
  return numeric.toFixed(2).replace(/\.00$/, "");
}

function formatFoot(value: string | null | undefined) {
  const normalized = normalizeKey(value || "");
  if (!normalized) return "";
  if (["right", "derecho", "diestro"].includes(normalized)) return "Derecho";
  if (["left", "izquierdo", "zurdo"].includes(normalized)) return "Izquierdo";
  if (["both", "ambos", "ambidiestro"].includes(normalized)) return "Ambos";
  return value || "";
}

export function metricNumber(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

export function getObjectiveRadarData(value: unknown): ObjectiveRadarData | null {
  if (!value || typeof value !== "object") return null;
  const radar = value as ObjectiveRadarData;
  if (!Array.isArray(radar.params) || !Array.isArray(radar.values)) return null;
  if (!radar.params.length || !radar.values.length) return null;
  return radar;
}

function polarPoint(center: number, radius: number, angle: number, value: number) {
  const scaledRadius = radius * Math.max(0, Math.min(100, value)) / 100;
  return {
    x: center + scaledRadius * Math.cos(angle),
    y: center + scaledRadius * Math.sin(angle),
  };
}

function buildRadarPoints(values: number[], center = 142, radius = 92) {
  const total = values.length;
  const points = values
    .map((value, index) => {
      const angle = -Math.PI / 2 + (index * Math.PI * 2) / total;
      const point = polarPoint(center, radius, angle, value);
      return `${point.x.toFixed(1)},${point.y.toFixed(1)}`;
    });

  if (points.length > 2) {
    points.push(points[0]);
  }

  return points.join(" ");
}

function buildRadarPointList(values: number[], center = 142, radius = 92) {
  const total = values.length;
  return values.map((value, index) => {
    const angle = -Math.PI / 2 + (index * Math.PI * 2) / total;
    return {
      angle,
      ...polarPoint(center, radius, angle, value),
    };
  });
}

function formatRadarMetricLabel(value: string) {
  const translations = new Map<string, string>([
    ["asistencias", "Asistencias"],
    ["assistencias", "Asistencias"],
    ["asistencias/90", "Asistencias/90"],
    ["assistencias/90", "Asistencias/90"],
    ["acciones def./90", "Acciones def./90"],
    ["acciones defensivas/90", "Acciones def./90"],
    ["intercepciones/90", "Intercepciones/90"],
    ["duelos def./90", "Duelos def./90"],
    ["% duelo def.", "% duelo def."],
    ["duelos/90", "Duelos/90"],
    ["pases prog./90", "Pases prog./90"],
    ["pases progresivos/90", "Pases prog./90"],
    ["pases adelante/90", "Pases adelante/90"],
    ["pases ultimo tercio/90", "Pases ultimo tercio/90"],
    ["pases último tercio/90", "Pases último tercio/90"],
    ["% pase", "% pase"],
    ["pases/90", "Pases/90"],
    ["conducciones prog./90", "Conducciones prog./90"],
    ["regates/90", "Regates/90"],
    ["% regate", "% regate"],
    ["toques area/90", "Toques area/90"],
    ["toques área/90", "Toques área/90"],
    ["tiros/90", "Tiros/90"],
    ["goles/90", "Goles/90"],
    ["xg/90", "xG/90"],
    ["xa", "xA"],
    ["xa/90", "xA/90"],
  ]);
  return translations.get(normalizeKey(value)) || OBJECTIVE_METRIC_LABELS.get(value) || value;
}

function shortRadarMetricLabel(value: string) {
  return formatRadarMetricLabel(value)
    .replace("Asistencias", "Asist.")
    .replace("Acciones defensivas", "Acc. def.")
    .replace("Acciones def.", "Acc. def.")
    .replace("Intercepciones", "Intercep.")
    .replace("Conducciones", "Cond.")
    .replace("progresivas", "prog.")
    .replace("progresivos", "prog.")
    .replace("adelante", "adel.")
    .replace("último tercio", "últ. tercio")
    .replace("ultimo tercio", "últ. tercio")
    .replace("Toques área", "Toques área")
    .replace("Toques area", "Toques área");
}

function splitRadarLabel(value: string) {
  const label = shortRadarMetricLabel(value);
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
  return lines.slice(0, 2);
}

function radarTextAnchor(x: number, center: number) {
  if (Math.abs(x - center) < 12) return "middle";
  return x > center ? "start" : "end";
}

function radarCategoryFromColor(color: string | undefined) {
  const normalized = (color || "").toLowerCase();
  if (normalized === "#1a78cf") return "attack";
  if (normalized === "#ff9300") return "possession";
  if (normalized === "#d70232") return "defense";
  return "other";
}

export function radarPercentileClass(value: number) {
  if (value >= 80) return "objective-radar-value--elite";
  if (value >= 50) return "objective-radar-value--good";
  if (value >= 25) return "objective-radar-value--medium";
  return "objective-radar-value--low";
}

export function getObjectiveRadarItems(radar: ObjectiveRadarData): ObjectiveRadarItem[] {
  const params = radar.params || [];
  const values = (radar.values || []).map((value) => Number(value) || 0);
  const colors = radar.slice_colors || [];

  return params.map((label, index) => ({
    color: colors[index] || "#16813a",
    key: `${label}-${index}`,
    label: formatRadarMetricLabel(label),
    value: values[index] || 0,
    category: radarCategoryFromColor(colors[index]),
  }));
}

export function getObjectiveRadarBlockBalance(items: ObjectiveRadarItem[]): ObjectiveRadarBlockBalance[] {
  const groups = [
    {
      key: "attack",
      title: "Ataque",
      className: "legend-attack",
      items: items.filter((item) => item.category === "attack").slice(0, 5),
    },
    {
      key: "possession",
      title: "Posesión",
      className: "legend-possession",
      items: items.filter((item) => item.category === "possession").slice(0, 5),
    },
    {
      key: "defense",
      title: "Defensa",
      className: "legend-defense",
      items: items.filter((item) => item.category === "defense").slice(0, 5),
    },
  ];

  return groups.map((group) => {
    const values = group.items.map((item) => item.value);
    const average = values.length
      ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length)
      : 0;
    return {
      key: group.key,
      title: group.title,
      className: group.className,
      average,
    };
  });
}

export function getObjectiveRadarForMode(
  player: ObjectivePlayer | undefined,
  mode: ObjectiveRadarMode,
): ObjectiveRadarData | null {
  if (!player) return null;
  const radarSpecific = getObjectiveRadarData(player.metrics?._radar_specific);
  const radarGeneral = getObjectiveRadarData(player.metrics?._radar_general);
  const radarFallback = getObjectiveRadarData(player.metrics?._radar);
  return mode === "specific" ? radarSpecific || radarFallback : radarGeneral || radarFallback;
}

export function calculateRadarSimilarity(baseRadar: ObjectiveRadarData, candidateRadar: ObjectiveRadarData) {
  const baseItems = getObjectiveRadarItems(baseRadar);
  const candidateValues = new Map(
    getObjectiveRadarItems(candidateRadar).map((item) => [normalizeKey(item.label), item.value]),
  );
  const sharedValues = baseItems
    .map((item) => {
      const candidateValue = candidateValues.get(normalizeKey(item.label));
      if (candidateValue === undefined) return null;
      return Math.abs(item.value - candidateValue);
    })
    .filter((value): value is number => value !== null);

  if (!sharedValues.length) return null;

  const averageDifference =
    sharedValues.reduce((sum, value) => sum + value, 0) / sharedValues.length;
  return Math.max(0, Math.min(100, Math.round(100 - averageDifference)));
}

function buildComparableRadarValues(
  baseRadar: ObjectiveRadarData,
  candidateRadar: ObjectiveRadarData,
) {
  const baseItems = getObjectiveRadarItems(baseRadar);
  const candidateValues = new Map(
    getObjectiveRadarItems(candidateRadar).map((item) => [normalizeKey(item.label), item.value]),
  );

  const sharedItems = baseItems
    .map((item) => {
      const candidateValue = candidateValues.get(normalizeKey(item.label));
      if (candidateValue === undefined) return null;
      return {
        label: item.label,
        selectedValue: item.value,
        candidateValue,
      };
    })
    .filter(
      (
        item,
      ): item is {
        label: string;
        selectedValue: number;
        candidateValue: number;
      } => item !== null,
    );

  return {
    labels: sharedItems.map((item) => item.label),
    selectedValues: sharedItems.map((item) => item.selectedValue),
    candidateValues: sharedItems.map((item) => item.candidateValue),
  };
}

export function formatObjectiveUpdatedAt(value: string | null | undefined) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(parsed);
}

export function formatObjectiveAge(player: ObjectivePlayer) {
  const birthYear = player.birth_year;
  if (!birthYear) return "-";
  return `${new Date().getFullYear() - birthYear} años`;
}

export function getUnionValue(blockBalance: ObjectiveRadarBlockBalance[]) {
  const values = blockBalance.map((group) => group.average).filter((value) => Number.isFinite(value));
  if (!values.length) return 0;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

export function formatComparableVolume(player: ObjectivePlayer) {
  const minutes = metricNumber(player.metrics?.minutes_on_field);
  const matches = metricNumber(player.metrics?.total_matches);

  if (minutes && matches) return `${Math.round(minutes)} min · ${Math.round(matches)} pj`;
  if (minutes) return `${Math.round(minutes)} min`;
  if (matches) return `${Math.round(matches)} pj`;
  return "";
}

export function objectivePlayerIdentityKey(player: ObjectivePlayer) {
  return [
    normalizeKey(player.full_name || player.name || ""),
    normalizeKey(player.current_team_name || ""),
    normalizeKey(player.primary_position_label || ""),
  ].join("|");
}

function buildConsensus(reports: ScoutingReport[]) {
  const counts = new Map<string, number>();

  for (const report of reports) {
    const verdict = displayValue(report.verdict, "");
    if (!verdict) continue;
    counts.set(verdict, (counts.get(verdict) || 0) + 1);
  }

  if (!counts.size) {
    return { label: "Sin veredicto", detail: "-" };
  }

  const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  const topCount = sorted[0][1];
  const topVerdicts = sorted.filter((item) => item[1] === topCount);

  if (topVerdicts.length === 1) {
    return { label: topVerdicts[0][0], detail: `${topVerdicts[0][0]} (${topCount})` };
  }

  return {
    label: "Sin consenso",
    detail: topVerdicts.map(([verdict, count]) => `${verdict} (${count})`).join(" / "),
  };
}

function summarizeRepeated(values: Array<string | null>) {
  const counts = new Map<string, number>();
  const displayNames = new Map<string, string>();

  for (const value of values) {
    if (!value) continue;
    for (const token of value.split(",")) {
      const cleaned = token.trim();
      if (!cleaned) continue;
      const key = normalizeKey(cleaned);
      counts.set(key, (counts.get(key) || 0) + 1);
      displayNames.set(key, cleaned.slice(0, 1).toUpperCase() + cleaned.slice(1));
    }
  }

  return Array.from(counts.entries())
    .filter(([, count]) => count >= 2)
    .map(([key, count]) => ({ label: displayNames.get(key) || key, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "es"));
}

export function ObjectiveRadar({
  compact = false,
  mode,
  onModeChange,
  radar,
  radarGeneral,
  radarSpecific,
}: {
  compact?: boolean;
  mode: ObjectiveRadarMode;
  onModeChange: (mode: ObjectiveRadarMode) => void;
  radar: ObjectiveRadarData;
  radarGeneral: ObjectiveRadarData | null;
  radarSpecific: ObjectiveRadarData | null;
}) {
  const params = radar.params || [];
  const values = (radar.values || []).map((value) => Number(value) || 0);
  const colors = radar.slice_colors || [];
  const center = 170;
  const radius = 100;
  const labelRadius = 136;
  const gridLevels = [25, 50, 75, 100];
  const labelPoints = buildRadarPointList(new Array(values.length).fill(100), center, labelRadius);
  const valuePoints = buildRadarPointList(values, center, radius + 8);
  const comparisonDescription =
    mode === "specific" ? "posición específica" : "familia posicional general";
  const radarItems = params.map((label, index) => ({
    color: colors[index] || "#16813a",
    key: `${label}-${index}`,
    label: formatRadarMetricLabel(label),
    value: values[index] || 0,
    category: radarCategoryFromColor(colors[index]),
  }));
  const radarGroups = [
    {
      key: "attack",
      title: "Ataque",
      className: "legend-attack",
      items: radarItems.filter((item) => item.category === "attack").slice(0, 5),
    },
    {
      key: "possession",
      title: "Posesión",
      className: "legend-possession",
      items: radarItems.filter((item) => item.category === "possession").slice(0, 5),
    },
    {
      key: "defense",
      title: "Defensa",
      className: "legend-defense",
      items: radarItems.filter((item) => item.category === "defense").slice(0, 5),
    },
  ];
  const rankedRadarItems = [...radarItems].sort((a, b) => b.value - a.value);
  const radarStrengths = rankedRadarItems.slice(0, 3);
  const radarAlerts = [...radarItems].sort((a, b) => a.value - b.value).slice(0, 3);
  const radarBlockBalance = radarGroups.map((group) => {
    const valuesInGroup = group.items.map((item) => item.value);
    const average = valuesInGroup.length
      ? Math.round(valuesInGroup.reduce((sum, value) => sum + value, 0) / valuesInGroup.length)
      : 0;
    return { ...group, average };
  });
  const unionValue = getUnionValue(radarBlockBalance);

  return (
    <div className={`objective-radar-card${compact ? " objective-radar-card--compact" : ""}`}>
      <div className="objective-radar-card__head">
        <div>
          <span className="profile-kicker">Radar Wyscout</span>
          <h3>Percentiles por rol</h3>
        </div>
        <div className="objective-radar-controls" aria-label="Modo de comparación radar">
          <button
            className={mode === "specific" ? "active" : ""}
            disabled={!radarSpecific}
            onClick={() => onModeChange("specific")}
            type="button"
          >
            Posición específica
          </button>
          <button
            className={mode === "general" ? "active" : ""}
            disabled={!radarGeneral}
            onClick={() => onModeChange("general")}
            type="button"
          >
            Posición general
          </button>
        </div>
        <p>
          vs {radar.comparison_label || comparisonDescription} · {radar.competition_name || "competición"} ·{" "}
          muestra {radar.sample_count || "-"} · percentiles 0-100
        </p>
      </div>
      {radar.fallback_reason ? (
        <div className="objective-radar-warning">{radar.fallback_reason}</div>
      ) : null}
      <div className={`objective-radar-layout${compact ? " objective-radar-layout--compact" : ""}`}>
        <svg aria-label="Radar Wyscout" className="objective-radar" viewBox="0 0 340 340">
          {gridLevels.map((level) => (
            <polygon
              className="objective-radar__grid"
              key={level}
              points={buildRadarPoints(new Array(values.length).fill(level), center, radius)}
            />
          ))}
          {params.map((label, index) => {
            const angle = -Math.PI / 2 + (index * Math.PI * 2) / params.length;
            const valuePoint = valuePoints[index];
            const labelPoint = labelPoints[index];
            const labelLines = splitRadarLabel(label);
            const anchor = radarTextAnchor(labelPoint.x, center);
            return (
              <g key={`${label}-${index}`}>
                <line
                  className="objective-radar__axis"
                  x1={center}
                  x2={polarPoint(center, radius, angle, 100).x}
                  y1={center}
                  y2={polarPoint(center, radius, angle, 100).y}
                />
                <text
                  className="objective-radar__metric-label"
                  textAnchor={anchor}
                  x={labelPoint.x}
                  y={labelPoint.y}
                >
                  {labelLines.map((line, lineIndex) => (
                    <tspan
                      dy={lineIndex === 0 ? 0 : 10}
                      key={`${label}-${line}`}
                      x={labelPoint.x}
                    >
                      {line}
                    </tspan>
                  ))}
                </text>
                <circle
                  cx={valuePoint.x}
                  cy={valuePoint.y}
                  fill={colors[index] || "#16813a"}
                  r="3.5"
                />
                <text className="objective-radar__value-label" textAnchor="middle" x={valuePoint.x} y={valuePoint.y - 7}>
                  {values[index] || 0}
                </text>
              </g>
            );
          })}
          <polygon className="objective-radar__area" points={buildRadarPoints(values, center, radius)} />
          <polygon className="objective-radar__stroke" points={buildRadarPoints(values, center, radius)} />
        </svg>
        {!compact ? (
          <div className="objective-radar-values">
            {radarGroups.map((group) => (
              <div className="objective-radar-group" key={group.key}>
                <h4>
                  <i className={group.className} />
                  {group.title}
                </h4>
                <div className="objective-radar-group__items">
                  {group.items.map((item) => (
                    <div
                      className={`objective-radar-value ${radarPercentileClass(item.value)}`}
                      key={item.key}
                    >
                      <strong>{item.value}</strong>
                      <p>{item.label}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            <p className="objective-radar-note">
              Los números son percentiles frente a la muestra seleccionada.
            </p>
            <div className="objective-radar-insights">
              <div className="objective-radar-insight-card objective-radar-insight-card--split">
                <div>
                  <h4>Fortalezas</h4>
                  {radarStrengths.map((item) => (
                    <div className="objective-radar-insight-row" key={`strength-${item.key}`}>
                      <span className={radarPercentileClass(item.value)}>{item.value}</span>
                      <p>{item.label}</p>
                    </div>
                  ))}
                </div>
                <div>
                  <h4>A revisar</h4>
                  {radarAlerts.map((item) => (
                    <div className="objective-radar-insight-row" key={`alert-${item.key}`}>
                      <span className={radarPercentileClass(item.value)}>{item.value}</span>
                      <p>{item.label}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div className="objective-radar-insight-card">
                <h4>Balance por bloques</h4>
                <div className="objective-radar-union-value">
                  <span>Union Value</span>
                  <strong>{unionValue}</strong>
                  <p>Promedio de Ataque, Posesión y Defensa</p>
                </div>
                {radarBlockBalance.map((group) => (
                  <div className="objective-radar-balance-row" key={`balance-${group.key}`}>
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
            </div>
          </div>
        ) : null}
      </div>
      <div className="objective-percentile-legend">
        <span><i className="percentile-low" />0-24 Bajo</span>
        <span><i className="percentile-medium" />25-49 Medio-bajo</span>
        <span><i className="percentile-good" />50-79 Bueno</span>
        <span><i className="percentile-elite" />80-100 Alto</span>
      </div>
    </div>
  );
}

function ObjectiveComparableMiniRadar({
  candidateName,
  candidateRadar,
  selectedLabel,
  selectedRadar,
}: {
  candidateName: string;
  candidateRadar: ObjectiveRadarData;
  selectedLabel: string;
  selectedRadar: ObjectiveRadarData;
}) {
  const { candidateValues, labels, selectedValues } = buildComparableRadarValues(
    selectedRadar,
    candidateRadar,
  );

  if (labels.length < 3) return null;

  const center = 116;
  const radius = 68;
  const labelRadius = 108;
  const gridLevels = [25, 50, 75, 100];
  const labelPoints = buildRadarPointList(new Array(labels.length).fill(100), center, labelRadius);
  const selectedPoints = buildRadarPoints(selectedValues, center, radius);
  const candidatePoints = buildRadarPoints(candidateValues, center, radius);

  return (
    <div className="objective-comparable-radar">
      <div className="objective-comparable-radar__legend">
        <span>
          <i className="objective-comparable-radar__swatch objective-comparable-radar__swatch--selected" />
          {selectedLabel}
        </span>
        <span>
          <i className="objective-comparable-radar__swatch objective-comparable-radar__swatch--candidate" />
          {candidateName}
        </span>
      </div>
      <svg
        aria-label={`Comparativa radar entre ${selectedLabel} y ${candidateName}`}
        className="objective-comparable-radar__svg"
        viewBox="0 0 232 248"
      >
        {gridLevels.map((level) => (
          <polygon
            className="objective-comparable-radar__grid"
            key={level}
            points={buildRadarPoints(new Array(labels.length).fill(level), center, radius)}
          />
        ))}
        {labels.map((label, index) => {
          const angle = -Math.PI / 2 + (index * Math.PI * 2) / labels.length;
          const axisEnd = polarPoint(center, radius, angle, 100);
          const labelPoint = labelPoints[index];
          const labelLines = splitRadarLabel(label);
          return (
            <g key={`${label}-${index}`}>
              <line
                className="objective-comparable-radar__axis"
                x1={center}
                x2={axisEnd.x}
                y1={center}
                y2={axisEnd.y}
              />
              <text
                className="objective-comparable-radar__label"
                textAnchor={radarTextAnchor(labelPoint.x, center)}
                x={labelPoint.x}
                y={labelPoint.y}
              >
                {labelLines.map((line, lineIndex) => (
                  <tspan
                    dy={lineIndex === 0 ? 0 : 9}
                    key={`${label}-${line}`}
                    x={labelPoint.x}
                  >
                    {line}
                  </tspan>
                ))}
              </text>
            </g>
          );
        })}
        <polygon
          className="objective-comparable-radar__area objective-comparable-radar__area--selected"
          points={selectedPoints}
        />
        <polygon
          className="objective-comparable-radar__stroke objective-comparable-radar__stroke--selected"
          points={selectedPoints}
        />
        <polygon
          className="objective-comparable-radar__area objective-comparable-radar__area--candidate"
          points={candidatePoints}
        />
        <polygon
          className="objective-comparable-radar__stroke objective-comparable-radar__stroke--candidate"
          points={candidatePoints}
        />
      </svg>
    </div>
  );
}

export function PlayersView({
  focusPlayerName,
  objectivePlayers,
  objectiveMatches,
  players,
  reports,
}: {
  focusPlayerName?: string;
  objectivePlayers: ObjectivePlayer[];
  objectiveMatches: ObjectivePlayerMatch[];
  players: PlayerSummary[];
  reports: ScoutingReport[];
}) {
  const [search, setSearch] = useState("");
  const [competitionFilter, setCompetitionFilter] = useState("Todas");
  const [verdictFilter, setVerdictFilter] = useState("Todos");
  const [selectedPlayerName, setSelectedPlayerName] = useState("");
  const [objectiveRadarMode, setObjectiveRadarMode] = useState<ObjectiveRadarMode>("specific");

  const competitions = Array.from(
    new Set(players.map((player) => player.competition || "Sin competición")),
  ).sort((a, b) => a.localeCompare(b, "es"));
  const verdicts = Array.from(new Set(players.map((player) => player.verdict || "Sin veredicto")))
    .sort((a, b) => a.localeCompare(b, "es"));

  const normalizedSearch = search.trim().toLocaleLowerCase("es");
  const filteredPlayers = players.filter((player) => {
    const haystack = [
      player.player_name,
      player.team_name || "",
      player.position || "",
      player.competition || "",
      player.verdict || "",
    ]
      .join(" ")
      .toLocaleLowerCase("es");
    const competition = player.competition || "Sin competición";
    const verdict = player.verdict || "Sin veredicto";

    return (
      (!normalizedSearch || haystack.includes(normalizedSearch)) &&
      (competitionFilter === "Todas" || competition === competitionFilter) &&
      (verdictFilter === "Todos" || verdict === verdictFilter)
    );
  });

  useEffect(() => {
    if (!focusPlayerName) return;
    const target = players.find(
      (player) => normalizeKey(player.player_name) === normalizeKey(focusPlayerName),
    );
    if (!target) return;
    setSearch("");
    setCompetitionFilter("Todas");
    setVerdictFilter("Todos");
    setSelectedPlayerName(target.player_name);
  }, [focusPlayerName, players]);

  useEffect(() => {
    if (!filteredPlayers.length) {
      setSelectedPlayerName("");
      return;
    }
    if (!filteredPlayers.some((player) => player.player_name === selectedPlayerName)) {
      setSelectedPlayerName(filteredPlayers[0].player_name);
    }
  }, [filteredPlayers, selectedPlayerName]);

  const reportsByPlayer = new Map<string, ScoutingReport[]>();

  for (const report of reports) {
    const key = normalizeKey(report.player_name);
    const playerReports = reportsByPlayer.get(key) || [];
    playerReports.push(report);
    reportsByPlayer.set(key, playerReports);
  }

  const selectedPlayer =
    filteredPlayers.find((player) => player.player_name === selectedPlayerName) || filteredPlayers[0];
  const selectedReports = selectedPlayer
    ? reportsByPlayer.get(normalizeKey(selectedPlayer.player_name)) || []
    : [];
  const selectedObjectiveMatches = selectedPlayer
    ? objectiveMatches
        .filter(
          (match) =>
            match.scouting_player_name &&
            normalizeKey(match.scouting_player_name) === normalizeKey(selectedPlayer.player_name),
        )
        .sort(
          (a, b) =>
            objectiveMatchRank(a.match_status) - objectiveMatchRank(b.match_status) ||
            Number(b.match_score || 0) - Number(a.match_score || 0),
        )
    : [];
  const bestObjectiveMatch = selectedObjectiveMatches[0];
  const objectivePlayer = bestObjectiveMatch?.objective_player;
  const objectivePanelMetricKeys = Array.isArray(objectivePlayer?.metrics?._panel_metric_keys)
    ? (objectivePlayer?.metrics?._panel_metric_keys as string[])
    : [];
  const objectiveMetricKeys = [
    ...objectivePanelMetricKeys,
    ...OBJECTIVE_METRICS.map(([metricKey]) => metricKey),
  ].filter((metricKey, index, list) => list.indexOf(metricKey) === index);
  const visibleObjectiveMetrics = objectiveMetricKeys
    .map((metricKey) => {
      const label = OBJECTIVE_METRIC_LABELS.get(metricKey) || metricKey;
      return {
        key: metricKey,
        label,
        value: objectivePlayer?.metrics?.[metricKey],
      };
    })
    .filter((metric) => metricNumber(metric.value) !== null)
    .slice(0, 12);
  const objectiveRadarSpecific = getObjectiveRadarData(objectivePlayer?.metrics?._radar_specific);
  const objectiveRadarGeneral = getObjectiveRadarData(objectivePlayer?.metrics?._radar_general);
  const objectiveRadarFallback = getObjectiveRadarData(objectivePlayer?.metrics?._radar);
  const objectiveRadar =
    objectiveRadarMode === "specific"
      ? objectiveRadarSpecific || objectiveRadarFallback
      : objectiveRadarGeneral || objectiveRadarFallback;
  const objectiveRadarUpdatedAt = formatObjectiveUpdatedAt(objectivePlayer?.updated_at);
  const objectiveRadarComparisonKey = normalizeKey(objectiveRadar?.comparison_label || "");
  const objectiveRadarCompetitionKey = normalizeKey(
    objectiveRadar?.competition_name || objectivePlayer?.domestic_competition_name || "",
  );
  const similarObjectivePlayers = objectivePlayer && objectiveRadar
    ? (() => {
        const uniqueCandidates = new Map<string, ObjectiveSimilarCandidate>();

        objectivePlayers
          .filter((candidate) => candidate.id !== objectivePlayer.id)
          .forEach((candidate) => {
          const candidateRadar = getObjectiveRadarForMode(candidate, objectiveRadarMode);
          if (!candidateRadar) return;

          const candidateComparisonKey = normalizeKey(candidateRadar.comparison_label || "");
          const candidateCompetitionKey = normalizeKey(
            candidateRadar.competition_name || candidate.domestic_competition_name || "",
          );

          if (
            objectiveRadarComparisonKey &&
            candidateComparisonKey &&
            candidateComparisonKey !== objectiveRadarComparisonKey
          ) {
            return;
          }

          if (
            objectiveRadarCompetitionKey &&
            candidateCompetitionKey &&
            candidateCompetitionKey !== objectiveRadarCompetitionKey
          ) {
            return;
          }

          const similarity = calculateRadarSimilarity(objectiveRadar, candidateRadar);
          if (similarity === null) return;

          const comparableCandidate = {
            objectivePlayer: candidate,
            radar: candidateRadar,
            similarity,
            blockBalance: getObjectiveRadarBlockBalance(getObjectiveRadarItems(candidateRadar)),
          };

          const identityKey = objectivePlayerIdentityKey(candidate);
          const existingCandidate = uniqueCandidates.get(identityKey);
          if (
            !existingCandidate ||
            comparableCandidate.similarity > existingCandidate.similarity ||
            (
              comparableCandidate.similarity === existingCandidate.similarity &&
              (comparableCandidate.radar.sample_count || 0) > (existingCandidate.radar.sample_count || 0)
            )
          ) {
            uniqueCandidates.set(identityKey, comparableCandidate);
          }
        });

        return Array.from(uniqueCandidates.values())
          .sort(
          (a, b) => {
            const aName = a.objectivePlayer.full_name || a.objectivePlayer.name || "";
            const bName = b.objectivePlayer.full_name || b.objectivePlayer.name || "";
            return (
              b.similarity - a.similarity ||
              (b.radar.sample_count || 0) - (a.radar.sample_count || 0) ||
              aName.localeCompare(bName, "es")
            );
          },
          )
          .slice(0, 3);
      })()
    : [];

  useEffect(() => {
    if (objectiveRadarMode === "specific" && !objectiveRadarSpecific && objectiveRadarGeneral) {
      setObjectiveRadarMode("general");
    }
    if (objectiveRadarMode === "general" && !objectiveRadarGeneral && objectiveRadarSpecific) {
      setObjectiveRadarMode("specific");
    }
  }, [objectiveRadarGeneral, objectiveRadarMode, objectiveRadarSpecific]);
  const selectedScouts = new Set(selectedReports.map((report) => report.scout_name).filter(Boolean));
  const latestReport = selectedReports[0];
  const consensus = buildConsensus(selectedReports);
  const selectedBirthYear = rawTextFromReports(selectedReports, "ano_nacimiento");
  const selectedNationality = rawTextFromReports(selectedReports, "nacionalidad");
  const selectedFoot = rawTextFromReports(selectedReports, "lateralidad");
  const selectedAgency = rawTextFromReports(selectedReports, "representante_agencia");
  const selectedContractStatus = rawTextFromReports(selectedReports, "situacion_contractual");
  const selectedContractUntil = rawTextFromReports(selectedReports, "ano_fin_contrato");
  const selectedFullPosition = latestReport
    ? rawText(latestReport, "demarcacion") || selectedPlayer?.position || ""
    : selectedPlayer?.position || "";
  const technicalPatterns = summarizeRepeated(
    selectedReports.map((report) => report.rating_technical),
  );
  const tacticalPatterns = summarizeRepeated(
    selectedReports.map((report) => report.rating_psychological),
  );
  const physicalPatterns = summarizeRepeated(
    selectedReports.map((report) => report.rating_physical),
  );

  return (
    <>
      <section className="content-card">
        <div className="section-title">
          <h2>Ficha de jugador</h2>
          <span>{filteredPlayers.length} visibles</span>
        </div>

        <div className="filter-panel filter-panel--players">
          <label>
            Buscar jugador, equipo o posición
            <input
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Ej. Ourense, MC, Fichar..."
              type="search"
              value={search}
            />
          </label>
          <label>
            Competición
            <select
              onChange={(event) => setCompetitionFilter(event.target.value)}
              value={competitionFilter}
            >
              <option>Todas</option>
              {competitions.map((competition) => (
                <option key={competition}>{competition}</option>
              ))}
            </select>
          </label>
          <label>
            Valoración
            <select onChange={(event) => setVerdictFilter(event.target.value)} value={verdictFilter}>
              <option>Todos</option>
              {verdicts.map((verdict) => (
                <option key={verdict}>{verdict}</option>
              ))}
            </select>
          </label>
          <label>
            Selecciona un jugador
            <select
              disabled={!filteredPlayers.length}
              onChange={(event) => setSelectedPlayerName(event.target.value)}
              value={selectedPlayer?.player_name || ""}
            >
              {filteredPlayers.map((player) => (
                <option key={`${player.player_name}-${player.team_name}`} value={player.player_name}>
                  {player.player_name}
                </option>
              ))}
            </select>
          </label>
        </div>

        {selectedPlayer ? (
          <>
            <article className="player-profile-card">
              <div>
                <span className="profile-kicker">Jugador seleccionado</span>
                <h3>{selectedPlayer.player_name}</h3>
                <p>{selectedPlayer.team_name || "Sin equipo"}</p>
              </div>
              <div className="profile-facts-grid">
                <div>
                  <span>Demarcación</span>
                  <strong>{displayValue(selectedFullPosition, "Sin posición")}</strong>
                </div>
                <div>
                  <span>Nº informes</span>
                  <strong>{selectedPlayer.reports_count}</strong>
                </div>
                <div>
                  <span>Último informe</span>
                  <strong>{formatDate(selectedPlayer.report_date)}</strong>
                </div>
                <div>
                  <span>Consenso histórico</span>
                  <strong className={`verdict-badge ${verdictClass(consensus.label)}`} title={consensus.detail}>
                    {consensus.label}
                  </strong>
                </div>
                <div>
                  <span>Competición</span>
                  <strong>{selectedPlayer.competition || "Sin competición"}</strong>
                </div>
                <div>
                  <span>Scouts</span>
                  <strong>{selectedScouts.size}</strong>
                </div>
                <div>
                  <span>Año nac.</span>
                  <strong>{displayValue(formatBirthYearWithAge(selectedBirthYear))}</strong>
                </div>
                <div>
                  <span>Lateralidad</span>
                  <strong>{displayValue(selectedFoot)}</strong>
                </div>
                <div>
                  <span>Nacionalidad</span>
                  <strong>{displayValue(selectedNationality)}</strong>
                </div>
                <div>
                  <span>Agencia</span>
                  <strong>{displayValue(selectedAgency)}</strong>
                </div>
                <div>
                  <span>Situación</span>
                  <strong>{displayValue(selectedContractStatus)}</strong>
                </div>
                <div>
                  <span>Fin contrato</span>
                  <strong>{displayValue(formatRawDate(selectedContractUntil))}</strong>
                </div>
              </div>
            </article>

            {objectivePlayer && bestObjectiveMatch ? (
              <section className="objective-card">
                <div className="section-title section-title--compact">
                  <h2>Datos objetivos Wyscout</h2>
                  <span>{objectiveStatusLabel(bestObjectiveMatch.match_status)}</span>
                </div>
                <div className="objective-layout">
                  <div className="objective-identity">
                    <div className="objective-photo-wrap">
                      {objectivePlayer.image ? (
                        <img
                          alt={objectivePlayer.full_name || objectivePlayer.name || "Jugador"}
                          className="objective-photo"
                          src={objectivePlayer.image}
                        />
                      ) : (
                        <div className="objective-photo objective-photo--empty">Sin foto</div>
                      )}
                      {objectivePlayer.current_team_logo ? (
                        <img
                          alt={objectivePlayer.current_team_name || "Equipo"}
                          className="objective-team-logo"
                          src={objectivePlayer.current_team_logo}
                        />
                      ) : null}
                    </div>
                    <div>
                      <span className="profile-kicker">Wyscout</span>
                      <h3>{objectivePlayer.full_name || objectivePlayer.name}</h3>
                      <p>
                        {objectivePlayer.current_team_name || "Sin equipo"} ·{" "}
                        {objectivePlayer.domestic_competition_name || "Sin competición"}
                      </p>
                      <div className="objective-chip-row">
                        <span className={objectiveStatusClass(bestObjectiveMatch.match_status)}>
                          {objectiveStatusLabel(bestObjectiveMatch.match_status)}
                        </span>
                        <span>
                          Score {formatMetricValue(Number(bestObjectiveMatch.match_score || 0) * 100)}%
                        </span>
                        <span>{objectivePlayer.objective_dataset.toUpperCase()}</span>
                      </div>
                    </div>
                  </div>
                  <div className="objective-facts-grid">
                    <div>
                      <span>Año nac.</span>
                      <strong>{displayValue(String(objectivePlayer.birth_year || ""))}</strong>
                    </div>
                    <div>
                      <span>Posición</span>
                      <strong>{displayValue(objectivePlayer.primary_position_label)}</strong>
                    </div>
                    <div>
                      <span>Pos. secundaria</span>
                      <strong>{displayValue(objectivePlayer.secondary_position_label)}</strong>
                    </div>
                    <div>
                      <span>Pie</span>
                      <strong>{displayValue(formatFoot(objectivePlayer.foot))}</strong>
                    </div>
                    <div>
                      <span>Altura</span>
                      <strong>
                        {objectivePlayer.height ? `${formatMetricValue(objectivePlayer.height)} cm` : "-"}
                      </strong>
                    </div>
                    <div>
                      <span>Contrato</span>
                      <strong>{displayValue(formatRawDate(objectivePlayer.contract_expires || ""))}</strong>
                    </div>
                  </div>
                </div>
                <div className="objective-metrics-grid">
                  {visibleObjectiveMetrics.map((metric) => (
                    <div className="objective-metric" key={metric.key}>
                      <span>{metric.label}</span>
                      <strong>{formatMetricValue(metric.value)}</strong>
                    </div>
                  ))}
                </div>
                {objectiveRadar ? (
                  <>
                    <ObjectiveRadar
                      mode={objectiveRadarMode}
                      onModeChange={setObjectiveRadarMode}
                      radar={objectiveRadar}
                      radarGeneral={objectiveRadarGeneral}
                      radarSpecific={objectiveRadarSpecific}
                    />
                    <div className="objective-similar-section">
                      <div className="objective-similar-section__head">
                        <div>
                          <span className="profile-kicker">Comparables Wyscout</span>
                          <h3>3 jugadores similares</h3>
                        </div>
                        <p>
                          {objectiveRadarMode === "specific"
                            ? "Según posición específica"
                            : "Según posición general"}
                          {" · "}
                          {objectiveRadar.competition_name || objectivePlayer.domestic_competition_name || "Competición no disponible"}
                          {objectiveRadarUpdatedAt ? ` · actualizado ${objectiveRadarUpdatedAt}` : ""}
                        </p>
                      </div>
                      {similarObjectivePlayers.length ? (
                        <div className="objective-similar-grid">
                          {similarObjectivePlayers.map((candidate) => (
                            <article className="objective-similar-card" key={candidate.objectivePlayer.id}>
                              <div className="objective-similar-card__top">
                                <div className="objective-similar-photo-wrap">
                                  {candidate.objectivePlayer.image ? (
                                    <img
                                      alt={candidate.objectivePlayer.full_name || candidate.objectivePlayer.name || "Jugador"}
                                      className="objective-similar-photo"
                                      src={candidate.objectivePlayer.image}
                                    />
                                  ) : (
                                    <div className="objective-similar-photo objective-similar-photo--empty">
                                      Sin foto
                                    </div>
                                  )}
                                  {candidate.objectivePlayer.current_team_logo ? (
                                    <img
                                      alt={candidate.objectivePlayer.current_team_name || "Equipo"}
                                      className="objective-similar-team-logo"
                                      src={candidate.objectivePlayer.current_team_logo}
                                    />
                                  ) : null}
                                </div>
                                <div className="objective-similar-card__content">
                                  <div className="objective-similar-card__title-row">
                                    <div>
                                      <h4>{candidate.objectivePlayer.full_name || candidate.objectivePlayer.name}</h4>
                                      <p>{candidate.objectivePlayer.current_team_name || "Sin equipo"}</p>
                                    </div>
                                    <div className="objective-similar-score-stack">
                                      <strong className="objective-similar-score">
                                        {candidate.similarity}%
                                      </strong>
                                      <span className="objective-similar-union-value">
                                        Union Value {getUnionValue(candidate.blockBalance)}
                                      </span>
                                    </div>
                                  </div>
                                  <div className="objective-similar-meta">
                                    <span>{formatObjectiveAge(candidate.objectivePlayer)}</span>
                                    <span>
                                      {candidate.objectivePlayer.primary_position_label || "Sin posición"}
                                    </span>
                                    <span>
                                      {candidate.objectivePlayer.domestic_competition_name || "Sin competición"}
                                    </span>
                                    {formatComparableVolume(candidate.objectivePlayer) ? (
                                      <span>{formatComparableVolume(candidate.objectivePlayer)}</span>
                                    ) : null}
                                  </div>
                                </div>
                              </div>
                              <div className="objective-similar-bars">
                                {candidate.blockBalance.map((group) => (
                                  <div className="objective-similar-bar" key={`${candidate.objectivePlayer.id}-${group.key}`}>
                                    <div>
                                      <span>
                                        <i className={group.className} />
                                        {group.title}
                                      </span>
                                      <strong>{group.average}</strong>
                                    </div>
                                    <div className="objective-similar-track">
                                      <span
                                        className="objective-similar-track__fill"
                                        style={{ width: `${Math.max(4, group.average)}%` }}
                                      />
                                    </div>
                                  </div>
                                ))}
                              </div>
                              <ObjectiveComparableMiniRadar
                                candidateName={candidate.objectivePlayer.full_name || candidate.objectivePlayer.name || "Comparable"}
                                candidateRadar={candidate.radar}
                                selectedLabel={objectivePlayer.full_name || objectivePlayer.name || "Jugador"}
                                selectedRadar={objectiveRadar}
                              />
                            </article>
                          ))}
                        </div>
                      ) : (
                        <div className="objective-similar-empty">
                          No hay una muestra suficiente para mostrar comparables fiables con el filtro actual.
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="objective-radar-card objective-radar-card--empty">
                    <strong>Radar Wyscout no disponible</strong>
                    <p>
                      El radar aparecerá cuando vuelvas a sincronizar Wyscout con los percentiles
                      calculados.
                    </p>
                  </div>
                )}
              </section>
            ) : (
              <section className="objective-card objective-card--empty">
                <div className="section-title section-title--compact">
                  <h2>Datos objetivos Wyscout</h2>
                  <span>Sin match</span>
                </div>
                <p>
                  No hay todavía un cruce fiable entre este jugador subjetivo y los datos de Wyscout.
                </p>
              </section>
            )}

            <div className="timeline-grid">
              <ActivityPanel
                emptyLabel="Sin valoraciones suficientes"
                reports={selectedReports}
                title="Valoraciones por scout y fecha"
                valueOrder={VERDICT_ORDER}
                valueGetter={(report) => report.verdict || "Sin valoración"}
              />
              <ActivityPanel
                emptyLabel="Sin posiciones suficientes"
                reports={selectedReports}
                title="Posición principal por scout y fecha"
                valueGetter={(report) => rawText(report, "demarcacion_principal") || "Sin posición"}
              />
            </div>

            <div className="capability-grid">
              <CapabilitySummary title="Capacidades técnicas" items={technicalPatterns} />
              <CapabilitySummary title="Capacidades tácticas - psicológicas" items={tacticalPatterns} />
              <CapabilitySummary title="Capacidades físicas" items={physicalPatterns} />
            </div>

            <div className="section-title section-title--sub">
              <h2>Historial de informes</h2>
              <span>{selectedReports.length} informes</span>
            </div>

            <div className="player-reports__list player-reports__list--open">
              {selectedReports.map((report) => (
                <article className={`player-report-card ${reportToneClass(report.verdict)}`} key={report.id}>
                  <div className="player-report-card__head">
                    <div>
                      <strong>{report.scout_name || "Sin scout"}</strong>
                      <span className="player-report-card__subtitle">
                        {report.team_name || "Sin equipo"} · {report.competition || "Sin competición"}
                      </span>
                    </div>
                    <div className="player-report-card__scorebox">
                      <span>{formatDate(report.report_date)}</span>
                      <strong className={`verdict-chip ${verdictClass(report.verdict)}`}>
                        {report.verdict || "Sin valoración"}
                      </strong>
                    </div>
                  </div>
                  <div className="tag-row">
                    <span>{report.position || "Sin posición"}</span>
                    <span>{report.competition || "Sin competición"}</span>
                    <span>{rawText(report, "jornada_numero") ? `J${formatRawNumber(rawText(report, "jornada_numero"))}` : "Sin jornada"}</span>
                    <span>{rawText(report, "partido_visionado") || "Sin partido"}</span>
                    <span>{rawText(report, "visualizacion") || "Sin visualización"}</span>
                  </div>
                  <section>
                    <h3>Aspectos positivos</h3>
                    <p>{rawText(report, "aspectos_positivos") || "Sin comentario."}</p>
                  </section>
                  <section>
                    <h3>Aspectos negativos</h3>
                    <p>{rawText(report, "aspectos_negativos") || "Sin comentario."}</p>
                  </section>
                  <section>
                    <h3>Técnico / táctico</h3>
                    <p>{report.rating_technical || "Sin comentario."}</p>
                  </section>
                  <section>
                    <h3>Físico / condicional</h3>
                    <p>{report.rating_physical || "Sin comentario."}</p>
                  </section>
                  <section>
                    <h3>Psicológico / actitudinal</h3>
                    <p>{report.rating_psychological || "Sin comentario."}</p>
                  </section>
                </article>
              ))}
            </div>

            <div className="section-title section-title--sub">
              <h2>Detalle completo</h2>
              <span>Tabla resumen</span>
            </div>
            <div className="summary-table-wrap">
              <table className="summary-table">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Ojeador</th>
                    <th>Equipo</th>
                    <th>Competición</th>
                    <th>Jornada</th>
                    <th>Partido</th>
                    <th>Visualización</th>
                    <th>Veredicto</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedReports.map((report) => (
                    <tr key={`summary-${report.id}`}>
                      <td>{formatDate(report.report_date)}</td>
                      <td>{report.scout_name || "-"}</td>
                      <td>{report.team_name || "-"}</td>
                      <td>{report.competition || "-"}</td>
                      <td>{formatRawNumber(rawText(report, "jornada_numero")) || "-"}</td>
                      <td>{rawText(report, "partido_visionado") || "-"}</td>
                      <td>{rawText(report, "visualizacion") || "-"}</td>
                      <td>{report.verdict || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <div className="empty-state">No hay jugadores con esos filtros.</div>
        )}
      </section>
    </>
  );
}

function ActivityPanel({
  emptyLabel,
  reports,
  title,
  valueOrder,
  valueGetter,
}: {
  emptyLabel: string;
  reports: ScoutingReport[];
  title: string;
  valueOrder?: string[];
  valueGetter: (report: ScoutingReport) => string;
}) {
  const rows = reports
    .map((report) => ({
      id: report.id,
      date: report.report_date,
      dateLabel: formatDate(report.report_date),
      scout: report.scout_name || "Sin scout",
      value: valueGetter(report),
    }))
    .filter((item) => item.date && item.scout && item.value)
    .sort((a, b) => new Date(a.date || "").getTime() - new Date(b.date || "").getTime());

  const dateLabels = Array.from(new Set(rows.map((row) => row.dateLabel)));
  const grouped = new Map<string, typeof rows>();
  for (const row of rows) {
    const values = grouped.get(row.value) || [];
    values.push(row);
    grouped.set(row.value, values);
  }

  const fallbackOrder = Array.from(grouped.keys()).sort((a, b) => a.localeCompare(b, "es"));
  const orderedValues = valueOrder
    ? valueOrder
        .filter((value) => grouped.has(value))
        .concat(fallbackOrder.filter((value) => !valueOrder.includes(value)))
    : fallbackOrder;

  return (
    <article className="timeline-panel">
      <h3>{title}</h3>
      {orderedValues.length ? (
        <div className="activity-table-wrap">
          <table className="activity-table">
            <thead>
              <tr>
                <th />
                {dateLabels.map((date) => (
                  <th key={date}>{date}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {orderedValues.map((value) => (
                <tr key={value}>
                  <th>{value}</th>
                  {dateLabels.map((date) => {
                    const cellItems = (grouped.get(value) || []).filter((item) => item.dateLabel === date);
                    return (
                      <td key={`${value}-${date}`}>
                        {cellItems.map((item) => (
                          <span
                            className={`timeline-pill ${verdictClass(value)}`}
                            key={item.id}
                            title={`${item.scout} · ${item.dateLabel} · ${value}`}
                          >
                            {item.scout}
                          </span>
                        ))}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p>{emptyLabel}</p>
      )}
    </article>
  );
}

function CapabilitySummary({
  title,
  items,
}: {
  title: string;
  items: Array<{ label: string; count: number }>;
}) {
  return (
    <article className="capability-card">
      <h3>{title}</h3>
      {items.length ? (
        <div className="capability-chip-row">
          {items.map((item) => (
            <span key={item.label}>
              {item.label} ({item.count})
            </span>
          ))}
        </div>
      ) : (
        <p>Sin patrones repetidos</p>
      )}
    </article>
  );
}
