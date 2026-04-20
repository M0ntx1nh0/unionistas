"""Sincroniza calendario desde Google Sheets hacia Supabase.

Por defecto ejecuta una simulacion sin escribir datos. Para insertar/actualizar:

    .venv/bin/python scripts/sync_calendar_to_supabase.py --apply
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Any

import pandas as pd
from dotenv import load_dotenv
from supabase import create_client

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))

from src.scouting_app.calendar_data import (  # noqa: E402
    canonicalize_team_name,
    load_calendar_matches,
    load_team_name_map,
)


SEASON_LABEL = "2025/26"


def _clean_text(value: Any) -> str | None:
    if value is None:
        return None
    if pd.isna(value):
        return None
    text = str(value).strip()
    return text or None


def _clean_int(value: Any) -> int | None:
    if value is None or pd.isna(value):
        return None
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return None


def _clean_date(value: Any) -> str | None:
    if value is None or pd.isna(value):
        return None
    parsed = pd.to_datetime(value, errors="coerce")
    if pd.isna(parsed):
        return None
    return parsed.date().isoformat()


def _clean_time(value: Any) -> str | None:
    text = _clean_text(value)
    if not text:
        return None
    parsed = pd.to_datetime(text, format="%H:%M", errors="coerce")
    if pd.isna(parsed):
        return None
    return parsed.strftime("%H:%M:%S")


def _clean_timestamp(value: Any) -> str | None:
    if value is None or pd.isna(value):
        return None
    parsed = pd.to_datetime(value, errors="coerce")
    if pd.isna(parsed):
        return None
    return parsed.isoformat()


def _clean_bool(value: Any) -> bool:
    text = str(value or "").strip().lower()
    return text not in {"0", "false", "no", "n", "inactive"}


def _json_safe_dict(row: pd.Series) -> dict[str, Any]:
    payload: dict[str, Any] = {}
    for key, value in row.to_dict().items():
        if value is None or pd.isna(value):
            payload[str(key)] = None
        elif isinstance(value, pd.Timestamp):
            payload[str(key)] = value.isoformat()
        else:
            try:
                json.dumps(value)
                payload[str(key)] = value
            except TypeError:
                payload[str(key)] = str(value)
    return payload


def _get_supabase_client():
    load_dotenv(PROJECT_ROOT / ".env")
    supabase_url = os.getenv("SUPABASE_URL")
    service_role_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

    if not supabase_url:
        raise RuntimeError("Falta SUPABASE_URL en .env")
    if not service_role_key:
        raise RuntimeError("Falta SUPABASE_SERVICE_ROLE_KEY en .env")
    if service_role_key == "tu_service_role_key":
        raise RuntimeError("SUPABASE_SERVICE_ROLE_KEY sigue con el placeholder.")

    return create_client(supabase_url, service_role_key)


def _get_season_id(client) -> str:
    response = (
        client.table("seasons")
        .select("id,label")
        .eq("label", SEASON_LABEL)
        .limit(1)
        .execute()
    )
    rows = response.data or []
    if not rows:
        raise RuntimeError(f"No existe la temporada {SEASON_LABEL} en Supabase.")
    return str(rows[0]["id"])


def _match_payload(row: pd.Series, season_id: str) -> dict[str, Any]:
    home_team = _clean_text(row.get("home_team")) or "Sin local"
    away_team = _clean_text(row.get("away_team")) or "Sin visitante"
    return {
        "season_id": season_id,
        "competition": _clean_text(row.get("competition")) or "",
        "group_name": _clean_text(row.get("group")),
        "matchday": _clean_int(row.get("matchday")),
        "source_event_id": str(_clean_int(row.get("event_id")) or _clean_text(row.get("event_id")) or ""),
        "match_date": _clean_date(row.get("date")),
        "kickoff_time": _clean_time(row.get("kickoff_time")),
        "home_team_name": home_team,
        "away_team_name": away_team,
        "normalized_home_team_name": canonicalize_team_name(home_team),
        "normalized_away_team_name": canonicalize_team_name(away_team),
        "home_team_id": str(_clean_int(row.get("home_team_id")) or _clean_text(row.get("home_team_id")) or ""),
        "away_team_id": str(_clean_int(row.get("away_team_id")) or _clean_text(row.get("away_team_id")) or ""),
        "status": _clean_text(row.get("status")),
        "status_code": _clean_int(row.get("status_code")),
        "venue": _clean_text(row.get("venue")),
        "city": _clean_text(row.get("city")),
        "slug": _clean_text(row.get("slug")),
        "source_system": _clean_text(row.get("source")) or "sofascore",
        "source_updated_at": _clean_timestamp(row.get("updated_at")),
        "raw_data": _json_safe_dict(row),
    }


def _team_map_payload(row: pd.Series, season_id: str) -> dict[str, Any]:
    source_name = _clean_text(row.get("source_team_name")) or ""
    canonical_name = _clean_text(row.get("normalized_team_name")) or source_name
    return {
        "season_id": season_id,
        "source_team_name": source_name,
        "normalized_source_team_name": canonicalize_team_name(source_name),
        "canonical_team_name": canonical_name,
        "normalized_canonical_team_name": canonicalize_team_name(canonical_name),
        "competition": _clean_text(row.get("competition")),
        "group_name": _clean_text(row.get("group")),
        "source_system": _clean_text(row.get("source_system")) or "google_sheets",
        "notes": _clean_text(row.get("notes")),
        "active": _clean_bool(row.get("active")),
    }


def sync_calendar(apply: bool) -> None:
    calendar_df = load_calendar_matches()
    team_map_df = load_team_name_map()

    print("Resumen calendario")
    print(f"- Modo: {'ESCRITURA' if apply else 'SIMULACION'}")
    print(f"- Partidos detectados: {len(calendar_df)}")
    print(f"- Mapeos de equipo detectados: {len(team_map_df)}")

    if not apply:
        print("Simulacion completada. Ejecuta con --apply para escribir en Supabase.")
        return

    client = _get_supabase_client()
    season_id = _get_season_id(client)

    match_payloads = [
        _match_payload(row, season_id)
        for _, row in calendar_df.iterrows()
        if _clean_text(row.get("event_id"))
    ]
    if match_payloads:
        client.table("calendar_matches").upsert(
            match_payloads,
            on_conflict="season_id,source_system,source_event_id",
        ).execute()

    map_payloads = [
        _team_map_payload(row, season_id)
        for _, row in team_map_df.iterrows()
        if _clean_text(row.get("source_team_name"))
    ]
    if map_payloads:
        client.table("team_name_map").upsert(
            map_payloads,
            on_conflict="season_id,competition,source_system,normalized_source_team_name",
        ).execute()

    print("Sincronizacion completada")
    print(f"- Partidos sincronizados: {len(match_payloads)}")
    print(f"- Mapeos sincronizados: {len(map_payloads)}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Sincroniza calendario con Supabase.")
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Escribe los datos en Supabase. Sin este flag solo simula.",
    )
    args = parser.parse_args()
    sync_calendar(apply=args.apply)


if __name__ == "__main__":
    main()
