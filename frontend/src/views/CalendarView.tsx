import { useEffect, useMemo, useState } from "react";
import type {
  CalendarMatch,
  CampogramPlayer,
  CampogramReport,
  ObjectivePlayerMatch,
  ScoutingReport,
} from "../types";
import { formatDate, formatTime } from "../utils/format";
import { useSessionState } from "../utils/useSessionState";
import {
  buildConsensus,
  buildTeamLogoMap,
  canonicalTeamName,
  COMPETITION_COUNTRY,
  COMPETITIONS,
  CompetitionLogo,
  type CompetitionName,
  competitionKey,
  COUNTRIES,
  CountryFlag,
  normalizeText,
  playerVerdict,
  sofascoreTeamImage,
  type TeamLogoMap,
  verdictClass,
  verdictPriority,
} from "../lib/competitions";
type PlayerSource = "general" | "campograms";

type CalendarPlayer = {
  playerName: string;
  teamName: string;
  competition: string | null;
  verdict: string;
  canOpen?: boolean;
  campogramPlayerId?: string;
};

type EnrichedMatch = CalendarMatch & {
  homePlayers: CalendarPlayer[];
  awayPlayers: CalendarPlayer[];
  playersTotal: number;
  interestLabel: string;
  interestClass: string;
};

type RoundOption = {
  key: string;
  label: string;
  sortOrder: number;
  firstDate: string;
};

const INTEREST_BUCKETS = [
  { key: "top", label: "+ de 10", className: "is-top" },
  { key: "high", label: "7-10", className: "is-high" },
  { key: "medium", label: "4-6", className: "is-medium" },
  { key: "low", label: "Menos de 4", className: "is-low" },
] as const;

function rawTextValue(rawData: Record<string, unknown> | null | undefined, key: string) {
  const value = rawData?.[key];
  return typeof value === "string" ? value.trim() : "";
}

// Estados de Sofascore que conviene señalar: el partido sigue visible pero su fecha no vale.
const MATCH_STATUS_LABELS: Record<string, { label: string; className: string }> = {
  canceled: { label: "Cancelado", className: "is-canceled" },
  postponed: { label: "Aplazado", className: "is-postponed" },
};

function getInterest(total: number) {
  if (total > 10) return { key: "top", label: "+ de 10 jugadores", className: "is-top" };
  if (total >= 7) return { key: "high", label: "7-10 jugadores", className: "is-high" };
  if (total >= 4) return { key: "medium", label: "4-6 jugadores", className: "is-medium" };
  return { key: "low", label: "Menos de 4", className: "is-low" };
}

function groupShortName(groupName: string) {
  return groupName
    .replace(/^Group\s+/i, "Gr ")
    .replace(/^Grupo\s+/i, "Gr ")
    .replace("Sin grupo", "S/G");
}

function groupOrderValue(groupName: string) {
  const normalized = normalizeText(groupName);
  const romanMap: Record<string, number> = { i: 1, ii: 2, iii: 3, iv: 4, v: 5 };
  const numeric = normalized.match(/\b(\d+)\b/)?.[1];
  if (numeric) return Number(numeric);
  const roman = normalized.match(/\b(i|ii|iii|iv|v)\b/)?.[1];
  if (roman) return romanMap[roman] || 99;
  return 99;
}

function sortGroups(a: string, b: string) {
  const orderCompare = groupOrderValue(a) - groupOrderValue(b);
  if (orderCompare !== 0) return orderCompare;
  return a.localeCompare(b, "es");
}

function groupedReportsConsensus(reports: ScoutingReport[]) {
  const reportsByPlayer = new Map<string, ScoutingReport[]>();
  for (const report of reports) {
    const competition = competitionKey(report.competition);
    const team = canonicalTeamName(report.team_name, competition);
    const key = `${competition}|${team}|${normalizeText(report.player_name)}`;
    reportsByPlayer.set(key, [...(reportsByPlayer.get(key) || []), report]);
  }
  return reportsByPlayer;
}

