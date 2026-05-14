import { useEffect, useMemo, useState } from "react";
import type { CalendarMatch, ObjectivePlayer } from "../types";
import { RankingsSection, ScatterPlot } from "./ULabView";
import logo1RFEF from "../../../assets/Logos/1RFEF_Logo.png";
import logo2RFEF from "../../../assets/Logos/2RFEF_Logo.png";

type CompetitionFilter = "1RFEF" | "2RFEF";

const COMPETITION_CONFIG: Array<{
  value: CompetitionFilter;
  label: string;
  competitionName: string;
}> = [
  {
    value: "1RFEF",
    label: "1RFEF",
    competitionName: "Primera Division RFEF",
  },
  {
    value: "2RFEF",
    label: "2RFEF",
    competitionName: "Segunda Division RFEF",
  },
];

function normalizeTeamName(value: string | null | undefined) {
  return (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("es");
}

function competitionMatchesCompetitionName(matchCompetition: string | null | undefined, filter: CompetitionFilter) {
  const normalized = (matchCompetition || "").trim().toUpperCase();
  if (filter === "1RFEF") return normalized === "1RFEF";
  return normalized === "2RFEF";
}

function normalizeGroupLabel(groupName: string | null | undefined, competition: CompetitionFilter) {
  const raw = (groupName || "").trim();
  if (!raw) return "";
  const normalized = raw
    .replace(/^group\s*/i, "")
    .replace(/^grupo\s*/i, "")
    .trim()
    .toUpperCase();
  if (competition === "1RFEF") {
    return `Grupo ${normalized}`;
  }
  return `Grupo ${normalized.replace(/^0+/, "")}`;
}

export function RankingsView({
  objectivePlayers,
  matches,
}: {
  objectivePlayers: ObjectivePlayer[];
  matches: CalendarMatch[];
}) {
  const [competitionFilter, setCompetitionFilter] = useState<CompetitionFilter>("1RFEF");
  const [groupFilter, setGroupFilter] = useState("Todos");

  const activeCompetition = COMPETITION_CONFIG.find(
    (option) => option.value === competitionFilter,
  ) ?? COMPETITION_CONFIG[0];
  const competitionLogo = competitionFilter === "1RFEF" ? logo1RFEF : logo2RFEF;
  const competitionLogoAlt = competitionFilter === "1RFEF" ? "1RFEF" : "2RFEF";

  const teamToGroupMap = useMemo(() => {
    const mapping = new Map<string, string>();
    for (const match of matches) {
      if (!competitionMatchesCompetitionName(match.competition, competitionFilter)) continue;
      const groupLabel = normalizeGroupLabel(match.group_name, competitionFilter);
      if (!groupLabel) continue;

      const homeKey = normalizeTeamName(match.home_team_name);
      const awayKey = normalizeTeamName(match.away_team_name);
      if (homeKey && !mapping.has(homeKey)) mapping.set(homeKey, groupLabel);
      if (awayKey && !mapping.has(awayKey)) mapping.set(awayKey, groupLabel);
    }
    return mapping;
  }, [competitionFilter, matches]);

  const groupOptions = useMemo(() => {
    const groups = Array.from(new Set(teamToGroupMap.values())).sort((a, b) =>
      a.localeCompare(b, "es", { numeric: true }),
    );
    return ["Todos", ...groups];
  }, [teamToGroupMap]);

  const filteredPlayers = useMemo(
    () =>
      objectivePlayers.filter((player) => {
        if (player.domestic_competition_name !== activeCompetition.competitionName) return false;
        if (groupFilter === "Todos") return true;
        const playerGroup = teamToGroupMap.get(normalizeTeamName(player.current_team_name)) || "";
        return playerGroup === groupFilter;
      }),
    [activeCompetition.competitionName, groupFilter, objectivePlayers, teamToGroupMap],
  );

  useEffect(() => {
    if (!groupOptions.includes(groupFilter)) {
      setGroupFilter("Todos");
    }
  }, [groupFilter, groupOptions]);

  return (
    <section className="ulab-view">
      <div className="ulab-header">
        <div>
          <span className="profile-kicker">Rankings globales</span>
          <h2>Rankings</h2>
          <p>
            Explora los rankings y el scatter de todos los jugadores de la competición
            y grupo seleccionados, con la misma lógica visual que en ULab.
          </p>
        </div>
        <div className="ulab-header__badge">
          <img src={competitionLogo} alt={competitionLogoAlt} />
          <div>
            <strong>Competición</strong>
            <span>{activeCompetition.label}</span>
          </div>
        </div>
      </div>

      <div className="content-card rankings-view__filters-card">
        <div className="rankings-view__filters-head">
          <h2>Filtros</h2>
        </div>
        <div className="rankings-view__filters-grid">
          <label className="rankings-view__filter-field">
            <span>Competición</span>
            <select
              onChange={(event) => {
                setCompetitionFilter(event.target.value as CompetitionFilter);
                setGroupFilter("Todos");
              }}
              value={competitionFilter}
            >
              {COMPETITION_CONFIG.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="rankings-view__filter-field">
            <span>Grupo</span>
            <select onChange={(event) => setGroupFilter(event.target.value)} value={groupFilter}>
              {groupOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="rankings-view__filters-summary">
          <span>Jugadores cargados en la muestra</span>
          <strong>{filteredPlayers.length}</strong>
        </div>
      </div>

      {filteredPlayers.length === 0 ? (
        <div className="content-card">
          <div className="section-title">
            <h2>Sin jugadores disponibles</h2>
          </div>
          <p>
            No se han encontrado jugadores para {activeCompetition.label}
            {groupFilter !== "Todos" ? ` · ${groupFilter}` : ""} en la carga actual.
          </p>
        </div>
      ) : (
        <>
          <RankingsSection
            players={filteredPlayers}
            showClubContext
            title="Rankings de jugadores"
            updatedAt={filteredPlayers[0]?.updated_at ?? null}
            accentLogoSrc={competitionLogo}
            accentLogoAlt={competitionLogoAlt}
          />
          <ScatterPlot
            players={filteredPlayers}
            showPopulationFilters
            title="Dispersión de jugadores"
            emptyText="Selecciona las métricas para los ejes X e Y y visualiza la distribución de los jugadores de la categoría"
            ariaLabel="Scatter de jugadores"
            watermarkLogoSrc={competitionLogo}
            watermarkLogoAlt={competitionLogoAlt}
          />
        </>
      )}
    </section>
  );
}
