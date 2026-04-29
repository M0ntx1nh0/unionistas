import { useCallback, useEffect, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { LoginView } from "./components/LoginView";
import { supabase } from "./lib/supabase";
import type {
  CalendarMatch,
  Campogram,
  CampogramPlayer,
  CampogramReport,
  DashboardCounts,
  ObjectivePlayer,
  ObjectivePlayerMatch,
  PlayerSummary,
  ScoutingReport,
  Season,
  UserProfile,
} from "./types";
import { CalendarView } from "./views/CalendarView";
import { CampogramsView } from "./views/CampogramsView";
import { DashboardView } from "./views/DashboardView";
import { PlayersView } from "./views/PlayersView";
import { ReportsView } from "./views/ReportsView";
import { VIEWS, type ViewName } from "./views/viewConfig";

type SyncTarget = "reports" | "campograms" | "calendar" | "wyscout" | "all";

const SESSION_CLOSE_TIMEOUT_MS = 2 * 60 * 1000;
const SESSION_LAST_ACTIVE_KEY = "unionistas:last-active-at";

const SYNC_TARGETS: Array<{ value: SyncTarget; label: string; hint: string }> = [
  {
    value: "reports",
    label: "Informes generales",
    hint: "Actualiza la hoja subjetiva general.",
  },
  {
    value: "campograms",
    label: "Campogramas",
    hint: "Actualiza jugadores e informes de campogramas.",
  },
  {
    value: "calendar",
    label: "Calendario",
    hint: "Actualiza partidos, horarios y cruces.",
  },
  {
    value: "wyscout",
    label: "Wyscout",
    hint: "Actualiza datos objetivos desde CSV.",
  },
  {
    value: "all",
    label: "Todo",
    hint: "Ejecuta todas las sincronizaciones.",
  },
];

function normalizeKey(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLocaleLowerCase("es");
}

function markSessionActivity() {
  window.localStorage.setItem(SESSION_LAST_ACTIVE_KEY, String(Date.now()));
}

function clearSessionActivity() {
  window.localStorage.removeItem(SESSION_LAST_ACTIVE_KEY);
}

function hasExpiredStoredSession() {
  const lastActiveAt = Number(window.localStorage.getItem(SESSION_LAST_ACTIVE_KEY) || "0");
  return lastActiveAt > 0 && Date.now() - lastActiveAt > SESSION_CLOSE_TIMEOUT_MS;
}

function reportBelongsToProfile(
  report: { scout_email?: string | null; scout_name: string | null },
  profile: UserProfile,
) {
  if (profile.role !== "scout") return true;

  const profileEmail = normalizeKey(profile.email || "");
  const profileScoutName = normalizeKey(profile.scout_name || "");
  const profileFullName = normalizeKey(profile.full_name || "");
  const reportEmail = normalizeKey(report.scout_email || "");
  const reportScoutName = normalizeKey(report.scout_name || "");

  return Boolean(
    (profileEmail && reportEmail === profileEmail) ||
      (profileScoutName && reportScoutName === profileScoutName) ||
      (profileFullName && reportScoutName === profileFullName),
  );
}

function scopeReportsForProfile<T extends { scout_email?: string | null; scout_name: string | null }>(
  reports: T[],
  profile: UserProfile,
) {
  if (profile.role !== "scout") return reports;
  return reports.filter((report) => reportBelongsToProfile(report, profile));
}

function buildPlayerSummaries(reports: ScoutingReport[]) {
  const playersByName = new Map<
    string,
    PlayerSummary & {
      scoutNames: Set<string>;
      latestTimestamp: number;
    }
  >();

  for (const report of reports) {
    const key = normalizeKey(report.player_name);
    const reportTimestamp = report.report_date ? new Date(report.report_date).getTime() : 0;
    const current = playersByName.get(key);

    if (!current) {
      playersByName.set(key, {
        player_name: report.player_name,
        team_name: report.team_name,
        competition: report.competition,
        position: report.position,
        verdict: report.verdict,
        report_date: report.report_date,
        reports_count: 1,
        scouts_count: report.scout_name ? 1 : 0,
        scoutNames: new Set(report.scout_name ? [report.scout_name] : []),
        latestTimestamp: reportTimestamp,
      });
      continue;
    }

    current.reports_count += 1;
    if (report.scout_name) {
      current.scoutNames.add(report.scout_name);
      current.scouts_count = current.scoutNames.size;
    }
    if (reportTimestamp >= current.latestTimestamp) {
      current.team_name = report.team_name;
      current.competition = report.competition;
      current.position = report.position;
      current.verdict = report.verdict;
      current.report_date = report.report_date;
      current.latestTimestamp = reportTimestamp;
    }
  }

  return Array.from(playersByName.values())
    .map(({ scoutNames: _scoutNames, latestTimestamp: _latestTimestamp, ...player }) => player)
    .sort((a, b) => a.player_name.localeCompare(b.player_name, "es"));
}

function AdminSyncPanel({ profile }: { profile: UserProfile }) {
  const [target, setTarget] = useState<SyncTarget>("reports");
  const [isLaunching, setIsLaunching] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "error"; text: string } | null>(null);

  if (profile.role !== "admin") {
    return null;
  }

  async function handleLaunchSync() {
    setIsLaunching(true);
    setMessage(null);

    const { error } = await supabase.functions.invoke("trigger-sync", {
      body: {
        target,
        dry_run: false,
      },
    });

    if (error) {
      setMessage({
        type: "error",
        text: `No se pudo lanzar la sincronizacion: ${error.message}`,
      });
      setIsLaunching(false);
      return;
    }

    const label = SYNC_TARGETS.find((option) => option.value === target)?.label || target;
    setMessage({
      type: "ok",
      text: `Sincronizacion lanzada para ${label}. GitHub Actions la ejecutara en segundo plano.`,
    });
    setIsLaunching(false);
  }

  const selectedTarget = SYNC_TARGETS.find((option) => option.value === target);

  return (
    <section className="admin-sync-panel" aria-label="Sincronizacion de datos">
      <div>
        <div className="admin-sync-panel__kicker">Solo admin</div>
        <h2>Actualizar datos</h2>
        <p>
          Lanza los scripts de sincronizacion en GitHub Actions. Puede tardar unos minutos en
          reflejarse en la app.
        </p>
      </div>
      <div className="admin-sync-panel__controls">
        <label>
          Fuente
          <select
            onChange={(event) => setTarget(event.target.value as SyncTarget)}
            value={target}
          >
            {SYNC_TARGETS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <button disabled={isLaunching} onClick={handleLaunchSync} type="button">
          {isLaunching ? "Lanzando..." : "Actualizar"}
        </button>
      </div>
      <div className="admin-sync-panel__hint">
        {selectedTarget?.hint}
        {message ? (
          <span
            className={
              message.type === "error"
                ? "admin-sync-panel__message is-error"
                : "admin-sync-panel__message"
            }
          >
            {message.text}
          </span>
        ) : null}
      </div>
    </section>
  );
}

async function fetchAllScoutingReports(seasonId: string) {
  const pageSize = 1000;
  const allReports: ScoutingReport[] = [];

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("scouting_reports")
      .select(
        "id,player_name,scout_name,scout_email,team_name,competition,group_name,position,verdict,birth_year,birth_place,nationality,foot,secondary_position,contract_until,agency,contract_status,matchday,watched_match,viewing_type,positive_aspects,negative_aspects,times_seen_same_scout,report_date,rating_technical,rating_physical,rating_psychological,comments,raw_data",
      )
      .eq("season_id", seasonId)
      .order("report_date", { ascending: false })
      .range(from, from + pageSize - 1);

    if (error) {
      return { data: [] as ScoutingReport[], error };
    }

    allReports.push(...((data || []) as ScoutingReport[]));

    if (!data || data.length < pageSize) {
      return { data: allReports, error: null };
    }
  }
}