function groupedCampogramConsensus(reports: CampogramReport[]) {
  const reportsByPlayer = new Map<string, CampogramReport[]>();
  for (const report of reports) {
    const competition = competitionKey(report.category);
    const effectiveTeamName =
      report.team_name ||
      rawTextValue(report.raw_data, "Equipo en el que juega") ||
      rawTextValue(report.raw_data, "equipo_actual") ||
      rawTextValue(report.raw_data, "situacion_equipo");
    const team = canonicalTeamName(effectiveTeamName, competition);
    const key = `${competition}|${team}|${normalizeText(report.player_name)}`;
    reportsByPlayer.set(key, [...(reportsByPlayer.get(key) || []), report]);
  }
  return reportsByPlayer;
}

function campogramPlayerTeamName(player: CampogramPlayer) {
  return (
    player.team_name ||
    rawTextValue(player.raw_data, "equipo_actual") ||
    rawTextValue(player.raw_data, "situacion_equipo") ||
    ""
  );
}

function buildPlayerIndex(
  source: PlayerSource,
  reports: ScoutingReport[],
  campogramPlayers: CampogramPlayer[],
  campogramReports: CampogramReport[],
  options?: {
    accessibleReports?: ScoutingReport[];
    canOpenAllGeneralPlayers?: boolean;
  },
) {
  const index = new Map<string, CalendarPlayer[]>();
  const seen = new Set<string>();
  const accessiblePlayerNames =
    options?.canOpenAllGeneralPlayers === false
      ? new Set((options.accessibleReports || []).map((report) => normalizeText(report.player_name)))
      : null;

  const addPlayer = (competition: string, teamName: string | null, player: CalendarPlayer) => {
    const canonicalTeam = canonicalTeamName(teamName, competition);
    if (!competition || !canonicalTeam || !player.playerName) return;
    const dedupeKey = `${competition}|${canonicalTeam}|${normalizeText(player.playerName)}`;
    if (seen.has(dedupeKey)) return;
    seen.add(dedupeKey);
    const key = `${competition}|${canonicalTeam}`;
    index.set(key, [...(index.get(key) || []), player]);
  };

  if (source === "general") {
    const reportsByPlayer = groupedReportsConsensus(reports);
    for (const playerReports of reportsByPlayer.values()) {
      const report = playerReports[0];
      const competition = competitionKey(report.competition);
      addPlayer(competition, report.team_name, {
        playerName: report.player_name,
        teamName: report.team_name || "",
        competition: report.competition,
        verdict: buildConsensus(playerReports.map((playerReport) => playerReport.verdict)),
        canOpen: !accessiblePlayerNames || accessiblePlayerNames.has(normalizeText(report.player_name)),
      });
    }
  } else {
    const reportsByPlayer = groupedCampogramConsensus(campogramReports);
    for (const player of campogramPlayers) {
      const competition = competitionKey(player.category);
      const effectiveTeamName = campogramPlayerTeamName(player);
      const key = `${competition}|${canonicalTeamName(effectiveTeamName, competition)}|${normalizeText(player.player_name)}`;
      const playerReports = reportsByPlayer.get(key) || [];
      addPlayer(competition, effectiveTeamName, {
        playerName: player.player_name,
        teamName: effectiveTeamName,
        competition: player.category,
        verdict: buildConsensus(playerReports.map((report) => report.verdict)),
        canOpen: true,
        campogramPlayerId: player.id,
      });
    }
  }

  for (const players of index.values()) {
    players.sort((a, b) => {
      const priorityCompare = verdictPriority(a.verdict) - verdictPriority(b.verdict);
      if (priorityCompare !== 0) return priorityCompare;
      return a.playerName.localeCompare(b.playerName, "es");
    });
  }

  return index;
}

function enrichMatches(matches: CalendarMatch[], playerIndex: Map<string, CalendarPlayer[]>) {
  return matches.map((match) => {
    const competition = competitionKey(match.competition);
    const homeKey = `${competition}|${canonicalTeamName(match.home_team_name, competition)}`;
    const awayKey = `${competition}|${canonicalTeamName(match.away_team_name, competition)}`;
    const homePlayers = playerIndex.get(homeKey) || [];
    const awayPlayers = playerIndex.get(awayKey) || [];
    const playersTotal = homePlayers.length + awayPlayers.length;
    const interest = getInterest(playersTotal);

    return {
      ...match,
      homePlayers,
      awayPlayers,
      playersTotal,
      interestLabel: interest.label,
      interestClass: interest.className,
    };
  });
}

