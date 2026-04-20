import { useMemo, useState } from "react";
import type { CSSProperties } from "react";
import type { ScoutingReport, UserProfile } from "../types";
import { formatDate } from "../utils/format";

type ReportMode = "Todos" | "Solo repetidos";

const REPORT_COLUMNS = [
  "Jugador",
  "Nº informes",
  "Año",
  "Demarcación principal",
  "Demarcación secundaria",
  "Equipo",
  "Competición",
  "Ojeador",
  "Veredicto",
  "Fecha informe",
] as const;

function normalizeText(value: unknown) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLocaleLowerCase("es");
}

function rawText(report: ScoutingReport, key: string) {
  const value = report.raw_data?.[key];
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function firstText(report: ScoutingReport, keys: string[]) {
  for (const key of keys) {
    const value = rawText(report, key);
    if (value) return value;
  }
  return "";
}

function reportTimestamp(report: ScoutingReport) {
  const value = report.report_date ? new Date(report.report_date).getTime() : 0;
  return Number.isFinite(value) ? value : 0;
}

function reportYear(report: ScoutingReport) {
  const rawYear = report.birth_year || firstText(report, ["ano_nacimiento", "año_nacimiento"]);
  const year = Number(rawYear);
  return Number.isFinite(year) ? Math.trunc(year) : null;
}

function birthYearClass(year: number | null) {
  if (!year) return "";
  if (year === 2003) return "reports-age--2003";
  if (year >= 2004 && year <= 2006) return "reports-age--sub23";
  if (year >= 2007) return "reports-age--juvenile";
  return "";
}

function verdictClass(value: string | null | undefined) {
  const rawValue = value || "Sin valoración";
  if (rawValue === "A+") return "verdict-a-plus";
  const normalized = normalizeText(rawValue).replace(/[^a-z0-9]+/g, "-");
  return `verdict-${normalized || "sin-valoracion"}`;
}

function reportRow(report: ScoutingReport, reportCount: number) {
  return {
    Jugador: report.player_name || "Sin jugador",
    "Nº informes": reportCount,
    Año: reportYear(report),
    "Demarcación principal": report.position || "Sin posición",
    "Demarcación secundaria":
      report.secondary_position ||
      firstText(report, ["demarcacion_secundaria", "demarcacion_secundaria_lista"]) ||
      "-",
    Equipo: report.team_name || "Sin equipo",
    Competición: report.competition || "Sin competición",
    Ojeador: report.scout_name || "Sin scout",
    Veredicto: report.verdict || "Sin valoración",
    "Fecha informe": formatDate(report.report_date),
  };
}

export function ReportsView({
  profile,
  reports,
}: {
  profile?: UserProfile;
  reports: ScoutingReport[];
}) {
  const [search, setSearch] = useState("");
  const [scoutFilter, setScoutFilter] = useState("Todos");
  const [verdictFilter, setVerdictFilter] = useState("Todos");
  const [competitionFilter, setCompetitionFilter] = useState("Todas");
  const [mode, setMode] = useState<ReportMode>("Todos");

  const reportsByPlayer = useMemo(() => {
    const map = new Map<string, ScoutingReport[]>();
    for (const report of reports) {
      const key = normalizeText(report.player_name);
      if (!key) continue;
      map.set(key, [...(map.get(key) || []), report]);
    }
    return map;
  }, [reports]);

  const scouts = useMemo(
    () =>
      Array.from(new Set(reports.map((report) => report.scout_name || "Sin scout"))).sort((a, b) =>
        a.localeCompare(b, "es"),
      ),
    [reports],
  );
  const verdicts = useMemo(
    () =>
      Array.from(new Set(reports.map((report) => report.verdict || "Sin valoración"))).sort((a, b) =>
        a.localeCompare(b, "es"),
      ),
    [reports],
  );
  const competitions = useMemo(
    () =>
      Array.from(new Set(reports.map((report) => report.competition || "Sin competición"))).sort(
        (a, b) => a.localeCompare(b, "es"),
      ),
    [reports],
  );

  const repeatedPlayers = useMemo(
    () =>
      Array.from(reportsByPlayer.values())
        .filter((playerReports) => playerReports.length > 1)
        .map((playerReports) => {
          const latest = [...playerReports].sort((a, b) => reportTimestamp(b) - reportTimestamp(a))[0];
          return {
            count: playerReports.length,
            latest,
            playerName: latest.player_name,
            teamName: latest.team_name || "Sin equipo",
          };
        })
        .sort((a, b) => b.count - a.count || a.playerName.localeCompare(b.playerName, "es")),
    [reportsByPlayer],
  );

  const normalizedSearch = normalizeText(search);
  const filteredReports = useMemo(() => {
    return [...reports]
      .sort((a, b) => reportTimestamp(b) - reportTimestamp(a))
      .filter((report) => {
        const scout = report.scout_name || "Sin scout";
        const verdict = report.verdict || "Sin valoración";
        const competition = report.competition || "Sin competición";
        const reportCount = reportsByPlayer.get(normalizeText(report.player_name))?.length || 1;
        const haystack = [
          report.player_name,
          report.team_name || "",
          scout,
          competition,
          report.group_name || "",
          report.position || "",
          report.secondary_position || "",
          verdict,
          firstText(report, ["aspectos_positivos", "aspectos_negativos"]),
        ]
          .join(" ")
          .toLocaleLowerCase("es");

        return (
          (!normalizedSearch || normalizeText(haystack).includes(normalizedSearch)) &&
          (scoutFilter === "Todos" || scout === scoutFilter) &&
          (verdictFilter === "Todos" || verdict === verdictFilter) &&
          (competitionFilter === "Todas" || competition === competitionFilter) &&
          (mode === "Todos" || reportCount > 1)
        );
      });
  }, [competitionFilter, mode, normalizedSearch, reports, reportsByPlayer, scoutFilter, verdictFilter]);

  const uniquePlayers = reportsByPlayer.size;
  const latestReport = [...reports].sort((a, b) => reportTimestamp(b) - reportTimestamp(a))[0];
  const maxReportCount = Math.max(...Array.from(reportsByPlayer.values()).map((value) => value.length), 1);
  const isScoutScope = profile?.role === "scout";

  return (
    <>
      {isScoutScope ? (
        <div className="role-scope-note">
          <strong>Mis informes</strong>
          <span>
            Vista filtrada a los informes cargados por {profile.scout_name || profile.full_name || profile.email}.
          </span>
        </div>
      ) : null}

      <section className="mini-metrics-grid reports-metrics-grid">
        <article className="mini-metric">
          <span>Informes cargados</span>
          <strong>{reports.length}</strong>
        </article>
        <article className="mini-metric">
          <span>Jugadores únicos</span>
          <strong>{uniquePlayers}</strong>
        </article>
        <article className="mini-metric">
          <span>Jugadores +1 informe</span>
          <strong>{repeatedPlayers.length}</strong>
        </article>
        <article className="mini-metric">
          <span>Último informe</span>
          <strong>{latestReport ? formatDate(latestReport.report_date) : "-"}</strong>
        </article>
      </section>

      <section className="content-card">
        <div className="section-title">
          <h2>Seguimiento de carga Google Sheets</h2>
          <span>{filteredReports.length} visibles</span>
        </div>

        <div className="filter-panel filter-panel--reports">
          <label>
            Buscar informe
            <input
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Jugador, equipo, scout, posición..."
              type="search"
              value={search}
            />
          </label>
          <label>
            Scout
            <select onChange={(event) => setScoutFilter(event.target.value)} value={scoutFilter}>
              <option>Todos</option>
              {scouts.map((scout) => (
                <option key={scout}>{scout}</option>
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
            Vista
            <select onChange={(event) => setMode(event.target.value as ReportMode)} value={mode}>
              <option>Todos</option>
              <option>Solo repetidos</option>
            </select>
          </label>
        </div>

        <div className="reports-legend">
          <span><i className="reports-age--2003" /> 2003</span>
          <span><i className="reports-age--sub23" /> 2004-2006</span>
          <span><i className="reports-age--juvenile" /> 2007 o superior</span>
          <span><i className="reports-player-repeated" /> Jugador con más de un informe</span>
          <span><i className="reports-count-legend" /> Intensidad por nº de informes</span>
        </div>
      </section>

      <section className="content-card">
        <div className="section-title">
          <h2>Jugadores con más de un informe</h2>
          <span>{repeatedPlayers.length} detectados</span>
        </div>
        <div className="reports-repeated-scroll">
          <div className="reports-repeated-grid">
          {repeatedPlayers.map((player) => (
            <button
              className="reports-repeated-chip"
              key={`${player.playerName}-${player.teamName}`}
              onClick={() => {
                setSearch(player.playerName);
                setMode("Solo repetidos");
              }}
              type="button"
            >
              <strong>{player.playerName}</strong>
              <span>{player.teamName}</span>
              <em>{player.count} informes</em>
            </button>
          ))}
          </div>
        </div>
      </section>

      <section className="content-card">
        <div className="section-title">
          <h2>Base de informes</h2>
          <span>{filteredReports.length} filas</span>
        </div>

        <div className="reports-table-wrap">
          <table className="reports-table">
            <thead>
              <tr>
                {REPORT_COLUMNS.map((column) => (
                  <th key={column}>{column}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredReports.map((report) => {
                const count = reportsByPlayer.get(normalizeText(report.player_name))?.length || 1;
                const row = reportRow(report, count);
                const countLevel = count > 1 ? (count - 1) / Math.max(maxReportCount - 1, 1) : 0;
                return (
                  <tr key={report.id}>
                    {REPORT_COLUMNS.map((column) => {
                      if (column === "Jugador") {
                        return (
                          <td className={count > 1 ? "reports-table__repeated-player" : ""} key={column}>
                            {row[column]}
                          </td>
                        );
                      }
                      if (column === "Nº informes") {
                        return (
                          <td
                            className="reports-table__count"
                            key={column}
                            style={{ "--report-count-intensity": countLevel } as CSSProperties}
                          >
                            {row[column]}
                          </td>
                        );
                      }
                      if (column === "Año") {
                        return (
                          <td className={birthYearClass(row[column])} key={column}>
                            {row[column] || "-"}
                          </td>
                        );
                      }
                      if (column === "Veredicto") {
                        return (
                          <td key={column}>
                            <span className={`verdict-chip ${verdictClass(row[column])}`}>{row[column]}</span>
                          </td>
                        );
                      }
                      return <td key={column}>{row[column] || "-"}</td>;
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {!filteredReports.length ? (
          <div className="empty-state">No hay informes con esos filtros.</div>
        ) : null}
      </section>
    </>
  );
}
