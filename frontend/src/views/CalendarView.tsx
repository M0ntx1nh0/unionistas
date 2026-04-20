import { useEffect, useMemo, useState } from "react";
import type {
  CalendarMatch,
  CampogramPlayer,
  CampogramReport,
  ObjectivePlayerMatch,
  ScoutingReport,
} from "../types";
import { formatDate, formatTime } from "../utils/format";

type PlayerSource = "general" | "campograms";

type CalendarPlayer = {
  playerName: string;
  teamName: string;
  competition: string | null;
  verdict: string;
  canOpen?: boolean;
  campogramPlayerId?: string;
};

type TeamLogoMap = Map<string, string>;

type EnrichedMatch = CalendarMatch & {
  homePlayers: CalendarPlayer[];
  awayPlayers: CalendarPlayer[];
  playersTotal: number;
  interestLabel: string;
  interestClass: string;
};

const COMPETITIONS = ["1RFEF", "2RFEF"] as const;

const INTEREST_BUCKETS = [
  { key: "top", label: "+ de 10", className: "is-top" },
  { key: "high", label: "7-10", className: "is-high" },
  { key: "medium", label: "4-6", className: "is-medium" },
  { key: "low", label: "Menos de 4", className: "is-low" },
] as const;

const TEAM_ALIASES: Record<string, Record<string, string>> = {
  "1RFEF": {
    "racing ferrol": "racing de ferrol",
    "racing de ferrol": "racing de ferrol",
    "atletico b": "atletico madrid b",
    "atletico madrileno": "atletico madrid b",
    "atletico madrileño": "atletico madrid b",
    "sabadell": "sabadell",
    "ce sabadell": "sabadell",
    "osasuna promesas": "osasuna promesas",
    "osasuna b": "osasuna promesas",
    "europa": "europa",
    "ce europa": "europa",
    "cacereno": "cacereno",
    "cp cacereno": "cacereno",
    "athletic b": "athletic bilbao",
    "athletic club b": "athletic bilbao",
    "athletic club b u21": "athletic bilbao",
    "bilbao athletic": "athletic bilbao",
    "athletic bilbao u21": "athletic bilbao",
    "celta fortuna": "celta fortuna",
    "celta b": "celta fortuna",
    "celta vigo b": "celta fortuna",
    "villarreal b": "villarreal b",
    "villarreal cf b": "villarreal b",
    "villarreal cf b u23": "villarreal b",
    "nastic": "gimnastic tarragona",
    "nastic de tarragona": "gimnastic tarragona",
    "gimnastic de tarragona": "gimnastic tarragona",
    "gimnastic tarragona": "gimnastic tarragona",
    "at sanluqueno": "atletico sanluqueno",
    "at.sanluqueno": "atletico sanluqueno",
    "atletico sanluqueno": "atletico sanluqueno",
    "atletico sanluqueño": "atletico sanluqueno",
    "torremolinos": "juventud torremolinos",
    "juventud torremolinos": "juventud torremolinos",
    "juventud torremolinos cf": "juventud torremolinos",
  },
  "2RFEF": {
    "alaves b": "deportivo alaves b",
    "deportivo alaves b": "deportivo alaves b",
    "atletico malagueno": "atletico malagueno",
    "atletico malagueño": "atletico malagueno",
    "malagueno": "atletico malagueno",
    "malagueño": "atletico malagueno",
    "barca athletic": "barcelona atletic",
    "barca atletic": "barcelona atletic",
    "barça atletic": "barcelona atletic",
    "barcelona athletic": "barcelona atletic",
    "barcelona atletic": "barcelona atletic",
    "barcelona atlètic": "barcelona atletic",
    "deportivo fabril": "deportivo fabril",
    "deportivo de la coruna b": "deportivo fabril",
    "deportivo la coruna b": "deportivo fabril",
    "deportivo b": "deportivo fabril",
    "fabril": "deportivo fabril",
    "elche b": "elche illicitano",
    "elche ilicitano": "elche illicitano",
    "elche illicitano": "elche illicitano",
    "oviedo vetusta": "real oviedo vetusta",
    "real oviedo vetusta": "real oviedo vetusta",
    "real oviedo b": "real oviedo vetusta",
    "r majadahonda": "rayo majadahonda",
    "rayo majadahonda": "rayo majadahonda",
    "cf rayo majadahonda": "rayo majadahonda",
    "majadahonda": "rayo majadahonda",
    "segoviana": "gimnastica segoviana",
    "gimnastica segoviana": "gimnastica segoviana",
    "gimnástica segoviana": "gimnastica segoviana",
    "xerez cd": "xerez",
    "xerez": "xerez",
    "xerez deportivo": "xerez deportivo",
    "xerez deportivo fc": "xerez deportivo",
    "racing b": "racing santander ii",
    "rayo cantabria": "racing santander ii",
    "racing santander ii": "racing santander ii",
    "las palmas atletico": "las palmas atletico",
    "las palmas atletico b": "las palmas atletico",
    "intercity": "intercity sj d alacant",
    "cf intercity": "intercity sj d alacant",
    "intercity sj d alacant": "intercity sj d alacant",
    "ud sanse": "s s reyes",
    "s s reyes": "s s reyes",
    "san sebastian de los reyes": "s s reyes",
    "ourense": "union deportiva ourense",
    "ud ourense": "union deportiva ourense",
    "union deportiva ourense": "union deportiva ourense",
    "lleida": "ce atletic lleida 2019",
    "atletic lleida": "ce atletic lleida 2019",
    "atletic lledia": "ce atletic lleida 2019",
    "ce atletic lleida 2019": "ce atletic lleida 2019",
    "langreo": "up langreo",
    "andratx": "ce andratx",
    "sant andreu": "ue sant andreu",
    "la union": "la union atletico",
    "fc la union atletico": "la union atletico",
    "la union atletico": "la union atletico",
    "navalcarnero": "cda navalcarnero",
    "aguilas": "cda aguilas",
    "aguilas fc": "cda aguilas",
    "deportivo aragon": "real zaragoza b",
    "rz deportivo aragon": "real zaragoza b",
    "real zaragoza b": "real zaragoza b",
    "zaragoza b": "real zaragoza b",
    "olot": "ue olot",
    "extremadura": "cd extremadura",
    "cd extremadura": "cd extremadura",
    "cd extremadura 1924": "extremadura 1924",
    "extremadura 1924": "extremadura 1924",
    "recreativo": "recreativo huelva",
    "recre": "recreativo huelva",
    "recreativo de huelva": "recreativo huelva",
    "recreativo huelva": "recreativo huelva",
    "puente genil": "salerm puente genil",
    "reus": "reus fcr",
    "reus fc reddis": "reus fcr",
    "reus fcr": "reus fcr",
    "socuellamos": "ud yugo socuellamos",
    "valladolid b": "real valladolid promesas",
    "valladolid promesas": "real valladolid promesas",
    "real valladolid b": "real valladolid promesas",
    "real valladolid promesas": "real valladolid promesas",
    "barbastro": "union deportiva barbastro",
    "porreres": "ue porreres",
    "antoniano": "club atletico antoniano",
    "marino": "marino de luanco",
    "marino luanco": "marino de luanco",
    "marino de luanco": "marino de luanco",
    "ucam": "ucam murcia",
    "ucam murcia": "ucam murcia",
  },
};