async function fetchAllCalendarMatches(seasonId: string) {
  const pageSize = 1000;
  const allMatches: CalendarMatch[] = [];

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("calendar_matches")
      .select(
        "id,competition,group_name,matchday,match_date,kickoff_time,home_team_name,away_team_name,normalized_home_team_name,normalized_away_team_name,home_team_id,away_team_id,status,venue,city,slug",
      )
      .eq("season_id", seasonId)
      .order("match_date", { ascending: true })
      .order("kickoff_time", { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) {
      return { data: [] as CalendarMatch[], error };
    }

    allMatches.push(...((data || []) as CalendarMatch[]));

    if (!data || data.length < pageSize) {
      return { data: allMatches, error: null };
    }
  }
}

async function fetchAllObjectivePlayers(seasonId: string) {
  const pageSize = 1000;
  const allPlayers: ObjectivePlayer[] = [];

  try {
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await supabase
        .from("objective_players")
        .select(
          "id,objective_dataset,source_player_id,name,full_name,birth_year,birth_date,birth_country_name,passport_country_names,image,current_team_name,domestic_competition_name,current_team_logo,current_team_color,last_club_name,contract_expires,market_value,on_loan,positions,primary_position,primary_position_label,secondary_position,secondary_position_label,third_position,third_position_label,foot,height,weight,updated_at,metrics",
        )
        .eq("season_id", seasonId)
        .range(from, from + pageSize - 1);

      if (error) {
        return { data: [] as ObjectivePlayer[], error };
      }

      allPlayers.push(...((data || []) as ObjectivePlayer[]));

      if (!data || data.length < pageSize) {
        return { data: allPlayers, error: null };
      }
    }
  } catch (error) {
    return { data: [] as ObjectivePlayer[], error };
  }
}

