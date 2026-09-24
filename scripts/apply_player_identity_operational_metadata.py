"""Registra enlaces de identidad y temporadas sin alterar datos de negocio.

Por defecto solo simula. Para aplicar:

    .venv/bin/python scripts/apply_player_identity_operational_metadata.py --apply
"""

from __future__ import annotations

import argparse
import os
from datetime import datetime
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from supabase import create_client


PROJECT_ROOT = Path(__file__).resolve().parents[1]
PAGE_SIZE = 1_000
WRITE_BATCH_SIZE = 500


def _get_client():
    load_dotenv(PROJECT_ROOT / ".env")
    supabase_url = os.getenv("SUPABASE_URL")
    service_role_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    if not supabase_url or not service_role_key:
        raise RuntimeError("Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env")
    if service_role_key == "tu_service_role_key":
        raise RuntimeError("SUPABASE_SERVICE_ROLE_KEY sigue con el placeholder.")
    return create_client(supabase_url, service_role_key)


def _fetch_all(client: Any, table: str, columns: str) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    offset = 0
    while True:
        page = (
            client.table(table)
            .select(columns)
            .range(offset, offset + PAGE_SIZE - 1)
            .execute()
            .data
            or []
        )
        rows.extend(page)
        if len(page) < PAGE_SIZE:
            return rows
        offset += PAGE_SIZE


def _business_snapshot(client: Any) -> dict[str, int]:
    reports = _fetch_all(client, "scouting_reports", "id,comments")
    return {
        "reports": len(reports),
        "reports_with_comments": sum(row.get("comments") is not None for row in reports),
        "comment_characters": sum(len(str(row.get("comments") or "")) for row in reports),
        "campogram_players": len(_fetch_all(client, "campogram_players", "id")),
        "pipeline_events": len(_fetch_all(client, "campogram_player_pipeline_events", "id")),
        "objective_players": len(_fetch_all(client, "objective_players", "id")),
        "objective_matches": len(_fetch_all(client, "objective_player_matches", "id")),
    }


def _upsert_batches(
    client: Any,
    table: str,
    rows: list[dict[str, Any]],
    on_conflict: str,
) -> None:
    for start in range(0, len(rows), WRITE_BATCH_SIZE):
        client.table(table).upsert(
            rows[start : start + WRITE_BATCH_SIZE],
            on_conflict=on_conflict,
            ignore_duplicates=True,
        ).execute()


def _identity_links(rows: list[dict[str, Any]], source_table: str) -> list[dict[str, Any]]:
    return [
        {
            "player_id": row["player_id"],
            "source_table": source_table,
            "source_record_id": row["id"],
            "match_method": "normalized_name_birth_year",
            "confidence": 1,
        }
        for row in rows
        if row.get("player_id")
    ]


def _timestamp_sort_value(value: Any) -> float:
    if not value:
        return float("-inf")
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00")).timestamp()
    except ValueError:
        return float("-inf")


def _season_rows(
    reports: list[dict[str, Any]],
    campogram_players: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    candidates: dict[tuple[str, str], tuple[int, float, dict[str, Any]]] = {}

    for row in reports:
        if not row.get("player_id") or not row.get("season_id"):
            continue
        payload = {
            "player_id": row["player_id"],
            "season_id": row["season_id"],
            "team_name": row.get("team_name"),
            "normalized_team_name": row.get("normalized_team_name"),
            "competition": row.get("competition"),
            "group_name": row.get("group_name"),
            "primary_position": row.get("position"),
            "secondary_position": row.get("secondary_position"),
            "agency": row.get("agency"),
            "loaned": None,
            "owner_team_name": None,
            "contract_until": row.get("contract_until"),
        }
        key = (str(row["player_id"]), str(row["season_id"]))
        candidate = (1, -_timestamp_sort_value(row.get("report_date")), payload)
        previous = candidates.get(key)
        if previous is None or candidate[:2] < previous[:2]:
            candidates[key] = candidate

    for row in campogram_players:
        if not row.get("player_id") or not row.get("season_id"):
            continue
        payload = {
            "player_id": row["player_id"],
            "season_id": row["season_id"],
            "team_name": row.get("team_name"),
            "normalized_team_name": row.get("normalized_team_name"),
            "competition": row.get("category"),
            "group_name": None,
            "primary_position": row.get("position"),
            "secondary_position": None,
            "agency": row.get("agent"),
            "loaned": row.get("loaned"),
            "owner_team_name": row.get("owner_team_name"),
            "contract_until": None,
        }
        key = (str(row["player_id"]), str(row["season_id"]))
        candidate = (2, -_timestamp_sort_value(row.get("updated_at")), payload)
        previous = candidates.get(key)
        if previous is None or candidate[:2] < previous[:2]:
            candidates[key] = candidate

    return [candidate[2] for candidate in candidates.values()]


def apply_metadata(apply: bool) -> None:
    client = _get_client()
    before = _business_snapshot(client)
    reports = _fetch_all(
        client,
        "scouting_reports",
        "id,player_id,season_id,team_name,normalized_team_name,competition,group_name,position,secondary_position,agency,contract_until,report_date",
    )
    campogram_players = _fetch_all(
        client,
        "campogram_players",
        "id,player_id,season_id,team_name,normalized_team_name,category,position,agent,loaned,owner_team_name,updated_at",
    )
    shortlist_players = _fetch_all(client, "uscout_shortlist_players", "id,player_id")
    board_slots = _fetch_all(client, "uscout_board_slots", "id,player_id")

    links = [
        *_identity_links(reports, "scouting_reports"),
        *_identity_links(campogram_players, "campogram_players"),
        *_identity_links(shortlist_players, "uscout_shortlist_players"),
        *_identity_links(board_slots, "uscout_board_slots"),
    ]
    seasons = _season_rows(reports, campogram_players)

    print("Metadatos de identidad operativa")
    print(f"- Modo: {'ESCRITURA' if apply else 'SIMULACION'}")
    print(f"- Enlaces auditables: {len(links)}")
    print(f"- Relaciones jugador-temporada: {len(seasons)}")

    if not apply:
        return

    _upsert_batches(client, "player_identity_links", links, "source_table,source_record_id")
    _upsert_batches(client, "player_seasons", seasons, "player_id,season_id")

    after = _business_snapshot(client)
    if before != after:
        raise RuntimeError(f"Las tablas de negocio cambiaron: antes={before}, despues={after}")

    stored_links = len(_fetch_all(client, "player_identity_links", "id"))
    stored_seasons = len(_fetch_all(client, "player_seasons", "id"))
    print("Aplicacion completada y validada")
    print(f"- Enlaces almacenados: {stored_links}")
    print(f"- Relaciones jugador-temporada almacenadas: {stored_seasons}")
    print("- Informes, comentarios, campogramas y Wyscout: sin cambios")


def main() -> None:
    parser = argparse.ArgumentParser(description="Registra metadatos de identidad operativa.")
    parser.add_argument("--apply", action="store_true", help="Escribe en las tablas auxiliares.")
    args = parser.parse_args()
    apply_metadata(apply=args.apply)


if __name__ == "__main__":
    main()