function normalizeText(value: string | null | undefined) {
  return (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " y ")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .toLocaleLowerCase("es");
}

function competitionKey(value: string | null | undefined) {
  const normalized = normalizeText(value);
  if (normalized.includes("2rfef") || normalized.includes("2 rfef") || normalized.includes("segunda")) {
    return "2RFEF";
  }
  if (normalized.includes("1rfef") || normalized.includes("1 rfef") || normalized.includes("primera")) {
    return "1RFEF";
  }
  return "";
}

function canonicalTeamName(teamName: string | null | undefined, competition: string) {
  const normalized = normalizeText(teamName);
  return TEAM_ALIASES[competition]?.[normalized] || normalized;
}

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

function playerVerdict(verdict: string | null | undefined) {
  const clean = (verdict || "").trim();
  return clean || "NC";
}

function verdictClass(value: string | null | undefined) {
  const rawValue = playerVerdict(value);
  if (rawValue === "A+") return "verdict-a-plus";
  const normalized = normalizeText(rawValue).replace(/[^a-z0-9]+/g, "-");
  return `verdict-${normalized || "nc"}`;
}

function verdictPriority(value: string | null | undefined) {
  const rawValue = playerVerdict(value);
  if (rawValue === "A+") return 0;

  const normalized = normalizeText(rawValue);
  const order: Record<string, number> = {
    a: 1,
    fichar: 1,
    b: 2,
    duda: 2,
    c: 3,
    "seguir valorando": 3,
    "seguir viendo": 3,
    d: 4,
    descartar: 4,
    nc: 5,
    "sin consenso": 5,
    "sin informes": 6,
    "sin valoracion": 6,
  };

  return order[normalized] ?? 7;
}

