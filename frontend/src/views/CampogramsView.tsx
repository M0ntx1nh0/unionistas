import { useEffect, useMemo, useState } from "react";
import type { Campogram, CampogramPlayer, CampogramReport, UserProfile } from "../types";
import { formatDate } from "../utils/format";

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
  return [
    report.campogram_id || normalizeKey(report.campogram_name),
    normalizeKey(report.player_name),
    normalizeKey(report.scout_email || report.scout_name),
    normalizeKey(report.team_name),
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
}: {
  player: CampogramPlayer;
  reports: CampogramReport[];
  status: string;
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
}: {
  player: CampogramPlayer;
  reports: CampogramReport[];
  status: string;
}) {
  return (
    <details className="campogram-detail">
      <summary>Detalle | {player.player_name}</summary>
      <PlayerDetailContent player={player} reports={reports} status={status} />
    </details>
  );
}

function PlayerCard({
  player,
  reports,
}: {
  player: CampogramPlayer;
  reports: CampogramReport[];
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
      <PlayerDetail player={player} reports={reports} status={status} />
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
}: {
  players: CampogramPlayer[];
  position: string;
  reportMap: Map<string, CampogramReport[]>;
}) {
  const positionPlayers = players
    .filter((player) => normalizePosition(player.position) === position)
    .sort((a, b) => a.player_name.localeCompare(b.player_name, "es"));

  return (
    <section className="campogram-position-panel">
      <h3>{position}</h3>
      {positionPlayers.length ? (
        positionPlayers.map((player) => (
          <PlayerCard key={player.id} player={player} reports={reportMap.get(player.id) || []} />
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
}: {
  players: CampogramPlayer[];
  reportMap: Map<string, CampogramReport[]>;
  onSelectPlayer: (player: CampogramPlayer) => void;
}) {
  const standardPositions = new Set(POSITION_ORDER);
  const extraPositions = Array.from(new Set(players.map((player) => normalizePosition(player.position))))
    .filter((position) => !standardPositions.has(position as (typeof POSITION_ORDER)[number]))
    .sort((a, b) => positionSortValue(a) - positionSortValue(b));

  return (
    <>
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
                  <PositionPanel key={position} players={players} position={position} reportMap={reportMap} />
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
              <PositionPanel key={position} players={players} position={position} reportMap={reportMap} />
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
  focusPlayerId,
  focusPlayerName,
  profile,
}: {
  campograms: Campogram[];
  campogramPlayers: CampogramPlayer[];
  campogramReports: CampogramReport[];
  focusPlayerId?: string;
  focusPlayerName?: string;
  profile?: UserProfile;
}) {
  const [selectedCampogramId, setSelectedCampogramId] = useState("");
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);

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