async function fetchAllObjectiveMatches(seasonId: string) {
  const pageSize = 1000;
  const allMatches: ObjectivePlayerMatch[] = [];

  try {
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await supabase
        .from("objective_player_matches")
        .select(
          "id,objective_player_id,objective_dataset,scouting_player_name,normalized_scouting_player_name,objective_full_name,objective_birth_year,objective_team,objective_last_club,name_similarity,team_similarity,match_score,match_status",
        )
        .eq("season_id", seasonId)
        .neq("match_status", "sin_match")
        .range(from, from + pageSize - 1);

      if (error) {
        return { data: [] as ObjectivePlayerMatch[], error };
      }

      allMatches.push(...((data || []) as ObjectivePlayerMatch[]));

      if (!data || data.length < pageSize) {
        return { data: allMatches, error: null };
      }
    }
  } catch (error) {
    return { data: [] as ObjectivePlayerMatch[], error };
  }
}

async function fetchAllCampogramPlayers(seasonId: string) {
  const pageSize = 1000;
  const allPlayers: CampogramPlayer[] = [];

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("campogram_players")
      .select(
        "id,campogram_id,player_name,team_name,loaned,owner_team_name,category,birth_year,position,agent,foot,raw_data",
      )
      .eq("season_id", seasonId)
      .order("campogram_id", { ascending: true })
      .order("position", { ascending: true })
      .order("player_name", { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) {
      return { data: [] as CampogramPlayer[], error };
    }

    allPlayers.push(...((data || []) as CampogramPlayer[]));

    if (!data || data.length < pageSize) {
      return { data: allPlayers, error: null };
    }
  }
}

async function fetchAllCampogramReports(seasonId: string) {
  const pageSize = 1000;
  const allReports: CampogramReport[] = [];

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("campogram_reports")
      .select(
        "id,campogram_id,campogram_player_id,player_name,scout_name,scout_email,team_name,category,loaned,owner_team_name,campogram_name,position,verdict,technical_comment,physical_comment,psychological_comment,report_date,raw_data",
      )
      .eq("season_id", seasonId)
      .order("report_date", { ascending: false })
      .range(from, from + pageSize - 1);

    if (error) {
      return { data: [] as CampogramReport[], error };
    }

    allReports.push(...((data || []) as CampogramReport[]));

    if (!data || data.length < pageSize) {
      return { data: allReports, error: null };
    }
  }
}

