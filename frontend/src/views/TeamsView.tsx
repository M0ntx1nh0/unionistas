import { useEffect, useMemo, useState } from "react";
import type { CalendarMatch, ObjectivePlayerMatch, ScoutingReport } from "../types";
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
  sofascoreTeamImage,
  verdictClass,
  verdictPriority,
} from "../lib/competitions";

type TeamSort = "players" | "top" | "alpha";

type TeamPlayer = {
  key: string;
  name: string;
  position: string;
  birthYear: number | null;
  verdict: string;
  reportsCount: number;
  lastReportDate: string | null;
  scouts: string[];
};

type TeamSummary = {
  key: string;
  name: string;
  league: string;
  leagueKey: CompetitionName | "";
  country: string;
  group: string;
  crest?: string;
  otherCompetitions: string[];
  players: TeamPlayer[];
  reportsCount: number;
  verdictCounts: Map<string, number>;
  topPlayers: number;
  score: number;
};

type LeagueSummary = {
  name: string;
  leagueKey: CompetitionName | "";
  country: string;
  teams: TeamSummary[];
  playersCount: number;
  reportsCount: number;
  verdictCounts: Map<string, number>;
};

type CalendarTeamInfo = { teamId: string; group: string };

const ALL_GROUPS = "Todos";

// Tramos de la barra de valoraciones, del mejor al peor. "short" es lo que se lee dentro de la barra.
const VERDICT_BANDS = [
  { key: "a-plus", label: "A+", short: "A+", score: 5, match: (verdict: string) => verdict === "A+" },
  { key: "a", label: "A", short: "A", score: 4, match: (verdict: string) => verdict === "A" },
  { key: "b", label: "B", short: "B", score: 3, match: (verdict: string) => verdict === "B" },
  {
    key: "c",
    label: "C / Seguir valorando",
    short: "C",
    score: 2,
    match: (verdict: string) => ["c", "seguir valorando", "seguir viendo"].includes(normalizeText(verdict)),
  },
  {
    key: "d",
    label: "D / E",
    short: "D/E",
    score: 1,
    match: (verdict: string) => ["d", "e"].includes(normalizeText(verdict)),
  },
  { key: "other", label: "Sin consenso / otros", short: "·", score: null, match: () => true },
] as const;

const SORT_OPTIONS: Array<{ value: TeamSort; label: string }> = [
  { value: "players", label: "Más jugadores con informe" },
  { value: "top", label: "Mejor valorados" },
  { value: "alpha", label: "Alfabético" },
];

// Competiciones que no son la liga del equipo: se muestran aparte y no deciden su liga.
function isCupCompetition(label: string) {
  return /\b(copa|coppa|cup|mundial|youth league|supercoppa|torneo|amistoso|trofeo|qualifiers)\b/.test(
    normalizeText(label),
  );
}