function activeCalendarDate() {
  const date = new Date();
  const isMonday = date.getDay() === 1;
  if (isMonday) {
    date.setDate(date.getDate() + 1);
  }
  return date.toISOString().slice(0, 10);
}

function compactPlayoffGroupLabel(groupName: string | null | undefined) {
  const normalized = normalizeText(groupName);
  if (!normalized) return "Playoff";
  if (normalized.includes("playoff ascenso")) return "Playoff ascenso";
  if (normalized.includes("playoff descenso")) return "Playoff descenso";
  return groupName || "Playoff";
}

function playoffShortPhase(groupName: string | null | undefined) {
  const normalized = normalizeText(groupName);
  if (normalized.includes("playoff ascenso") && normalized.includes("semifinal")) return "PO Semis Asc";
  if (normalized.includes("playoff ascenso") && normalized.includes("final")) return "PO Final Asc";
  if (normalized.includes("playoff descenso")) return "PO Desc";
  return null;
}

function groupDateOrder(matches: CalendarMatch[]) {
  const byGroup = new Map<string, string[]>();

  for (const match of matches) {
    const rawMatchday = rawTextValue(match.raw_data, "matchday");
    if (match.matchday !== null || !match.group_name) continue;
    const key = normalizeText(match.group_name);
    const date = match.match_date || "";
    if (!date) continue;
    byGroup.set(key, [...(byGroup.get(key) || []), date]);
  }

  const ordered = new Map<string, string[]>();
  for (const [groupKey, dates] of byGroup.entries()) {
    ordered.set(groupKey, Array.from(new Set(dates)).sort((a, b) => a.localeCompare(b)));
  }

  return ordered;
}

function inferPlayoffLeg(
  groupName: string | null | undefined,
  matchDate: string | null | undefined,
  playoffDatesByGroup?: Map<string, string[]>,
) {
  if (!groupName || !matchDate || !playoffDatesByGroup) return null;
  const dates = playoffDatesByGroup.get(normalizeText(groupName));
  if (!dates?.length) return null;

  const dateIndex = dates.indexOf(matchDate);
  if (dateIndex === -1) return null;

  if (dates.length === 1) return "Ida";

  const idaCutoff = Math.ceil(dates.length / 2);
  return dateIndex < idaCutoff ? "Ida" : "Vuelta";
}

function roundInfo(match: CalendarMatch, playoffDatesByGroup?: Map<string, string[]>): RoundOption {
  if (match.matchday !== null) {
    return {
      key: `matchday:${match.matchday}`,
      label: `J${match.matchday}`,
      sortOrder: match.matchday,
      firstDate: match.match_date || "9999-12-31",
    };
  }

  const rawMatchday = rawTextValue(match.raw_data, "matchday");
  const normalized = normalizeText(rawMatchday);
  const playoffGroupLabel = compactPlayoffGroupLabel(match.group_name);
  const playoffGroupKey = normalizeText(playoffGroupLabel).replace(/\s+/g, "-") || "playoff";
  const shortPhase = playoffShortPhase(match.group_name);
  const inferredLeg = inferPlayoffLeg(match.group_name, match.match_date, playoffDatesByGroup);

  if (normalized === "semifinales") {
    return {
      key: `phase:${playoffGroupKey}:semifinales-ida`,
      label: shortPhase ? `${shortPhase} Ida` : `${playoffGroupLabel} · Semifinales · Ida`,
      sortOrder: 1001,
      firstDate: match.match_date || "9999-12-31",
    };
  }

  if (normalized === "vuelta semifinales") {
    return {
      key: `phase:${playoffGroupKey}:semifinales-vuelta`,
      label: shortPhase ? `${shortPhase} Vuelta` : `${playoffGroupLabel} · Semifinales · Vuelta`,
      sortOrder: 1002,
      firstDate: match.match_date || "9999-12-31",
    };
  }

  if (normalized === "final") {
    return {
      key: `phase:${playoffGroupKey}:final-ida`,
      label: shortPhase ? `${shortPhase} Ida` : `${playoffGroupLabel} · Final · Ida`,
      sortOrder: 1003,
      firstDate: match.match_date || "9999-12-31",
    };
  }

  if (normalized === "vuelta final") {
    return {
      key: `phase:${playoffGroupKey}:final-vuelta`,
      label: shortPhase ? `${shortPhase} Vuelta` : `${playoffGroupLabel} · Final · Vuelta`,
      sortOrder: 1004,
      firstDate: match.match_date || "9999-12-31",
    };
  }

  if (shortPhase && inferredLeg) {
    const isFinal = normalizeText(match.group_name).includes("final");
    return {
      key: `phase:${playoffGroupKey}:${isFinal ? "final" : "semifinales"}-${inferredLeg.toLowerCase()}`,
      label: `${shortPhase} ${inferredLeg}`,
      sortOrder: isFinal ? (inferredLeg === "Ida" ? 1003 : 1004) : inferredLeg === "Ida" ? 1001 : 1002,
      firstDate: match.match_date || "9999-12-31",
    };
  }

  const fallbackLabel = rawMatchday || match.group_name || "Sin fase";
  return {
    key: `phase:${normalizeText(fallbackLabel).replace(/\s+/g, "-") || "sin-fase"}`,
    label: fallbackLabel,
    sortOrder: 2000,
    firstDate: match.match_date || "9999-12-31",
  };
}