function AppShell({
  session,
  profile,
  seasons,
  selectedSeasonId,
  setSelectedSeasonId,
  counts,
  matches,
  activeView,
  setActiveView,
  players,
  reports,
  campograms,
  campogramPlayers,
  campogramReports,
  objectivePlayers,
  objectiveMatches,
}: {
  session: Session;
  profile: UserProfile;
  seasons: Season[];
  selectedSeasonId: string;
  setSelectedSeasonId: (seasonId: string) => void;
  counts: DashboardCounts;
  matches: CalendarMatch[];
  activeView: ViewName;
  setActiveView: (view: ViewName) => void;
  players: PlayerSummary[];
  reports: ScoutingReport[];
  campograms: Campogram[];
  campogramPlayers: CampogramPlayer[];
  campogramReports: CampogramReport[];
  objectivePlayers: ObjectivePlayer[];
  objectiveMatches: ObjectivePlayerMatch[];
}) {
  const [focusedPlayerName, setFocusedPlayerName] = useState("");
  const [focusedCampogramPlayerName, setFocusedCampogramPlayerName] = useState("");
  const [focusedCampogramPlayerId, setFocusedCampogramPlayerId] = useState("");
  const scopedReports = scopeReportsForProfile(reports, profile);
  const scopedPlayers = profile.role === "scout" ? buildPlayerSummaries(scopedReports) : players;
  const scopedCampogramReports = scopeReportsForProfile(campogramReports, profile);
  const scopedPlayerNames = new Set(scopedReports.map((report) => normalizeKey(report.player_name)));
  const scopedObjectiveMatches =
    profile.role === "scout"
      ? objectiveMatches.filter(
          (match) =>
            match.scouting_player_name && scopedPlayerNames.has(normalizeKey(match.scouting_player_name)),
        )
      : objectiveMatches;

  async function handleSignOut() {
    clearSessionActivity();
    await supabase.auth.signOut();
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-block">
          <img alt="Unionistas de Salamanca" className="club-logo" src="/escudo/unionistar.png" />
          <div>
            <div className="brand-kicker">Unionistas Scouting Lab</div>
            <h1>{activeView}</h1>
          </div>
        </div>
        <div className="user-box">
          <span>{profile.full_name || session.user.email}</span>
          <small>{profile.role}</small>
          <button onClick={handleSignOut} type="button">
            Salir
          </button>
        </div>
      </header>

      <nav className="main-tabs" aria-label="Secciones principales">
        {VIEWS.map((view) => (
          <button
            className={activeView === view ? "is-active" : ""}
            key={view}
            onClick={() => setActiveView(view)}
            type="button"
          >
            {view}
          </button>
        ))}
      </nav>

      <section className="control-strip">
        <label>
          Temporada
          <select
            onChange={(event) => setSelectedSeasonId(event.target.value)}
            value={selectedSeasonId}
          >
            {seasons.map((season) => (
              <option key={season.id} value={season.id}>
                {season.label}
              </option>
            ))}
          </select>
        </label>
        <p>
          Primera versión React conectada a Supabase con RLS. Lo que ves aquí ya
          viene de la base nueva, no de Streamlit.
        </p>
      </section>

      <AdminSyncPanel profile={profile} />

      {activeView === "Dashboard" ? (
        <DashboardView profile={profile} reports={scopedReports} />
      ) : null}
      {activeView === "Jugadores" ? (
        <PlayersView
          focusPlayerName={focusedPlayerName}
          objectivePlayers={objectivePlayers}
          objectiveMatches={scopedObjectiveMatches}
          players={scopedPlayers}
          reports={scopedReports}
        />
      ) : null}
      {activeView === "Informes" ? <ReportsView profile={profile} reports={scopedReports} /> : null}
      {activeView === "Calendario" ? (
        <CalendarView
          accessibleReports={scopedReports}
          canOpenAllGeneralPlayers={profile.role !== "scout"}
          campogramPlayers={campogramPlayers}
          campogramReports={scopedCampogramReports}
          matches={matches}
          objectiveMatches={objectiveMatches}
          onOpenCampogramPlayer={(playerName, playerId) => {
            setFocusedCampogramPlayerName(playerName);
            setFocusedCampogramPlayerId(playerId || "");
            setActiveView("Campogramas");
          }}
          onOpenGeneralPlayer={(playerName) => {
            setFocusedPlayerName(playerName);
            setActiveView("Jugadores");
          }}
          reports={reports}
        />
      ) : null}
      {activeView === "Campogramas" ? (
        <CampogramsView
          campogramReports={scopedCampogramReports}
          campogramPlayers={campogramPlayers}
          campograms={campograms}
          focusPlayerId={focusedCampogramPlayerId}
          focusPlayerName={focusedCampogramPlayerName}
          objectiveMatches={objectiveMatches}
          objectivePlayers={objectivePlayers}
          profile={profile}
        />
      ) : null}
    </main>
  );
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  // Evita mostrar la pantalla de carga en refrescos silenciosos de token
  const hasBootstrappedRef = useRef(false);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [selectedSeasonId, setSelectedSeasonId] = useState("");
  const [counts, setCounts] = useState<DashboardCounts>({
    scoutingReports: 0,
    calendarMatches: 0,
    campogramPlayers: 0,
    campogramReports: 0,
  });
  const [matches, setMatches] = useState<CalendarMatch[]>([]);
  const [players, setPlayers] = useState<PlayerSummary[]>([]);
  const [reports, setReports] = useState<ScoutingReport[]>([]);
  const [campograms, setCampograms] = useState<Campogram[]>([]);
  const [campogramPlayers, setCampogramPlayers] = useState<CampogramPlayer[]>([]);
  const [campogramReports, setCampogramReports] = useState<CampogramReport[]>([]);
  const [objectivePlayers, setObjectivePlayers] = useState<ObjectivePlayer[]>([]);
  const [objectiveMatches, setObjectiveMatches] = useState<ObjectivePlayerMatch[]>([]);
  const [activeView, setActiveView] = useState<ViewName>(() => {
    try {
      const stored = sessionStorage.getItem("app:activeView");
      return (stored as ViewName) || "Dashboard";
    } catch {
      return "Dashboard";
    }
  });

  // Sincronizar activeView con sessionStorage al cambiar
  const handleSetActiveView = useCallback(
    (view: ViewName) => {
      try { sessionStorage.setItem("app:activeView", view); } catch { /* sin-op */ }
      setActiveView(view);
    },
    [],
  );
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;

    async function loadSession() {
      const { data } = await supabase.auth.getSession();
      if (data.session && hasExpiredStoredSession()) {
        await supabase.auth.signOut();
        if (!ignore) {
          clearSessionActivity();
          setSession(null);
          setIsLoading(false);
        }
        return;
      }
      if (data.session) {
        markSessionActivity();
      }
      if (!ignore) {
        setSession(data.session);
        setIsLoading(false);
      }
    }

    loadSession();
    const { data: listener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (nextSession) {
        markSessionActivity();
        // TOKEN_REFRESHED: solo actualizar el token, no resetear el perfil ni los datos
        setSession(nextSession);
      } else {
        // SIGNED_OUT: limpiar todo
        clearSessionActivity();
        setProfile(null);
        setSession(null);
      }
    });

    return () => {
      ignore = true;
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!session) return;

    markSessionActivity();
    const mark = () => markSessionActivity();
    const timer = window.setInterval(markSessionActivity, 30_000);
    window.addEventListener("focus", mark);
    window.addEventListener("pagehide", mark);
    window.addEventListener("beforeunload", mark);
    document.addEventListener("visibilitychange", mark);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", mark);
      window.removeEventListener("pagehide", mark);
      window.removeEventListener("beforeunload", mark);
      document.removeEventListener("visibilitychange", mark);
    };
  }, [session]);

  useEffect(() => {
    if (!session) return;

    let ignore = false;
    const currentSession = session;

    async function loadBootstrapData() {
      // Si ya cargamos una vez (refresco de token silencioso), no mostrar pantalla de carga
      const isFirstLoad = !hasBootstrappedRef.current;
      if (isFirstLoad) setIsLoading(true);
      setError(null);

      const [{ data: profileData, error: profileError }, { data: seasonData, error: seasonError }] =
        await Promise.all([
          supabase.from("profiles").select("*").eq("id", currentSession.user.id).single(),
          supabase.from("seasons").select("*").order("starts_on", { ascending: false }),
        ]);

      if (ignore) return;

      if (profileError) {
        setError(`No se pudo cargar el perfil: ${profileError.message}`);
        if (isFirstLoad) setIsLoading(false);
        return;
      }
      if (seasonError) {
        setError(`No se pudieron cargar temporadas: ${seasonError.message}`);
        if (isFirstLoad) setIsLoading(false);
        return;
      }

      hasBootstrappedRef.current = true;
      setProfile(profileData as UserProfile);
      setSeasons((seasonData || []) as Season[]);
      // Solo sobreescribir la temporada seleccionada en la primera carga
      if (isFirstLoad) setSelectedSeasonId((seasonData || [])[0]?.id || "");
      if (isFirstLoad) setIsLoading(false);
    }

    loadBootstrapData();

    return () => {
      ignore = true;
    };
  }, [session]);

  useEffect(() => {
    if (!selectedSeasonId) return;

    let ignore = false;

    async function loadSeasonData() {
      const [
        scoutingReports,
        calendarMatches,
        campogramPlayers,
        campogramReports,
        calendarRows,
        reportRows,
        objectiveRows,
        objectiveMatchRows,
        campogramRows,
        campogramPlayerRows,
        campogramReportRows,
      ] = await Promise.all([
        supabase
          .from("scouting_reports")
          .select("id", { count: "exact", head: true })
          .eq("season_id", selectedSeasonId),
        supabase
          .from("calendar_matches")
          .select("id", { count: "exact", head: true })
          .eq("season_id", selectedSeasonId),
        supabase
          .from("campogram_players")
          .select("id", { count: "exact", head: true })
          .eq("season_id", selectedSeasonId),
        supabase
          .from("campogram_reports")
          .select("id", { count: "exact", head: true })
          .eq("season_id", selectedSeasonId),
        fetchAllCalendarMatches(selectedSeasonId),
        fetchAllScoutingReports(selectedSeasonId),
        fetchAllObjectivePlayers(selectedSeasonId),
        fetchAllObjectiveMatches(selectedSeasonId),
        supabase
          .from("campograms")
          .select("id,name,display_order")
          .eq("season_id", selectedSeasonId)
          .order("display_order", { ascending: true }),
        fetchAllCampogramPlayers(selectedSeasonId),
        fetchAllCampogramReports(selectedSeasonId),
      ]);

      if (ignore) return;

      const firstError =
        scoutingReports.error ||
        calendarMatches.error ||
        campogramPlayers.error ||
        campogramReports.error ||
        calendarRows.error ||
        reportRows.error ||
        campogramRows.error ||
        campogramPlayerRows.error ||
        campogramReportRows.error;

      if (firstError) {
        setError(firstError.message);
        return;
      }

      if (objectiveRows.error || objectiveMatchRows.error) {
        console.warn(
          "Datos objetivos Wyscout no disponibles todavía.",
          objectiveRows.error || objectiveMatchRows.error,
        );
      }

      setCounts({
        scoutingReports: scoutingReports.count || 0,
        calendarMatches: calendarMatches.count || 0,
        campogramPlayers: campogramPlayers.count || 0,
        campogramReports: campogramReports.count || 0,
      });
      setMatches((calendarRows.data || []) as CalendarMatch[]);
      const fullReports = (reportRows.data || []) as ScoutingReport[];
      const objectivePlayersById = new Map(
        ((objectiveRows.error ? [] : objectiveRows.data || []) as ObjectivePlayer[]).map((player) => [
          player.id,
          player,
        ]),
      );
      const enrichedObjectiveMatches = ((objectiveMatchRows.error
        ? []
        : objectiveMatchRows.data || []) as ObjectivePlayerMatch[])
        .map((match) => ({
          ...match,
          objective_player: objectivePlayersById.get(match.objective_player_id),
        }))
        .filter((match) => match.objective_player);
      setObjectivePlayers((objectiveRows.error ? [] : objectiveRows.data || []) as ObjectivePlayer[]);
      setPlayers(buildPlayerSummaries(fullReports));
      setReports(fullReports);
      setObjectiveMatches(enrichedObjectiveMatches);
      setCampograms((campogramRows.data || []) as Campogram[]);
      setCampogramPlayers((campogramPlayerRows.data || []) as CampogramPlayer[]);
      setCampogramReports((campogramReportRows.data || []) as CampogramReport[]);
    }

    loadSeasonData();

    return () => {
      ignore = true;
    };
  }, [selectedSeasonId]);

  if (isLoading) {
    return <main className="loading-screen">Cargando Unionistas Scouting Lab...</main>;
  }

  if (!session) {
    return <LoginView />;
  }

  if (error) {
    return (
      <main className="loading-screen">
        <section className="error-card">
          <h1>No se pudo cargar la app</h1>
          <p>{error}</p>
          <button
            onClick={() => {
              clearSessionActivity();
              supabase.auth.signOut();
            }}
            type="button"
          >
            Salir
          </button>
        </section>
      </main>
    );
  }

  if (!profile || !seasons.length || !selectedSeasonId) {
    return <main className="loading-screen">Preparando datos...</main>;
  }

  return (
    <AppShell
      counts={counts}
      activeView={activeView}
      campogramPlayers={campogramPlayers}
      campogramReports={campogramReports}
      campograms={campograms}
      matches={matches}
      objectivePlayers={objectivePlayers}
      objectiveMatches={objectiveMatches}
      players={players}
      profile={profile}
      reports={reports}
      seasons={seasons}
      selectedSeasonId={selectedSeasonId}
      session={session}
      setActiveView={handleSetActiveView}
      setSelectedSeasonId={setSelectedSeasonId}
    />
  );
}