function competitionCountry(label: string) {
  const key = competitionKey(label);
  if (key) return COUNTRIES.find((country) => country.code === COMPETITION_COUNTRY[key])?.name || "Otros";
  const fromParenthesis = label.match(/^\s*([^()]+?)\s*\(/)?.[1];
  if (fromParenthesis) return fromParenthesis;
  const normalized = normalizeText(label);
  if (/mundial|uefa|caf|fifa|qualifiers/.test(normalized)) return "Internacional";
  if (/rfef|laliga|juvenil|liga nacional|division de honor|copa del rey|copa cataluna|copa de campeones/.test(normalized)) {
    return "España";
  }
  return "Otros";
}

function leagueDisplayName(label: string) {
  return competitionKey(label) || label.trim() || "Sin competición";
}

function mostFrequent(values: string[]) {
  const counts = new Map<string, number>();
  for (const value of values) {
    if (!value) continue;
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || "";
}

function verdictBand(verdict: string) {
  return VERDICT_BANDS.find((band) => band.match(verdict)) || VERDICT_BANDS[VERDICT_BANDS.length - 1];
}

function teamInitials(name: string) {
  const words = normalizeText(name)
    .split(" ")
    .filter((word) => word.length > 2 && !["club", "deportivo", "futbol", "calcio"].includes(word));
  return (words[0]?.[0] || name[0] || "?").toUpperCase() + (words[1]?.[0] || "").toUpperCase();
}

function groupOrderValue(groupName: string) {
  const normalized = normalizeText(groupName);
  const roman: Record<string, number> = { i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6 };
  const numeric = normalized.match(/\b(\d+)\b/)?.[1];
  if (numeric) return Number(numeric);
  const romanMatch = normalized.match(/\b(i|ii|iii|iv|v|vi)\b/)?.[1];
  if (romanMatch) return roman[romanMatch];
  const letter = normalized.match(/\b([a-f])$/)?.[1];
  if (letter) return letter.charCodeAt(0) - 96;
  return 99;
}

function sortGroups(a: string, b: string) {
  return groupOrderValue(a) - groupOrderValue(b) || a.localeCompare(b, "es");
}

// Id de Sofascore y grupo de cada equipo según el calendario de la temporada.
function buildCalendarTeamIndex(matches: CalendarMatch[]) {
  const collected = new Map<string, { ids: string[]; groups: string[] }>();
  for (const match of matches) {
    const competition = competitionKey(match.competition);
    if (!competition) continue;
    const sides: Array<[string, string | null]> = [
      [match.home_team_name, match.home_team_id],
      [match.away_team_name, match.away_team_id],
    ];
    for (const [teamName, teamId] of sides) {
      const key = `${competition}|${canonicalTeamName(teamName, competition)}`;
      const entry = collected.get(key) || { ids: [], groups: [] };
      if (teamId) entry.ids.push(teamId);
      if (match.group_name) entry.groups.push(match.group_name);
      collected.set(key, entry);
    }
  }
  const index = new Map<string, CalendarTeamInfo>();
  for (const [key, entry] of collected.entries()) {
    index.set(key, { teamId: mostFrequent(entry.ids), group: mostFrequent(entry.groups) });
  }
  return index;
}

function upcomingMatchesByTeam(matches: CalendarMatch[]) {
  const today = new Date().toISOString().slice(0, 10);
  const index = new Map<string, CalendarMatch[]>();
  for (const match of matches) {
    if (!match.match_date || match.match_date < today) continue;
    if (normalizeText(match.status) === "canceled") continue;
    const competition = competitionKey(match.competition);
    if (!competition) continue;
    for (const teamName of [match.home_team_name, match.away_team_name]) {
      const key = `${competition}|${canonicalTeamName(teamName, competition)}`;
      index.set(key, [...(index.get(key) || []), match]);
    }
  }
  for (const list of index.values()) {
    list.sort((a, b) =>
      `${a.match_date}${a.kickoff_time || ""}`.localeCompare(`${b.match_date}${b.kickoff_time || ""}`),
    );
  }
  return index;
}

function teamCalendarKey(team: Pick<TeamSummary, "leagueKey" | "name">) {
  return team.leagueKey ? `${team.leagueKey}|${canonicalTeamName(team.name, team.leagueKey)}` : "";
}

function buildTeams(
  reports: ScoutingReport[],
  calendarIndex: Map<string, CalendarTeamInfo>,
  wyscoutLogos: Map<string, string>,
) {
  const reportsByTeam = new Map<string, ScoutingReport[]>();
  for (const report of reports) {
    const key = normalizeText(report.team_name);
    if (!key) continue;
    reportsByTeam.set(key, [...(reportsByTeam.get(key) || []), report]);
  }

  const teams: TeamSummary[] = [];
  for (const [key, teamReports] of reportsByTeam.entries()) {
    const competitions = teamReports.map((report) => (report.competition || "").trim()).filter(Boolean);
    const leagueCompetitions = competitions.filter((competition) => !isCupCompetition(competition));
    const leagueLabel = mostFrequent(leagueCompetitions.length ? leagueCompetitions : competitions);
    const league = leagueDisplayName(leagueLabel);
    const leagueKey = competitionKey(leagueLabel) as CompetitionName | "";
    const name = mostFrequent(teamReports.map((report) => report.team_name || "")) || key;
    const calendarKey = teamCalendarKey({ leagueKey, name });
    const calendarInfo = calendarKey ? calendarIndex.get(calendarKey) : undefined;

    const reportsByPlayer = new Map<string, ScoutingReport[]>();
    for (const report of teamReports) {
      const playerKey = normalizeText(report.player_name);
      if (!playerKey) continue;
      reportsByPlayer.set(playerKey, [...(reportsByPlayer.get(playerKey) || []), report]);
    }

    const players: TeamPlayer[] = Array.from(reportsByPlayer.entries()).map(([playerKey, playerReports]) => {
      const sorted = [...playerReports].sort((a, b) => (b.report_date || "").localeCompare(a.report_date || ""));
      const consensus = buildConsensus(playerReports.map((report) => report.verdict));
      return {
        key: playerKey,
        name: sorted[0].player_name,
        position: mostFrequent(playerReports.map((report) => report.position || "")) || "Sin posición",
        birthYear: sorted.find((report) => report.birth_year)?.birth_year || null,
        verdict: consensus === "NC" ? "Sin consenso" : consensus,
        reportsCount: playerReports.length,
        lastReportDate: sorted[0].report_date,
        scouts: Array.from(new Set(playerReports.map((report) => report.scout_name || "").filter(Boolean))).sort(),
      };
    });
    players.sort((a, b) => verdictPriority(a.verdict) - verdictPriority(b.verdict) || a.name.localeCompare(b.name, "es"));

    const verdictCounts = new Map<string, number>();
    const scores: number[] = [];
    for (const player of players) {
      const band = verdictBand(player.verdict);
      verdictCounts.set(band.key, (verdictCounts.get(band.key) || 0) + 1);
      if (band.score !== null) scores.push(band.score);
    }

    teams.push({
      key,
      name,
      league,
      leagueKey,
      country: competitionCountry(leagueLabel),
      group: calendarInfo?.group || "",
      crest:
        sofascoreTeamImage(calendarInfo?.teamId) || (calendarKey ? wyscoutLogos.get(calendarKey) : undefined),
      otherCompetitions: Array.from(
        new Set(competitions.map(leagueDisplayName).filter((competition) => competition !== league)),
      ).sort((a, b) => a.localeCompare(b, "es")),
      players,
      reportsCount: teamReports.length,
      verdictCounts,
      topPlayers: (verdictCounts.get("a-plus") || 0) + (verdictCounts.get("a") || 0),
      score: scores.length ? scores.reduce((sum, value) => sum + value, 0) / scores.length : 0,
    });
  }
  return teams;
}

function sortTeams(teams: TeamSummary[], sort: TeamSort) {
  return [...teams].sort((a, b) => {
    if (sort === "alpha") return a.name.localeCompare(b.name, "es");
    if (sort === "top") {
      return (
        b.score - a.score ||
        b.topPlayers - a.topPlayers ||
        b.players.length - a.players.length ||
        a.name.localeCompare(b.name, "es")
      );
    }
    return b.players.length - a.players.length || b.reportsCount - a.reportsCount || a.name.localeCompare(b.name, "es");
  });
}

function TeamCrest({ logo, name, size = "card" }: { logo?: string; name: string; size?: "card" | "large" }) {
  const [failed, setFailed] = useState(false);
  return (
    <span className={`teams-crest teams-crest--${size}${logo && !failed ? " has-logo" : ""}`}>
      {logo && !failed ? (
        <img alt="" loading="lazy" onError={() => setFailed(true)} referrerPolicy="no-referrer" src={logo} />
      ) : (
        <strong>{teamInitials(name)}</strong>
      )}
    </span>
  );
}

function VerdictBar({ counts, size = "card" }: { counts: Map<string, number>; size?: "card" | "league" }) {
  const total = Array.from(counts.values()).reduce((sum, count) => sum + count, 0);
  return (
    <div className={`teams-verdict-bar teams-verdict-bar--${size}`} role="img" aria-label="Distribución de valoraciones">
      {VERDICT_BANDS.map((band) => {
        const count = counts.get(band.key) || 0;
        if (!count) return null;
        return (
          <span
            className={`teams-verdict-bar__seg is-${band.key}`}
            key={band.key}
            style={{ flexGrow: count }}
            title={`${band.label}: ${count} ${count === 1 ? "jugador" : "jugadores"}`}
          >
            {count} {band.short}
          </span>
        );
      })}
      {!total && <span className="teams-verdict-bar__seg is-other" style={{ flexGrow: 1 }} />}
    </div>
  );
}

function NextMatchLine({ match, team }: { match?: CalendarMatch; team: TeamSummary }) {
  if (!match || !team.leagueKey) return null;
  const isHome =
    canonicalTeamName(match.home_team_name, team.leagueKey) === canonicalTeamName(team.name, team.leagueKey);
  const rival = isHome ? match.away_team_name : match.home_team_name;
  return (
    <p className="teams-card__next">
      <span>Próximo</span>
      {formatDate(match.match_date)} · {isHome ? "vs" : "en"} {rival}
    </p>
  );
}

function TeamCard({
  team,
  nextMatch,
  onOpen,
}: {
  team: TeamSummary;
  nextMatch?: CalendarMatch;
  onOpen: () => void;
}) {
  return (
    <button className="teams-card" onClick={onOpen} type="button">
      <div className="teams-card__head">
        <TeamCrest logo={team.crest} name={team.name} />
        <div>
          <strong>{team.name}</strong>
          <small>
            {team.players.length} {team.players.length === 1 ? "jugador" : "jugadores"} · {team.reportsCount}{" "}
            {team.reportsCount === 1 ? "informe" : "informes"}
          </small>
        </div>
      </div>
      <VerdictBar counts={team.verdictCounts} />
      <div className="teams-card__players">
        {team.players.slice(0, 3).map((player) => (
          <span className={verdictClass(player.verdict)} key={player.key}>
            {player.verdict} · {player.name}
          </span>
        ))}
        {team.players.length > 3 && <em>+{team.players.length - 3} más</em>}
      </div>
      <NextMatchLine match={nextMatch} team={team} />
    </button>
  );
}

function TeamDetail({
  team,
  upcoming,
  onClose,
  onOpenPlayer,
}: {
  team: TeamSummary;
  upcoming: CalendarMatch[];
  onClose: () => void;
  onOpenPlayer: (playerName: string) => void;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="teams-drawer" onClick={onClose} role="presentation">
      <aside
        aria-label={`Detalle de ${team.name}`}
        className="teams-drawer__panel"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="teams-drawer__head">
          <TeamCrest logo={team.crest} name={team.name} size="large" />
          <div>
            <h2>{team.name}</h2>
            <p className="teams-drawer__league">
              <CountryFlag country={team.country} />
              {team.leagueKey && <CompetitionLogo competition={team.leagueKey} size="chip" />}
              {team.league}
              {team.group ? ` · ${team.group}` : ""}
            </p>
          </div>
          <button aria-label="Cerrar" className="teams-drawer__close" onClick={onClose} type="button">
            ×
          </button>
        </header>

        <section className="mini-metrics-grid teams-drawer__metrics">
          <div className="mini-card">
            <span>Jugadores</span>
            <strong>{team.players.length}</strong>
          </div>
          <div className="mini-card">
            <span>Informes</span>
            <strong>{team.reportsCount}</strong>
          </div>
          <div className="mini-card">
            <span>A+ / A</span>
            <strong>{team.topPlayers}</strong>
          </div>
        </section>

        <VerdictBar counts={team.verdictCounts} size="league" />

        {team.otherCompetitions.length > 0 && (
          <p className="teams-drawer__note">También visto en: {team.otherCompetitions.join(" · ")}</p>
        )}

        {upcoming.length > 0 && (
          <section className="teams-drawer__section">
            <h3>Próximos partidos</h3>
            <ul className="teams-drawer__matches">
              {upcoming.slice(0, 3).map((match) => (
                <li key={match.id}>
                  <strong>
                    {formatDate(match.match_date)} · {formatTime(match.kickoff_time)}
                  </strong>
                  <span>
                    {match.home_team_name} – {match.away_team_name}
                  </span>
                  {normalizeText(match.status) === "postponed" && <em>Aplazado</em>}
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="teams-drawer__section">
          <h3>Jugadores informados</h3>
          <div className="teams-player-list">
            {team.players.map((player) => (
              <button
                className="teams-player-row"
                key={player.key}
                onClick={() => onOpenPlayer(player.name)}
                type="button"
              >
                <span className={`teams-player-row__verdict ${verdictClass(player.verdict)}`}>{player.verdict}</span>
                <span className="teams-player-row__main">
                  <strong>{player.name}</strong>
                  <small>
                    {player.position}
                    {player.birthYear ? ` · ${player.birthYear}` : ""}
                  </small>
                </span>
                <span className="teams-player-row__meta">
                  <strong>
                    {player.reportsCount} {player.reportsCount === 1 ? "informe" : "informes"}
                  </strong>
                  <small>
                    {player.lastReportDate ? formatDate(player.lastReportDate) : "Sin fecha"}
                    {player.scouts.length ? ` · ${player.scouts.join(", ")}` : ""}
                  </small>
                </span>
              </button>
            ))}
          </div>
        </section>
      </aside>
    </div>
  );
}

function LeagueSection({
  league,
  isOpen,
  onToggle,
  group,
  onGroupChange,
  sort,
  onSortChange,
  upcomingIndex,
  onOpenTeam,
}: {
  league: LeagueSummary;
  isOpen: boolean;
  onToggle: () => void;
  group: string;
  onGroupChange: (group: string) => void;
  sort: TeamSort;
  onSortChange: (sort: TeamSort) => void;
  upcomingIndex: Map<string, CalendarMatch[]>;
  onOpenTeam: (teamKey: string) => void;
}) {
  const groups = Array.from(new Set(league.teams.map((team) => team.group).filter(Boolean))).sort(sortGroups);
  const hasGroups = groups.length > 1;
  const activeGroup = hasGroups && groups.includes(group) ? group : ALL_GROUPS;
  const filteredTeams = sortTeams(
    league.teams.filter((team) => activeGroup === ALL_GROUPS || team.group === activeGroup),
    sort,
  );
  // Con "Todos" y varios grupos, los equipos se muestran separados por grupo.
  const sections =
    hasGroups && activeGroup === ALL_GROUPS
      ? [...groups, ""].map((name) => ({
          name: name || "Sin grupo en calendario",
          teams: filteredTeams.filter((team) => team.group === name),
        }))
      : [{ name: "", teams: filteredTeams }];

  return (
    <section className={`teams-league${isOpen ? " is-open" : ""}`}>
      <button aria-expanded={isOpen} className="teams-league__head" onClick={onToggle} type="button">
        <span className="teams-league__identity">
          {league.leagueKey ? (
            <CompetitionLogo competition={league.leagueKey} size="header" />
          ) : (
            <span className="teams-league__flag">
              <CountryFlag country={league.country} />
            </span>
          )}
          <span className="teams-league__title">
            <strong>{league.name}</strong>
            <small>
              <CountryFlag country={league.country} /> {league.country}
              {hasGroups ? ` · ${groups.length} grupos` : ""}
            </small>
          </span>
        </span>
        <span className="teams-league__stats">
          <span>
            <strong>{league.teams.length}</strong> {league.teams.length === 1 ? "equipo" : "equipos"}
          </span>
          <span>
            <strong>{league.playersCount}</strong> {league.playersCount === 1 ? "jugador" : "jugadores"}
          </span>
          <span>
            <strong>{league.reportsCount}</strong> {league.reportsCount === 1 ? "informe" : "informes"}
          </span>
        </span>
        <span className="teams-league__bar">
          <VerdictBar counts={league.verdictCounts} size="league" />
        </span>
        <span aria-hidden="true" className="teams-league__chevron">
          ▾
        </span>
      </button>

      {isOpen && (
        <div className="teams-league__body">
          <div className="teams-league__controls">
            {hasGroups ? (
              <div className="calendar-chip-group">
                {[ALL_GROUPS, ...groups].map((name) => (
                  <button
                    className={activeGroup === name ? "is-active" : ""}
                    key={name}
                    onClick={() => onGroupChange(name)}
                    type="button"
                  >
                    {name}
                  </button>
                ))}
              </div>
            ) : (
              <span />
            )}
            <label>
              Ordenar
              <select onChange={(event) => onSortChange(event.target.value as TeamSort)} value={sort}>
                {SORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {sections
            .filter((section) => section.teams.length)
            .map((section) => (
              <div className="teams-group" key={section.name || "all"}>
                {section.name && (
                  <h3 className="teams-group__title">
                    {section.name}
                    <small>
                      {section.teams.length} {section.teams.length === 1 ? "equipo" : "equipos"}
                    </small>
                  </h3>
                )}
                <div className="teams-grid">
                  {section.teams.map((team) => (
                    <TeamCard
                      key={team.key}
                      nextMatch={upcomingIndex.get(teamCalendarKey(team))?.[0]}
                      onOpen={() => onOpenTeam(team.key)}
                      team={team}
                    />
                  ))}
                </div>
              </div>
            ))}
        </div>
      )}
    </section>
  );
}

export function TeamsView({
  reports,
  matches,
  objectiveMatches,
  onOpenPlayer,
}: {
  reports: ScoutingReport[];
  matches: CalendarMatch[];
  objectiveMatches: ObjectivePlayerMatch[];
  onOpenPlayer: (playerName: string) => void;
}) {
  const [country, setCountry] = useSessionState<string>("teams.country", "Todos");
  const [openLeagues, setOpenLeagues] = useSessionState<string[]>("teams.openLeagues", []);
  const [groupByLeague, setGroupByLeague] = useSessionState<Record<string, string>>("teams.groups", {});
  const [sortByLeague, setSortByLeague] = useSessionState<Record<string, TeamSort>>("teams.sortByLeague", {});
  const [search, setSearch] = useState("");
  const [selectedTeamKey, setSelectedTeamKey] = useState<string | null>(null);

  const calendarIndex = useMemo(() => buildCalendarTeamIndex(matches), [matches]);
  const wyscoutLogos = useMemo(() => buildTeamLogoMap(objectiveMatches), [objectiveMatches]);
  const teams = useMemo(() => buildTeams(reports, calendarIndex, wyscoutLogos), [calendarIndex, reports, wyscoutLogos]);
  const upcomingIndex = useMemo(() => upcomingMatchesByTeam(matches), [matches]);

  const countries = useMemo(() => {
    const counts = new Map<string, number>();
    for (const team of teams) counts.set(team.country, (counts.get(team.country) || 0) + 1);
    const pinned = COUNTRIES.map((item) => item.name);
    return Array.from(counts.entries()).sort((a, b) => {
      const rank = (name: string) =>
        name === "Otros" ? 3 : name === "Internacional" ? 2 : pinned.includes(name) ? 0 : 1;
      return rank(a[0]) - rank(b[0]) || b[1] - a[1] || a[0].localeCompare(b[0], "es");
    });
  }, [teams]);
  const activeCountry = country === "Todos" || countries.some(([name]) => name === country) ? country : "Todos";

  const normalizedSearch = normalizeText(search);
  const visibleTeams = useMemo(
    () =>
      teams.filter((team) => {
        if (activeCountry !== "Todos" && team.country !== activeCountry) return false;
        if (!normalizedSearch) return true;
        return (
          normalizeText(team.name).includes(normalizedSearch) ||
          team.players.some((player) => normalizeText(player.name).includes(normalizedSearch))
        );
      }),
    [activeCountry, normalizedSearch, teams],
  );

  const leagues = useMemo(() => {
    const byLeague = new Map<string, LeagueSummary>();
    for (const team of visibleTeams) {
      const league = byLeague.get(team.league) || {
        name: team.league,
        leagueKey: team.leagueKey,
        country: team.country,
        teams: [],
        playersCount: 0,
        reportsCount: 0,
        verdictCounts: new Map<string, number>(),
      };
      league.teams.push(team);
      league.playersCount += team.players.length;
      league.reportsCount += team.reportsCount;
      for (const [band, count] of team.verdictCounts.entries()) {
        league.verdictCounts.set(band, (league.verdictCounts.get(band) || 0) + count);
      }
      byLeague.set(team.league, league);
    }
    const knownOrder = new Map<string, number>(COMPETITIONS.map((name, index) => [name, index]));
    return Array.from(byLeague.values()).sort((a, b) => {
      const aKnown = knownOrder.get(a.name) ?? 99;
      const bKnown = knownOrder.get(b.name) ?? 99;
      return aKnown - bKnown || b.playersCount - a.playersCount || a.name.localeCompare(b.name, "es");
    });
  }, [visibleTeams]);

  const selectedTeam = teams.find((team) => team.key === selectedTeamKey) || null;
  const totalPlayers = visibleTeams.reduce((total, team) => total + team.players.length, 0);
  const totalReports = visibleTeams.reduce((total, team) => total + team.reportsCount, 0);
  const allOpen = leagues.length > 0 && leagues.every((league) => openLeagues.includes(league.name));

  function toggleLeague(name: string) {
    setOpenLeagues((current) =>
      current.includes(name) ? current.filter((value) => value !== name) : [...current, name],
    );
  }

  return (
    <section className="content-card teams-view">
      <div className="section-title">
        <h2>Equipos</h2>
        <span>
          {leagues.length} ligas · {visibleTeams.length} equipos
        </span>
      </div>

      <section className="mini-metrics-grid teams-metrics">
        <div className="mini-card">
          <span>Ligas</span>
          <strong>{leagues.length}</strong>
        </div>
        <div className="mini-card">
          <span>Equipos</span>
          <strong>{visibleTeams.length}</strong>
        </div>
        <div className="mini-card">
          <span>Jugadores</span>
          <strong>{totalPlayers}</strong>
        </div>
        <div className="mini-card">
          <span>Informes</span>
          <strong>{totalReports}</strong>
        </div>
      </section>

      <div className="teams-toolbar">
        <div className="teams-toolbar__row">
          <span>País</span>
          <div className="calendar-chip-group">
            <button
              className={activeCountry === "Todos" ? "is-active" : ""}
              onClick={() => setCountry("Todos")}
              type="button"
            >
              Todos
            </button>
            {countries.map(([name, count]) => (
              <button
                className={`calendar-country-chip${activeCountry === name ? " is-active" : ""}`}
                key={name}
                onClick={() => setCountry(name)}
                type="button"
              >
                <CountryFlag country={name} />
                {name}
                <small className="teams-chip-count">{count}</small>
              </button>
            ))}
          </div>
        </div>
        <div className="teams-toolbar__filters">
          <label>
            Buscar equipo o jugador
            <input
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Ej. Badajoz, Pianese…"
              type="search"
              value={search}
            />
          </label>
          <button
            className="teams-toggle-all"
            onClick={() => setOpenLeagues(allOpen ? [] : leagues.map((league) => league.name))}
            type="button"
          >
            {allOpen ? "Plegar todas" : "Desplegar todas"}
          </button>
        </div>
        <div className="teams-legend">
          {VERDICT_BANDS.map((band) => (
            <span key={band.key}>
              <i className={`teams-verdict-bar__seg is-${band.key}`} />
              {band.label}
            </span>
          ))}
        </div>
      </div>

      {leagues.length === 0 && <div className="empty-state">No hay equipos con informes para esta selección.</div>}

      <div className="teams-league-list">
        {leagues.map((league) => (
          <LeagueSection
            group={groupByLeague[league.name] || ALL_GROUPS}
            isOpen={Boolean(normalizedSearch) || openLeagues.includes(league.name)}
            key={league.name}
            league={league}
            onGroupChange={(group) => setGroupByLeague((current) => ({ ...current, [league.name]: group }))}
            onOpenTeam={setSelectedTeamKey}
            onSortChange={(sort) => setSortByLeague((current) => ({ ...current, [league.name]: sort }))}
            onToggle={() => toggleLeague(league.name)}
            sort={sortByLeague[league.name] || "players"}
            upcomingIndex={upcomingIndex}
          />
        ))}
      </div>

      {selectedTeam && (
        <TeamDetail
          onClose={() => setSelectedTeamKey(null)}
          onOpenPlayer={(playerName) => {
            setSelectedTeamKey(null);
            onOpenPlayer(playerName);
          }}
          team={selectedTeam}
          upcoming={upcomingIndex.get(teamCalendarKey(selectedTeam)) || []}
        />
      )}
    </section>
  );
}