function buildConsensus(values: Array<string | null | undefined>) {
  const counts = new Map<string, number>();
  for (const value of values) {
    const verdict = playerVerdict(value);
    if (verdict === "NC") continue;
    counts.set(verdict, (counts.get(verdict) || 0) + 1);
  }
  if (!counts.size) return "NC";
  const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  if (sorted.length > 1 && sorted[0][1] === sorted[1][1]) return "NC";
  return sorted[0][0];
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
    const team = canonicalTeamName(report.team_name, competition);
    const key = `${competition}|${team}|${normalizeText(report.player_name)}`;
    reportsByPlayer.set(key, [...(reportsByPlayer.get(key) || []), report]);
  }
  return reportsByPlayer;
}

function buildTeamLogoMap(objectiveMatches: ObjectivePlayerMatch[]) {
  const logos: TeamLogoMap = new Map();
  for (const match of objectiveMatches) {
    const player = match.objective_player;
    if (!player?.current_team_logo || !player.current_team_name) continue;
    const competition =
      competitionKey(player.domestic_competition_name) || competitionKey(player.objective_dataset);
    if (!competition) continue;
    logos.set(`${competition}|${canonicalTeamName(player.current_team_name, competition)}`, player.current_team_logo);
    if (match.objective_team) {
      logos.set(`${competition}|${canonicalTeamName(match.objective_team, competition)}`, player.current_team_logo);
    }
  }
  return logos;
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
      const key = `${competition}|${canonicalTeamName(player.team_name, competition)}|${normalizeText(player.player_name)}`;
      const playerReports = reportsByPlayer.get(key) || [];
      addPlayer(competition, player.team_name, {
        playerName: player.player_name,
        teamName: player.team_name || "",
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

function defaultMatchday(matches: CalendarMatch[], competition: string) {
  const referenceDate = activeCalendarDate();
  const upcoming = matches
    .filter(
      (match) =>
        competitionKey(match.competition) === competition &&
        match.matchday !== null &&
        (!match.match_date || match.match_date >= referenceDate),
    )
    .sort((a, b) => {
      const dateCompare = (a.match_date || "9999-12-31").localeCompare(b.match_date || "9999-12-31");
      if (dateCompare !== 0) return dateCompare;
      return (a.matchday || 0) - (b.matchday || 0);
    });

  if (upcoming[0]?.matchday) return upcoming[0].matchday;

  return (
    matches.find((match) => competitionKey(match.competition) === competition && match.matchday !== null)
      ?.matchday || 1
  );
}

function TeamLogo({
  competition,
  logoMap,
  teamName,
}: {
  competition: string;
  logoMap: TeamLogoMap;
  teamName: string;
}) {
  const logo = logoMap.get(`${competition}|${canonicalTeamName(teamName, competition)}`);
  return logo ? <img alt={teamName} className="calendar-team-logo" src={logo} /> : null;
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
  teamName,
}: {
  competition: string;
  logoMap: TeamLogoMap;
  onOpenPlayer: (player: CalendarPlayer) => void;
  players: CalendarPlayer[];
  teamName: string;
}) {
  return (
    <div className="calendar-team-players">
      <div className="calendar-team-players__head">
        <div className="calendar-team-name">
          <TeamLogo competition={competition} logoMap={logoMap} teamName={teamName} />
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

function CalendarOverviewCharts({ matches }: { matches: EnrichedMatch[] }) {
  return (
    <section className="calendar-overview-charts">
      {COMPETITIONS.map((competition) => {
        const matchday = defaultMatchday(matches, competition);
        const competitionMatches = matches.filter(
          (match) => competitionKey(match.competition) === competition && match.matchday === matchday,
        );
        const playersTotal = competitionMatches.reduce((total, match) => total + match.playersTotal, 0);

        return (
          <InterestDistributionChart
            key={competition}
            matches={competitionMatches}
            subtitle={`${competitionMatches.length} partidos · ${playersTotal} jugadores`}
            title={`${competition} · Jornada ${matchday}`}
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
}: {
  logoMap: TeamLogoMap;
  match: EnrichedMatch;
  onOpenPlayer: (player: CalendarPlayer) => void;
}) {
  const competition = competitionKey(match.competition);
  return (
    <article className="calendar-match-card">
      <div className="calendar-match-card__main">
        <span className="calendar-match-card__meta">
          {competitionKey(match.competition) || match.competition} | {match.group_name || "Sin grupo"} | Jornada{" "}
          {match.matchday || "-"}
        </span>
        <div className="calendar-match-card__teams">
          <div className="calendar-team-name calendar-team-name--large">
            <TeamLogo competition={competition} logoMap={logoMap} teamName={match.home_team_name} />
            <strong>{match.home_team_name}</strong>
          </div>
          <span>vs</span>
          <div className="calendar-team-name calendar-team-name--large">
            <TeamLogo competition={competition} logoMap={logoMap} teamName={match.away_team_name} />
            <strong>{match.away_team_name}</strong>
          </div>
        </div>
        <div className="calendar-match-card__date">
          {formatDate(match.match_date)} | {formatTime(match.kickoff_time)}
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
          teamName={match.home_team_name}
        />
        <TeamPlayers
          competition={competition}
          logoMap={logoMap}
          onOpenPlayer={onOpenPlayer}
          players={match.awayPlayers}
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
  competition: "1RFEF" | "2RFEF";
  logoMap: TeamLogoMap;
  matches: EnrichedMatch[];
  onOpenPlayer: (player: CalendarPlayer) => void;
}) {
  const competitionMatches = useMemo(
    () => matches.filter((match) => competitionKey(match.competition) === competition),
    [competition, matches],
  );
  const groups = useMemo(
    () => Array.from(new Set(competitionMatches.map((match) => match.group_name || "Sin grupo"))).sort(sortGroups),
    [competitionMatches],
  );
  const matchdays = useMemo(
    () =>
      Array.from(
        new Set(
          competitionMatches
            .filter((match) => match.matchday !== null)
            .map((match) => match.matchday as number),
        ),
      ).sort((a, b) => a - b),
    [competitionMatches],
  );
  const defaultSelectedMatchday = defaultMatchday(matches, competition);

  const [selectedGroups, setSelectedGroups] = useState<string[]>(groups);
  const [selectedMatchday, setSelectedMatchday] = useState<number | null>(null);

  const activeMatchday = selectedMatchday ?? defaultSelectedMatchday;
  const safeSelectedGroups = selectedGroups.length ? selectedGroups : groups;
  const currentIndex = matchdays.indexOf(activeMatchday);

  useEffect(() => {
    setSelectedGroups((current) => {
      const validGroups = current.filter((group) => groups.includes(group));
      return validGroups.length ? validGroups : groups;
    });
  }, [groups]);

  useEffect(() => {
    if (!matchdays.length) return;
    if (selectedMatchday !== null && !matchdays.includes(selectedMatchday)) {
      setSelectedMatchday(null);
    }
  }, [matchdays, selectedMatchday]);

  const visibleMatches = matches
    .filter(
      (match) =>
        competitionKey(match.competition) === competition &&
        match.matchday === activeMatchday &&
        safeSelectedGroups.includes(match.group_name || "Sin grupo"),
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

  function toggleGroup(group: string) {
    setSelectedGroups((current) =>
      current.includes(group) ? current.filter((value) => value !== group) : [...current, group],
    );
  }

  return (
    <section className="calendar-competition-section">
      <div className="section-title">
        <h2>{competition}</h2>
        <span>J{activeMatchday}</span>
      </div>

      <div className="calendar-section-controls">
        <div className="calendar-chip-group">
          {groups.map((group) => (
            <button
              className={safeSelectedGroups.includes(group) ? "is-active" : ""}
              key={group}
              onClick={() => toggleGroup(group)}
              type="button"
            >
              {group}
            </button>
          ))}
        </div>
        <label>
          Jornada
          <select
            onChange={(event) => setSelectedMatchday(Number(event.target.value))}
            value={activeMatchday}
          >
            {matchdays.map((matchday) => (
              <option key={matchday} value={matchday}>
                {matchday}
              </option>
            ))}
          </select>
        </label>
        <div className="calendar-nav-buttons">
          <button
            disabled={currentIndex <= 0}
            onClick={() => setSelectedMatchday(matchdays[currentIndex - 1])}
            type="button"
          >
            ←
          </button>
          <button
            disabled={currentIndex === -1 || currentIndex >= matchdays.length - 1}
            onClick={() => setSelectedMatchday(matchdays[currentIndex + 1])}
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
  const openPlayer =
    source === "general"
      ? (player: CalendarPlayer) => onOpenGeneralPlayer(player.playerName)
      : (player: CalendarPlayer) => onOpenCampogramPlayer(player.playerName, player.campogramPlayerId);

  return (
    <section className="content-card calendar-view">
      <div className="section-title">
        <h2>Planificación de partidos</h2>
        <span>{enrichedMatches.length} visibles</span>
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

      <CalendarOverviewCharts matches={enrichedMatches} />

      {COMPETITIONS.map((competition) => (
        <CompetitionCalendarSection
          competition={competition}
          key={competition}
          logoMap={logoMap}
          matches={enrichedMatches}
          onOpenPlayer={openPlayer}
        />
      ))}
    </section>
  );
}
