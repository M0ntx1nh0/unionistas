import type { CalendarMatch } from "../types";
import { formatDate, formatTime } from "../utils/format";

export function CalendarPanel({ matches, title }: { matches: CalendarMatch[]; title: string }) {
  return (
    <section className="content-card">
      <div className="section-title">
        <h2>{title}</h2>
        <span>{matches.length} visibles</span>
      </div>
      <div className="match-list">
        {matches.length ? (
          matches.map((match) => (
            <article className="match-row" key={match.id}>
              <div className="match-date">
                <strong>{formatDate(match.match_date)}</strong>
                <span>{formatTime(match.kickoff_time)}</span>
              </div>
              <div className="match-teams">
                <strong>{match.home_team_name}</strong>
                <span>vs</span>
                <strong>{match.away_team_name}</strong>
              </div>
              <div className="match-meta">
                <span>{match.competition}</span>
                <span>{match.group_name || "Sin grupo"}</span>
                <span>J{match.matchday || "-"}</span>
              </div>
            </article>
          ))
        ) : (
          <div className="empty-state">No hay partidos disponibles para esta temporada.</div>
        )}
      </div>
    </section>
  );
}