function buildRoundOptions(matches: CalendarMatch[], competition: string) {
  const playoffDatesByGroup = groupDateOrder(matches.filter((match) => competitionKey(match.competition) === competition));
  const options = new Map<string, RoundOption>();

  for (const match of matches) {
    if (competitionKey(match.competition) !== competition) continue;
    const info = roundInfo(match, playoffDatesByGroup);
    const current = options.get(info.key);
    if (!current) {
      options.set(info.key, info);
      continue;
    }
    if (info.firstDate < current.firstDate) {
      options.set(info.key, { ...current, firstDate: info.firstDate });
    }
  }

  return Array.from(options.values()).sort((a, b) => {
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    const dateCompare = a.firstDate.localeCompare(b.firstDate);
    if (dateCompare !== 0) return dateCompare;
    return a.label.localeCompare(b.label, "es");
  });
}

function defaultRoundKey(matches: CalendarMatch[], competition: string) {
  const referenceDate = activeCalendarDate();
  const options = buildRoundOptions(matches, competition);
  const upcoming = options.find((option) => option.firstDate >= referenceDate);
  return upcoming?.key || options[0]?.key || null;
}

function TeamLogo({
  competition,
  logoMap,
  teamId,
  teamName,
}: {
  competition: string;
  logoMap: TeamLogoMap;
  teamId?: string | null;
  teamName: string;
}) {
  const [failed, setFailed] = useState(false);
  const logo =
    logoMap.get(`${competition}|${canonicalTeamName(teamName, competition)}`) || sofascoreTeamImage(teamId);
  if (!logo || failed) return null;
  return (
    <img
      alt={teamName}
      className="calendar-team-logo"
      loading="lazy"
      onError={() => setFailed(true)}
      referrerPolicy="no-referrer"
      src={logo}
    />
  );
}

function PlayerPill({
  onOpen,
  player,
}: {
  onOpen: (player: CalendarPlayer) => void;
  player: CalendarPlayer;
}) {
  if (player.canOpen === false) {
    return (
      <span
        className={`calendar-player-pill ${verdictClass(player.verdict)} is-disabled`}
        title="Este jugador cuenta para planificación, pero no tienes acceso a su detalle."
      >
        {player.playerName} <span>{player.verdict}</span>
      </span>
    );
  }

  return (
    <button
      className={`calendar-player-pill ${verdictClass(player.verdict)}`}
      onClick={() => onOpen(player)}
      title={`Abrir ficha de ${player.playerName}`}
      type="button"
    >
      {player.playerName} <span>{player.verdict}</span>
    </button>
  );
}

function TeamPlayers({
  competition,
  logoMap,
  onOpenPlayer,
  players,
  teamId,
  teamName,
}: {
  competition: string;
  logoMap: TeamLogoMap;
  onOpenPlayer: (player: CalendarPlayer) => void;
  players: CalendarPlayer[];
  teamId?: string | null;
  teamName: string;
}) {
  return (
    <div className="calendar-team-players">
      <div className="calendar-team-players__head">
        <div className="calendar-team-name">
          <TeamLogo competition={competition} logoMap={logoMap} teamId={teamId} teamName={teamName} />
          <strong>{teamName}</strong>
        </div>
        <span>{players.length}</span>
      </div>
      {players.length ? (
        <div className="calendar-player-pill-row">
          {players.map((player) => (
            <PlayerPill
              key={`${teamName}-${player.playerName}`}
              onOpen={onOpenPlayer}
              player={player}
            />
          ))}
        </div>
      ) : (
        <p>Sin jugadores detectados</p>
      )}
    </div>
  );
}

