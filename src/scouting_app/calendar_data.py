from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
import re
import unicodedata
from typing import Any

import pandas as pd
import requests
import streamlit as st

from src.scouting_app.google_sheets import read_google_worksheet, write_google_worksheet


SOFASCORE_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json, text/plain, */*",
}

SOFASCORE_ROUNDS_URL = (
    "https://www.sofascore.com/api/v1/unique-tournament/"
    "{unique_tournament_id}/season/{season_id}/rounds"
)
SOFASCORE_ROUND_EVENTS_URL = (
    "https://www.sofascore.com/api/v1/unique-tournament/"
    "{unique_tournament_id}/season/{season_id}/events/round/{round_number}"
)

CALENDAR_MATCHES_COLUMNS = [
    "competition",
    "group",
    "matchday",
    "event_id",
    "date",
    "home_team",
    "away_team",
    "status",
    "status_code",
    "source",
    "updated_at",
    "venue",
    "city",
    "kickoff_time",
    "home_team_id",
    "away_team_id",
    "unique_tournament_id",
    "group_tournament_id",
    "season_id",
    "slug",
]

TEAM_NAME_MAP_COLUMNS = [
    "source_team_name",
    "normalized_team_name",
    "competition",
    "group",
    "source_system",
    "team_id",
    "notes",
    "active",
]

VERDICT_PRIORITY = {
    "Fichar": 0,
    "A+": 0,
    "A": 1,
    "Duda": 2,
    "B": 2,
    "Seguir viendo": 3,
    "C": 3,
    "Descartar": 4,
    "D": 4,
    "SV": 5,
    "NC": 6,
}

DEFAULT_TEAM_ALIASES = {
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
        "atletico sanluqueno": "atletico sanluqueno",
        "atletico sanluqueño": "atletico sanluqueno",
        "torremolinos": "juventud torremolinos",
        "juventud torremolinos": "juventud torremolinos",
        "juventud torremolinos cf": "juventud torremolinos",
    },
    "2RFEF": {
        "elche b": "elche illicitano",
        "elche ilicitano": "elche illicitano",
        "elche illicitano": "elche illicitano",
        "atletico malagueno": "atletico malagueno",
        "atletico malagueño": "atletico malagueno",
        "malagueno": "atletico malagueno",
        "malagueño": "atletico malagueno",
        "barca athletic": "barcelona atletic",
        "barca atletic": "barcelona atletic",
        "barça atlètic": "barcelona atletic",
        "barca atlètic": "barcelona atletic",
        "barcelona athletic": "barcelona atletic",
        "barcelona atletic": "barcelona atletic",
        "barcelona atlètic": "barcelona atletic",
        "deportivo fabril": "deportivo fabril",
        "deportivo de la coruna b": "deportivo fabril",
        "deportivo la coruna b": "deportivo fabril",
        "deportivo b": "deportivo fabril",
        "fabril": "deportivo fabril",
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
        "san sebastian de los reyes": "s s reyes",
        "ourense": "union deportiva ourense",
        "ud ourense": "union deportiva ourense",
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
        "recreativo de hugelva": "recreativo huelva",
        "puente genil": "salerm puente genil",
        "reus": "reus fcr",
        "reus fc reddis": "reus fcr",
        "resu fc reddis": "reus fcr",
        "reus fcr": "reus fcr",
        "socuellamos": "ud yugo socuellamos",
        "ud yugo socuellamos": "ud yugo socuellamos",
        "valladolid b": "real valladolid promesas",
        "valladolid promesas": "real valladolid promesas",
        "real valladolid b": "real valladolid promesas",
        "real valladolid promesas": "real valladolid promesas",
        "barbastro": "union deportiva barbastro",
        "union deportiva barbastro": "union deportiva barbastro",
        "porreres": "ue porreres",
        "antoniano": "club atletico antoniano",
        "marino": "marino de luanco",
        "marino luano": "marino de luanco",
        "marino luanco": "marino de luanco",
        "marino de luanco": "marino de luanco",
        "ucam": "ucam murcia",
        "ucam murcia": "ucam murcia",
    },
}


@dataclass(frozen=True)
class CompetitionConfig:
    key: str
    unique_tournament_id: int
    season_id: int
    label: str


SOFASCORE_COMPETITIONS = {
    "1RFEF": CompetitionConfig(
        key="1RFEF",
        unique_tournament_id=17073,
        season_id=77727,
        label="1RFEF",
    ),
    "2RFEF": CompetitionConfig(
        key="2RFEF",
        unique_tournament_id=544,
        season_id=77733,
        label="2RFEF",
    ),
}


def _get_calendar_sheet_config() -> dict[str, str]:
    if "calendar_sheet" not in st.secrets:
        raise KeyError("Falta la clave 'calendar_sheet' en .streamlit/secrets.toml.")

    config = dict(st.secrets["calendar_sheet"])
    required_keys = ["spreadsheet_id"]
    missing = [key for key in required_keys if not config.get(key)]
    if missing:
        raise KeyError(f"Faltan claves en calendar_sheet: {', '.join(missing)}")

    config.setdefault("matches_worksheet_name", "calendar_matches")
    config.setdefault("team_map_worksheet_name", "team_name_map")
    return config


def _normalize_dataframe_columns(df: pd.DataFrame) -> pd.DataFrame:
    if df.empty:
        return df
    normalized = df.copy()
    normalized.columns = [str(column).strip() for column in normalized.columns]
    return normalized


def _ensure_columns(df: pd.DataFrame, columns: list[str]) -> pd.DataFrame:
    normalized = _normalize_dataframe_columns(df)
    for column in columns:
        if column not in normalized.columns:
            normalized[column] = ""
    return normalized[columns].copy()


def load_calendar_matches() -> pd.DataFrame:
    config = _get_calendar_sheet_config()
    df = read_google_worksheet(
        config["spreadsheet_id"],
        config["matches_worksheet_name"],
    )
    df = _ensure_columns(df, CALENDAR_MATCHES_COLUMNS)
    if df.empty:
        return df

    for column in [
        "matchday",
        "event_id",
        "status_code",
        "home_team_id",
        "away_team_id",
        "unique_tournament_id",
        "group_tournament_id",
        "season_id",
    ]:
        df[column] = pd.to_numeric(df[column], errors="coerce")

    if "date" in df.columns:
        df["date"] = pd.to_datetime(df["date"], errors="coerce")

    return df.sort_values(
        by=["date", "competition", "group", "matchday"],
        ascending=[True, True, True, True],
        na_position="last",
    )


def load_team_name_map() -> pd.DataFrame:
    config = _get_calendar_sheet_config()
    df = read_google_worksheet(
        config["spreadsheet_id"],
        config["team_map_worksheet_name"],
    )
    df = _ensure_columns(df, TEAM_NAME_MAP_COLUMNS)
    if df.empty:
        return df
    return df


def _sheet_timestamp() -> str:
    return datetime.now(UTC).replace(microsecond=0).isoformat()


def _fetch_json(url: str) -> dict[str, Any]:
    response = requests.get(url, headers=SOFASCORE_HEADERS, timeout=25)
    response.raise_for_status()
    payload = response.json()
    return payload if isinstance(payload, dict) else {}


def _fetch_rounds(config: CompetitionConfig) -> tuple[list[int], int | None]:
    url = SOFASCORE_ROUNDS_URL.format(
        unique_tournament_id=config.unique_tournament_id,
        season_id=config.season_id,
    )
    payload = _fetch_json(url)
    rounds = [
        int(item["round"])
        for item in payload.get("rounds", [])
        if isinstance(item, dict) and item.get("round") is not None
    ]
    current_round = payload.get("currentRound", {}).get("round")
    return sorted(set(rounds)), int(current_round) if current_round is not None else None


def _parse_datetime_components(timestamp: Any) -> tuple[str, str]:
    if timestamp in (None, "", 0):
        return "", ""

    try:
        parsed = datetime.fromtimestamp(int(timestamp), tz=UTC).astimezone()
    except (TypeError, ValueError, OSError):
        return "", ""
    return parsed.strftime("%Y-%m-%d"), parsed.strftime("%H:%M")


def _normalize_round_events(
    events: list[dict[str, Any]],
    competition_label: str,
) -> pd.DataFrame:
    rows: list[dict[str, Any]] = []
    updated_at = _sheet_timestamp()
    for event in events:
        tournament = event.get("tournament", {}) or {}
        status = event.get("status", {}) or {}
        home = event.get("homeTeam", {}) or {}
        away = event.get("awayTeam", {}) or {}
        venue = event.get("venue", {}) or {}
        date_value, kickoff_value = _parse_datetime_components(event.get("startTimestamp"))
        city = ""
        if isinstance(venue.get("city"), dict):
            city = str(venue["city"].get("name") or "").strip()
        elif venue.get("city"):
            city = str(venue.get("city") or "").strip()

        rows.append(
            {
                "competition": competition_label,
                "group": tournament.get("groupName") or "",
                "matchday": (event.get("roundInfo") or {}).get("round") or "",
                "event_id": event.get("id") or "",
                "date": date_value,
                "home_team": home.get("name") or "",
                "away_team": away.get("name") or "",
                "status": status.get("type") or status.get("description") or "",
                "status_code": status.get("code") or "",
                "source": "sofascore",
                "updated_at": updated_at,
                "venue": venue.get("name") or "",
                "city": city,
                "kickoff_time": kickoff_value,
                "home_team_id": home.get("id") or "",
                "away_team_id": away.get("id") or "",
                "unique_tournament_id": (tournament.get("uniqueTournament") or {}).get("id") or "",
                "group_tournament_id": tournament.get("id") or "",
                "season_id": (event.get("season") or {}).get("id") or "",
                "slug": event.get("slug") or "",
            }
        )
    return pd.DataFrame(rows, columns=CALENDAR_MATCHES_COLUMNS)


def _fetch_round_matches(config: CompetitionConfig, round_number: int) -> pd.DataFrame:
    url = SOFASCORE_ROUND_EVENTS_URL.format(
        unique_tournament_id=config.unique_tournament_id,
        season_id=config.season_id,
        round_number=round_number,
    )
    payload = _fetch_json(url)
    return _normalize_round_events(payload.get("events", []), config.label)


def _to_int_set(series: pd.Series) -> set[int]:
    values = pd.to_numeric(series, errors="coerce").dropna().astype(int)
    return set(values.tolist())


def _determine_rounds_to_update(
    config: CompetitionConfig,
    existing_df: pd.DataFrame,
    all_rounds: list[int],
    current_round: int | None,
    full_refresh: bool,
) -> list[int]:
    competition_existing = existing_df[existing_df["competition"] == config.label].copy()
    if competition_existing.empty:
        return all_rounds

    if full_refresh or current_round is None:
        return all_rounds

    upcoming_window = {
        round_number
        for round_number in range(max(1, current_round - 2), current_round + 5)
        if round_number in all_rounds
    }

    pending_mask = (
        competition_existing["status_code"].fillna(0).astype(int) != 100
    ) | (
        competition_existing["kickoff_time"].fillna("").astype(str).str.strip() == ""
    ) | (
        competition_existing["date"].isna()
    )
    pending_rounds = _to_int_set(competition_existing.loc[pending_mask, "matchday"])
    rounds_to_update = sorted((upcoming_window | pending_rounds) & set(all_rounds))
    return rounds_to_update or all_rounds


def _merge_matches(existing_df: pd.DataFrame, refreshed_df: pd.DataFrame) -> pd.DataFrame:
    existing = _ensure_columns(existing_df, CALENDAR_MATCHES_COLUMNS)
    refreshed = _ensure_columns(refreshed_df, CALENDAR_MATCHES_COLUMNS)

    existing["event_id"] = pd.to_numeric(existing["event_id"], errors="coerce")
    refreshed["event_id"] = pd.to_numeric(refreshed["event_id"], errors="coerce")

    refreshed_ids = set(refreshed["event_id"].dropna().astype(int).tolist())
    if refreshed_ids:
        existing = existing[
            ~pd.to_numeric(existing["event_id"], errors="coerce").isin(refreshed_ids)
        ]

    merged = pd.concat([existing, refreshed], ignore_index=True)
    merged = _ensure_columns(merged, CALENDAR_MATCHES_COLUMNS)
    merged["event_id"] = pd.to_numeric(merged["event_id"], errors="coerce")
    merged = merged.drop_duplicates(subset=["event_id"], keep="last")
    merged["matchday"] = pd.to_numeric(merged["matchday"], errors="coerce")
    merged["date"] = pd.to_datetime(merged["date"], errors="coerce")
    merged["status_code"] = pd.to_numeric(merged["status_code"], errors="coerce")
    merged = merged.sort_values(
        by=["date", "competition", "group", "matchday"],
        ascending=[True, True, True, True],
        na_position="last",
    )
    merged["date"] = merged["date"].dt.strftime("%Y-%m-%d").fillna("")
    return _ensure_columns(merged, CALENDAR_MATCHES_COLUMNS)


def refresh_calendar_matches(full_refresh: bool = False) -> pd.DataFrame:
    existing_df = load_calendar_matches()
    refreshed_frames: list[pd.DataFrame] = []

    for config in SOFASCORE_COMPETITIONS.values():
        all_rounds, current_round = _fetch_rounds(config)
        if not all_rounds:
            continue

        rounds_to_update = _determine_rounds_to_update(
            config=config,
            existing_df=existing_df,
            all_rounds=all_rounds,
            current_round=current_round,
            full_refresh=full_refresh,
        )

        for round_number in rounds_to_update:
            refreshed_frames.append(_fetch_round_matches(config, round_number))

    refreshed_df = (
        pd.concat(refreshed_frames, ignore_index=True)
        if refreshed_frames
        else pd.DataFrame(columns=CALENDAR_MATCHES_COLUMNS)
    )
    merged_df = _merge_matches(existing_df, refreshed_df)
    config = _get_calendar_sheet_config()
    write_google_worksheet(
        config["spreadsheet_id"],
        config["matches_worksheet_name"],
        merged_df,
    )
    return load_calendar_matches()


def _strip_accents(value: Any) -> str:
    text = str(value or "").strip().lower()
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    return text


def _canonicalize_team_name(value: Any) -> str:
    text = _strip_accents(value)
    text = text.replace(".", " ")
    text = text.replace("-", " ")
    pre_normalized = re.sub(r"[^a-z0-9\s]", " ", text)
    pre_normalized = re.sub(r"\s+", " ", pre_normalized).strip()
    special_cases = {
        "xerez deportivo": "xerez deportivo",
        "xerez deportivo fc": "xerez deportivo",
    }
    if pre_normalized in special_cases:
        return special_cases[pre_normalized]
    text = re.sub(r"\bu\s*21\b", " ", text)
    text = re.sub(r"\bb\b", " b ", text)
    text = re.sub(r"\bclub de futbol\b", " ", text)
    text = re.sub(r"\bclub futbol\b", " ", text)
    text = re.sub(r"\bclub\b", " ", text)
    text = re.sub(r"\bdeportivo\b", " ", text)
    text = re.sub(r"\bcf\b|\bfc\b|\bcd\b|\bud\b|\bsd\b|\brc\b|\bad\b", " ", text)
    text = re.sub(r"[^a-z0-9\s]", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def _normalize_player_name(value: Any) -> str:
    return _canonicalize_team_name(value)


def canonicalize_team_name(value: Any) -> str:
    return _canonicalize_team_name(value)


def _competition_family(value: Any) -> str:
    text = _strip_accents(value)
    normalized = " ".join(text.split())
    if (
        "1rfe" in normalized
        or "1a rfef" in normalized
        or "primera" in normalized
        or "first division rfef" in normalized
    ):
        return "1RFEF"
    if (
        "2rfe" in normalized
        or "2a rfef" in normalized
        or "segunda" in normalized
        or "second division rfef" in normalized
    ):
        return "2RFEF"
    return str(value or "").strip()


def competition_family(value: Any) -> str:
    return _competition_family(value)


def build_team_mapping(team_map_df: pd.DataFrame | None = None) -> dict[tuple[str, str], str]:
    if team_map_df is None:
        team_map_df = pd.DataFrame(columns=TEAM_NAME_MAP_COLUMNS)
    return _build_team_mapping(team_map_df)


def resolve_team_key(
    team_name: Any,
    competition: Any,
    team_map_df: pd.DataFrame | None = None,
) -> str:
    return _apply_team_mapping(
        team_name=team_name,
        competition=competition,
        team_map=_build_team_mapping(team_map_df if team_map_df is not None else pd.DataFrame(columns=TEAM_NAME_MAP_COLUMNS)),
    )


def _is_active_mapping(value: Any) -> bool:
    normalized = _strip_accents(value)
    return normalized not in {"0", "false", "no", "n", "inactive"}


def _calendar_consensus_label(value: Any) -> str:
    text = str(value or "").strip()
    normalized = _strip_accents(text)
    if normalized in {"seguir valorando", "sv"}:
        return "SV"
    if normalized == "fichar":
        return "Fichar"
    if normalized == "duda":
        return "Duda"
    if normalized == "seguir viendo":
        return "Seguir viendo"
    if normalized == "descartar":
        return "Descartar"
    if normalized in {"sin consenso", "nc"}:
        return "NC"
    if text in {"A+", "A", "B", "C", "D"}:
        return text
    return "NC"


def _build_player_consensus_map(scouting_df: pd.DataFrame) -> dict[str, str]:
    if scouting_df.empty or "nombre_jugador" not in scouting_df.columns or "veredicto" not in scouting_df.columns:
        return {}

    consensus_map: dict[str, str] = {}
    grouped = scouting_df.dropna(subset=["nombre_jugador"]).groupby("nombre_jugador")
    for player_name, player_df in grouped:
        verdict_counts = (
            player_df["veredicto"]
            .dropna()
            .astype(str)
            .str.strip()
            .value_counts()
        )
        if verdict_counts.empty:
            consensus = "NC"
        else:
            highest_count = int(verdict_counts.iloc[0])
            top_verdicts = verdict_counts[verdict_counts == highest_count].index.tolist()
            if len(top_verdicts) == 1:
                consensus = _calendar_consensus_label(top_verdicts[0])
            else:
                consensus = "NC"
        consensus_map[_normalize_player_name(player_name)] = consensus
    return consensus_map


def _decorate_players(players: list[str], consensus_map: dict[str, str]) -> tuple[list[str], list[str]]:
    decorated_rows: list[tuple[int, str, str]] = []
    for player in players:
        consensus = consensus_map.get(_normalize_player_name(player), "NC")
        display = f"{player} ({consensus})"
        decorated_rows.append((VERDICT_PRIORITY.get(consensus, 99), player.lower(), display))
    decorated_rows.sort(key=lambda item: (item[0], item[1]))
    sorted_players = [item[2] for item in decorated_rows]
    return sorted_players, [item[2] for item in decorated_rows]


def _build_team_mapping(team_map_df: pd.DataFrame) -> dict[tuple[str, str], str]:
    mapping: dict[tuple[str, str], str] = {}
    for competition, aliases in DEFAULT_TEAM_ALIASES.items():
        for source_name, normalized_target in aliases.items():
            mapping[(competition, _canonicalize_team_name(source_name))] = _canonicalize_team_name(
                normalized_target
            )

    if team_map_df.empty:
        return mapping

    normalized_map = _ensure_columns(team_map_df, TEAM_NAME_MAP_COLUMNS)
    for _, row in normalized_map.iterrows():
        if not _is_active_mapping(row.get("active")):
            continue
        source_name = str(row.get("source_team_name") or "").strip()
        target_name = str(row.get("normalized_team_name") or "").strip()
        competition = _competition_family(row.get("competition"))
        if not source_name or not target_name:
            continue
        mapping[(competition, _canonicalize_team_name(source_name))] = _canonicalize_team_name(
            target_name
        )
    return mapping


def _apply_team_mapping(
    team_name: Any,
    competition: Any,
    team_map: dict[tuple[str, str], str],
) -> str:
    canonical = _canonicalize_team_name(team_name)
    competition_key = _competition_family(competition)
    mapped = team_map.get((competition_key, canonical))
    if mapped:
        return mapped
    return canonical


def build_calendar_interest(
    scouting_df: pd.DataFrame,
    calendar_df: pd.DataFrame,
    team_map_df: pd.DataFrame,
) -> pd.DataFrame:
    calendar = load_calendar_matches() if calendar_df is None else calendar_df.copy()
    if calendar.empty or scouting_df.empty:
        empty = calendar.copy()
        empty["players_in_db"] = 0
        empty["players_detected"] = ""
        empty["home_players_in_db"] = 0
        empty["away_players_in_db"] = 0
        empty["home_players_detected"] = ""
        empty["away_players_detected"] = ""
        empty["interesting_match"] = False
        return empty

    scouting = scouting_df.copy()
    if "marca_temporal" in scouting.columns:
        scouting = scouting.sort_values("marca_temporal", ascending=False, na_position="last")
    scouting = scouting.dropna(subset=["nombre_jugador", "equipo", "competicion"])
    consensus_map = _build_player_consensus_map(scouting_df)

    team_map = _build_team_mapping(team_map_df)
    scouting["competition_family"] = scouting["competicion"].apply(_competition_family)
    scouting["team_key"] = scouting.apply(
        lambda row: _apply_team_mapping(row.get("equipo"), row.get("competicion"), team_map),
        axis=1,
    )
    scouting = scouting.drop_duplicates(
        subset=["nombre_jugador", "competition_family", "team_key"],
        keep="first",
    )

    grouped_players = (
        scouting.groupby(["competition_family", "team_key"])["nombre_jugador"]
        .apply(lambda values: sorted({str(value).strip() for value in values if str(value).strip()}))
        .to_dict()
    )

    calendar["competition_family"] = calendar["competition"].apply(_competition_family)
    calendar["home_team_key"] = calendar.apply(
        lambda row: _apply_team_mapping(row.get("home_team"), row.get("competition"), team_map),
        axis=1,
    )
    calendar["away_team_key"] = calendar.apply(
        lambda row: _apply_team_mapping(row.get("away_team"), row.get("competition"), team_map),
        axis=1,
    )

    players_counts: list[int] = []
    players_labels: list[str] = []
    home_players_counts: list[int] = []
    away_players_counts: list[int] = []
    home_players_labels: list[str] = []
    away_players_labels: list[str] = []
    for _, row in calendar.iterrows():
        competition_key = row["competition_family"]
        home_players = grouped_players.get((competition_key, row["home_team_key"]), [])
        away_players = grouped_players.get((competition_key, row["away_team_key"]), [])
        unique_home_players = sorted(set(home_players))
        unique_away_players = sorted(set(away_players))
        decorated_home_players, _ = _decorate_players(unique_home_players, consensus_map)
        decorated_away_players, _ = _decorate_players(unique_away_players, consensus_map)
        all_players = sorted(set(home_players + away_players))
        decorated_all_players, _ = _decorate_players(all_players, consensus_map)
        home_players_counts.append(len(unique_home_players))
        away_players_counts.append(len(unique_away_players))
        home_players_labels.append(" | ".join(decorated_home_players))
        away_players_labels.append(" | ".join(decorated_away_players))
        players_counts.append(len(all_players))
        players_labels.append(" | ".join(decorated_all_players))

    calendar["home_players_in_db"] = home_players_counts
    calendar["away_players_in_db"] = away_players_counts
    calendar["home_players_detected"] = home_players_labels
    calendar["away_players_detected"] = away_players_labels
    calendar["players_in_db"] = players_counts
    calendar["players_detected"] = players_labels
    calendar["interesting_match"] = calendar["players_in_db"] > 0
    return calendar.sort_values(
        by=["players_in_db", "date", "competition", "group"],
        ascending=[False, True, True, True],
        na_position="last",
    )