function InterestDistributionChart({
  matches,
  subtitle,
  title,
}: {
  matches: EnrichedMatch[];
  subtitle?: string;
  title: string;
}) {
  const groups = Array.from(new Set(matches.map((match) => match.group_name || "Sin grupo"))).sort(sortGroups);
  const counts = INTEREST_BUCKETS.map((bucket) => ({
    ...bucket,
    groups: groups.map((group) => ({
      group,
      count: matches.filter(
        (match) =>
          (match.group_name || "Sin grupo") === group &&
          getInterest(match.playersTotal).key === bucket.key,
      ).length,
    })),
  }));
  const maxCount = Math.max(1, ...counts.flatMap((bucket) => bucket.groups.map((group) => group.count)));

  return (
    <section className="calendar-interest-chart-card">
      <div className="calendar-interest-chart-head">
        <h3>{title}</h3>
        <span>{subtitle || `${matches.length} partidos`}</span>
      </div>
      <div className="calendar-interest-bars">
        {groups.map((group) => (
          <div className="calendar-interest-bars__group" key={group}>
            <strong>{groupShortName(group)}</strong>
            <div className="calendar-interest-bars__set">
              {counts.map((bucket) => {
                const count = bucket.groups.find((entry) => entry.group === group)?.count || 0;
                return (
                  <div className="calendar-interest-bar-wrap" key={`${group}-${bucket.key}`}>
                    <span>{count}</span>
                    <i
                      className={bucket.className}
                      style={{ height: `${Math.max(8, (count / maxCount) * 82)}px` }}
                      title={`${groupShortName(group)} · ${bucket.label}: ${count}`}
                    />
                    <small>{bucket.label}</small>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function CalendarOverviewCharts({
  competitions,
  matches,
}: {
  competitions: CompetitionName[];
  matches: EnrichedMatch[];
}) {
  return (
    <section className={`calendar-overview-charts${competitions.length === 1 ? " is-single" : ""}`}>
      {competitions.map((competition) => {
        const activeRoundKey = defaultRoundKey(matches, competition);
        const roundOptions = buildRoundOptions(matches, competition);
        const activeRound = roundOptions.find((option) => option.key === activeRoundKey);
        const playoffDatesByGroup = groupDateOrder(
          matches.filter((match) => competitionKey(match.competition) === competition),
        );
        const competitionMatches = matches.filter(
          (match) =>
            competitionKey(match.competition) === competition &&
            roundInfo(match, playoffDatesByGroup).key === activeRoundKey,
        );
        const playersTotal = competitionMatches.reduce((total, match) => total + match.playersTotal, 0);

        return (
          <InterestDistributionChart
            key={competition}
            matches={competitionMatches}
            subtitle={`${competitionMatches.length} partidos · ${playersTotal} jugadores`}
            title={`${competition} · ${activeRound?.label || "Sin fase"}`}
          />
        );
      })}
    </section>
  );
}

function CalendarMatchCard({
  logoMap,
  match,
  onOpenPlayer,
  roundLabel,
}: {
  logoMap: TeamLogoMap;
  match: EnrichedMatch;
  onOpenPlayer: (player: CalendarPlayer) => void;
  roundLabel: string;
}) {
  const competition = competitionKey(match.competition);
  const statusInfo = MATCH_STATUS_LABELS[normalizeText(match.status)];
  return (
    <article className={`calendar-match-card${statusInfo ? ` ${statusInfo.className}` : ""}`}>
      <div className="calendar-match-card__main">
        <span className="calendar-match-card__meta">
          {competitionKey(match.competition) || match.competition} | {match.group_name || "Sin grupo"} |{" "}
          {roundLabel}
        </span>
        <div className="calendar-match-card__teams">
          <div className="calendar-team-name calendar-team-name--large">
            <TeamLogo competition={competition} logoMap={logoMap} teamId={match.home_team_id} teamName={match.home_team_name} />
            <strong>{match.home_team_name}</strong>
          </div>
          <span>vs</span>
          <div className="calendar-team-name calendar-team-name--large">
            <TeamLogo competition={competition} logoMap={logoMap} teamId={match.away_team_id} teamName={match.away_team_name} />
            <strong>{match.away_team_name}</strong>
          </div>
        </div>
        <div className="calendar-match-card__date">
          {formatDate(match.match_date)} | {formatTime(match.kickoff_time)}
          {statusInfo && (
            <span className={`calendar-match-status ${statusInfo.className}`}>{statusInfo.label}</span>
          )}
        </div>
        {(match.venue || match.city) && (
          <div className="calendar-match-card__venue">
            {[match.venue, match.city].filter(Boolean).join(" · ")}
          </div>
        )}
      </div>
      <div className="calendar-match-card__players">
        <span className={`calendar-interest-badge ${match.interestClass}`}>{match.interestLabel}</span>
        <TeamPlayers
          competition={competition}
          logoMap={logoMap}
          onOpenPlayer={onOpenPlayer}
          players={match.homePlayers}
          teamId={match.home_team_id}
          teamName={match.home_team_name}
        />
        <TeamPlayers
          competition={competition}
          logoMap={logoMap}
          onOpenPlayer={onOpenPlayer}
          players={match.awayPlayers}
          teamId={match.away_team_id}
          teamName={match.away_team_name}
        />
        <strong className="calendar-total">Total BD: {match.playersTotal}</strong>
      </div>
    </article>
  );
}

function CompetitionCalendarSection({
  competition,
  logoMap,
  matches,
  onOpenPlayer,
}: {
  competition: CompetitionName;
  logoMap: TeamLogoMap;
  matches: EnrichedMatch[];
  onOpenPlayer: (player: CalendarPlayer) => void;
}) {
  const competitionMatches = useMemo(
    () => matches.filter((match) => competitionKey(match.competition) === competition),
    [competition, matches],
  );
  const rounds = useMemo(() => buildRoundOptions(competitionMatches, competition), [competition, competitionMatches]);
  const playoffDatesByGroup = useMemo(() => groupDateOrder(competitionMatches), [competitionMatches]);
  const defaultSelectedRoundKey = defaultRoundKey(matches, competition);

  const [selectedRoundKey, setSelectedRoundKey] = useState<string | null>(null);

  const activeRoundKey = selectedRoundKey ?? defaultSelectedRoundKey;
  const currentIndex = rounds.findIndex((round) => round.key === activeRoundKey);
  const activeRound = rounds.find((round) => round.key === activeRoundKey);

  useEffect(() => {
    if (!rounds.length) return;
    if (selectedRoundKey !== null && !rounds.some((round) => round.key === selectedRoundKey)) {
      setSelectedRoundKey(null);
    }
  }, [rounds, selectedRoundKey]);

  const visibleMatches = matches
    .filter(
      (match) =>
        competitionKey(match.competition) === competition &&
        roundInfo(match, playoffDatesByGroup).key === activeRoundKey,
    )
    .sort((a, b) => {
      const groupCompare = sortGroups(a.group_name || "Sin grupo", b.group_name || "Sin grupo");
      if (groupCompare !== 0) return groupCompare;
      if (b.playersTotal !== a.playersTotal) return b.playersTotal - a.playersTotal;
      const dateCompare = (a.match_date || "").localeCompare(b.match_date || "");
      if (dateCompare !== 0) return dateCompare;
      return (a.kickoff_time || "").localeCompare(b.kickoff_time || "");
    });

  const interestingMatches = visibleMatches.filter((match) => match.playersTotal > 0);
  const playersDetected = visibleMatches.reduce((total, match) => total + match.playersTotal, 0);

  return (
    <section className="calendar-competition-section">
      <div className="section-title">
        <div className="calendar-competition-heading">
          <CompetitionLogo competition={competition} size="header" />
          <h2>{competition}</h2>
        </div>
        <span>{activeRound?.label || "Sin fase"}</span>
      </div>

      <div className="calendar-section-controls calendar-section-controls--round">
        <label>
          Ronda
          <select
            onChange={(event) => setSelectedRoundKey(event.target.value)}
            value={activeRoundKey || ""}
          >
            {rounds.map((round) => (
              <option key={round.key} value={round.key}>
                {round.label}
              </option>
            ))}
          </select>
        </label>
        <div className="calendar-nav-buttons">
          <button
            disabled={currentIndex <= 0}
            onClick={() => setSelectedRoundKey(rounds[currentIndex - 1]?.key || null)}
            type="button"
          >
            ←
          </button>
          <button
            disabled={currentIndex === -1 || currentIndex >= rounds.length - 1}
            onClick={() => setSelectedRoundKey(rounds[currentIndex + 1]?.key || null)}
            type="button"
          >
            →
          </button>
        </div>
      </div>

      <section className="mini-metrics-grid calendar-mini-metrics">
        <div className="mini-card">
          <span>Partidos jornada</span>
          <strong>{visibleMatches.length}</strong>
        </div>
        <div className="mini-card">
          <span>Partidos con jugadores</span>
          <strong>{interestingMatches.length}</strong>
        </div>
        <div className="mini-card">
          <span>Jugadores detectados</span>
          <strong>{playersDetected}</strong>
        </div>
      </section>

      <div className="calendar-match-list">
        {visibleMatches.length ? (
          visibleMatches.map((match) => (
            <CalendarMatchCard
              key={match.id}
              logoMap={logoMap}
              match={match}
              onOpenPlayer={onOpenPlayer}
              roundLabel={activeRound?.label || roundInfo(match, playoffDatesByGroup).label}
            />
          ))
        ) : (
          <div className="empty-state">No hay partidos para esta selección.</div>
        )}
      </div>
    </section>
  );
}

export function CalendarView({
  matches,
  reports,
  accessibleReports,
  canOpenAllGeneralPlayers,
  campogramPlayers,
  campogramReports,
  objectiveMatches,
  onOpenGeneralPlayer,
  onOpenCampogramPlayer,
}: {
  matches: CalendarMatch[];
  reports: ScoutingReport[];
  accessibleReports: ScoutingReport[];
  canOpenAllGeneralPlayers: boolean;
  campogramPlayers: CampogramPlayer[];
  campogramReports: CampogramReport[];
  objectiveMatches: ObjectivePlayerMatch[];
  onOpenGeneralPlayer: (playerName: string) => void;
  onOpenCampogramPlayer: (playerName: string, playerId?: string) => void;
}) {
  const [source, setSource] = useState<PlayerSource>("general");
  const [onlyWithPlayers, setOnlyWithPlayers] = useState(false);
  const [storedCompetition, setStoredCompetition] = useSessionState<CompetitionName>(
    "calendar.competition",
    "1RFEF",
  );
  // Vacio = todos los grupos de la liga elegida.
  const [selectedGroups, setSelectedGroups] = useSessionState<string[]>("calendar.groups", []);

  const enrichedMatches = useMemo(() => {
    const playerIndex = buildPlayerIndex(source, reports, campogramPlayers, campogramReports, {
      accessibleReports,
      canOpenAllGeneralPlayers,
    });
    const enriched = enrichMatches(matches, playerIndex);
    return onlyWithPlayers ? enriched.filter((match) => match.playersTotal > 0) : enriched;
  }, [
    accessibleReports,
    canOpenAllGeneralPlayers,
    campogramPlayers,
    campogramReports,
    matches,
    onlyWithPlayers,
    reports,
    source,
  ]);

  const logoMap = useMemo(() => buildTeamLogoMap(objectiveMatches), [objectiveMatches]);
  const availableCompetitions = useMemo(
    () =>
      COMPETITIONS.filter((competition) =>
        matches.some((match) => competitionKey(match.competition) === competition),
      ),
    [matches],
  );
  const activeCompetition = availableCompetitions.includes(storedCompetition)
    ? storedCompetition
    : availableCompetitions[0];
  const availableCountries = COUNTRIES.filter((country) =>
    availableCompetitions.some((competition) => COMPETITION_COUNTRY[competition] === country.code),
  );
  const activeCountry = activeCompetition ? COMPETITION_COUNTRY[activeCompetition] : undefined;
  const countryCompetitions = availableCompetitions.filter(
    (competition) => COMPETITION_COUNTRY[competition] === activeCountry,
  );
  const competitionGroups = useMemo(
    () =>
      Array.from(
        new Set(
          matches
            .filter((match) => competitionKey(match.competition) === activeCompetition)
            .map((match) => match.group_name || "Sin grupo"),
        ),
      ).sort(sortGroups),
    [activeCompetition, matches],
  );
  const activeGroups = selectedGroups.filter((group) => competitionGroups.includes(group));
  const scopedMatches = useMemo(
    () =>
      enrichedMatches.filter(
        (match) =>
          competitionKey(match.competition) === activeCompetition &&
          (!activeGroups.length || activeGroups.includes(match.group_name || "Sin grupo")),
      ),
    [activeCompetition, activeGroups, enrichedMatches],
  );

  function selectCompetition(competition: CompetitionName) {
    setStoredCompetition(competition);
    setSelectedGroups([]);
  }

  function toggleGroup(group: string) {
    setSelectedGroups((current) => {
      const valid = current.filter((value) => competitionGroups.includes(value));
      const next = valid.includes(group) ? valid.filter((value) => value !== group) : [...valid, group];
      return next.length === competitionGroups.length ? [] : next;
    });
  }

  const openPlayer =
    source === "general"
      ? (player: CalendarPlayer) => onOpenGeneralPlayer(player.playerName)
      : (player: CalendarPlayer) => onOpenCampogramPlayer(player.playerName, player.campogramPlayerId);

  return (
    <section className="content-card calendar-view">
      {availableCompetitions.length > 0 && (
        <div className="calendar-league-bar">
          <div className="calendar-league-bar__row">
            <span>País</span>
            <div className="calendar-chip-group">
              {availableCountries.map((country) => (
                <button
                  className={`calendar-country-chip${country.code === activeCountry ? " is-active" : ""}`}
                  key={country.code}
                  onClick={() => {
                    const firstCompetition = availableCompetitions.find(
                      (competition) => COMPETITION_COUNTRY[competition] === country.code,
                    );
                    if (firstCompetition && country.code !== activeCountry) {
                      selectCompetition(firstCompetition);
                    }
                  }}
                  type="button"
                >
                  <CountryFlag code={country.code} />
                  {country.name}
                </button>
              ))}
            </div>
          </div>
          <div className="calendar-league-bar__row">
            <span>Liga</span>
            <div className="calendar-chip-group">
              {countryCompetitions.map((competition) => (
                <button
                  className={`calendar-league-chip${competition === activeCompetition ? " is-active" : ""}`}
                  key={competition}
                  onClick={() => selectCompetition(competition)}
                  type="button"
                >
                  <CompetitionLogo competition={competition} size="chip" />
                  {competition}
                </button>
              ))}
            </div>
          </div>
          {competitionGroups.length > 1 && (
            <div className="calendar-league-bar__row">
              <span>Grupos</span>
              <div className="calendar-chip-group">
                <button
                  className={!activeGroups.length ? "is-active" : ""}
                  onClick={() => setSelectedGroups([])}
                  type="button"
                >
                  Todos
                </button>
                {competitionGroups.map((group) => (
                  <button
                    className={activeGroups.includes(group) ? "is-active" : ""}
                    key={group}
                    onClick={() => toggleGroup(group)}
                    type="button"
                  >
                    {group}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="section-title">
        <h2>Planificación de partidos</h2>
        <span>{scopedMatches.length} visibles</span>
      </div>

      <div className="calendar-global-controls">
        <label>
          Fuente de jugadores
          <select onChange={(event) => setSource(event.target.value as PlayerSource)} value={source}>
            <option value="general">Jugadores base general</option>
            <option value="campograms">Jugadores campogramas</option>
          </select>
        </label>
        <label className="calendar-toggle">
          <input
            checked={onlyWithPlayers}
            onChange={(event) => setOnlyWithPlayers(event.target.checked)}
            type="checkbox"
          />
          Solo partidos con jugadores
        </label>
      </div>

      {activeCompetition ? (
        <>
          <CalendarOverviewCharts competitions={[activeCompetition]} matches={scopedMatches} />
          <CompetitionCalendarSection
            competition={activeCompetition}
            key={activeCompetition}
            logoMap={logoMap}
            matches={scopedMatches}
            onOpenPlayer={openPlayer}
          />
        </>
      ) : (
        <div className="empty-state">No hay calendario cargado para esta temporada.</div>
      )}
    </section>
  );
}
