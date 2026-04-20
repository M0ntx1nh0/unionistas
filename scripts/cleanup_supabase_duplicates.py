"""Detecta y limpia duplicados historicos en Supabase.

Por defecto solo simula. Para borrar duplicados:

    .venv/bin/python scripts/cleanup_supabase_duplicates.py --apply

La limpieza conserva una fila canonica por duplicado logico y elimina copias
creadas por sincronizaciones antiguas dependientes del numero de fila en Sheets.
"""

from __future__ import annotations

import argparse
import os
import sys
from collections import defaultdict
from pathlib import Path
from typing import Any, Iterable

from dotenv import load_dotenv
from supabase import create_client

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))

from src.scouting_app.calendar_data import canonicalize_team_name  # noqa: E402


SEASON_LABEL = "2025/26"
PAGE_SIZE = 1000
DELETE_CHUNK_SIZE = 200


def _clean(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip()


def _norm(value: Any) -> str:
    return canonicalize_team_name(value)


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
    rows = (
        client.table("seasons")
        .select("id,label")
        .eq("label", SEASON_LABEL)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rows:
        raise RuntimeError(f"No existe la temporada {SEASON_LABEL} en Supabase.")
    return str(rows[0]["id"])


def _fetch_all(client, table: str, select: str, season_id: str | None = None) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    start = 0

    while True:
        query = client.table(table).select(select)
        if season_id:
            query = query.eq("season_id", season_id)
        response = query.range(start, start + PAGE_SIZE - 1).execute()
        batch = response.data or []
        rows.extend(batch)
        if len(batch) < PAGE_SIZE:
            break
        start += PAGE_SIZE

    return rows


def _chunked(values: list[str], size: int = DELETE_CHUNK_SIZE) -> Iterable[list[str]]:
    for index in range(0, len(values), size):
        yield values[index : index + size]


def _keeper_score(row: dict[str, Any]) -> tuple[int, str, str, str]:
    source_row_id = _clean(row.get("source_row_id"))
    has_stable_id = int(source_row_id.startswith(("player:", "report:")))
    return (
        has_stable_id,
        _clean(row.get("updated_at")),
        _clean(row.get("created_at")),
        _clean(row.get("id")),
    )


def _split_duplicate_groups(
    rows: list[dict[str, Any]],
    key_fields: tuple[str, ...],
) -> list[dict[str, Any]]:
    grouped: dict[tuple[Any, ...], list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        key = tuple(row.get(field) for field in key_fields)
        grouped[key].append(row)

    duplicate_groups = []
    for key, group_rows in grouped.items():
        if len(group_rows) < 2:
            continue
        sorted_rows = sorted(group_rows, key=_keeper_score, reverse=True)
        duplicate_groups.append(
            {
                "key": key,
                "keeper": sorted_rows[0],
                "duplicates": sorted_rows[1:],
            }
        )

    return duplicate_groups


def _general_report_key(row: dict[str, Any]) -> tuple[Any, ...]:
    return (
        row.get("season_id"),
        row.get("source_spreadsheet_id"),
        row.get("source_worksheet_name"),
        _norm(row.get("normalized_player_name") or row.get("player_name")),
        _norm(row.get("scout_name")),
        _clean(row.get("report_date")),
        _norm(row.get("normalized_team_name") or row.get("team_name")),
    )


def _campogram_player_key(row: dict[str, Any]) -> tuple[Any, ...]:
    identity_discriminator = row.get("birth_year")
    if identity_discriminator is None:
        identity_discriminator = _norm(row.get("normalized_team_name") or row.get("team_name"))
    return (
        row.get("season_id"),
        row.get("campogram_id"),
        _norm(row.get("normalized_player_name") or row.get("player_name")),
        identity_discriminator,
    )


def _campogram_report_key(row: dict[str, Any]) -> tuple[Any, ...]:
    return (
        row.get("season_id"),
        row.get("campogram_id"),
        _norm(row.get("normalized_player_name") or row.get("player_name")),
        _norm(row.get("scout_name")),
        _clean(row.get("report_date")),
        _norm(row.get("normalized_team_name") or row.get("team_name")),
    )


def _groups_from_custom_key(
    rows: list[dict[str, Any]],
    key_func,
) -> list[dict[str, Any]]:
    grouped: dict[tuple[Any, ...], list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        grouped[key_func(row)].append(row)

    groups = []
    for key, group_rows in grouped.items():
        if len(group_rows) < 2:
            continue
        sorted_rows = sorted(group_rows, key=_keeper_score, reverse=True)
        groups.append({"key": key, "keeper": sorted_rows[0], "duplicates": sorted_rows[1:]})
    return groups


def _describe_group(table: str, group: dict[str, Any]) -> str:
    keeper = group["keeper"]
    duplicates = group["duplicates"]
    player = keeper.get("player_name") or keeper.get("normalized_player_name") or "Sin jugador"
    scout = keeper.get("scout_name") or "-"
    report_date = keeper.get("report_date") or "-"
    campogram = keeper.get("campogram_name") or keeper.get("campogram_id") or "-"
    return (
        f"{table}: {player} | scout {scout} | fecha {report_date} | "
        f"campograma {campogram} | conservar {keeper.get('id')} | borrar {len(duplicates)}"
    )


def _delete_by_ids(client, table: str, ids: list[str]) -> None:
    for chunk in _chunked(ids):
        client.table(table).delete().in_("id", chunk).execute()


def cleanup_duplicates(apply: bool, sample_limit: int) -> None:
    client = _get_supabase_client()
    season_id = _get_season_id(client)

    scouting_reports = _fetch_all(
        client,
        "scouting_reports",
        (
            "id,season_id,player_name,normalized_player_name,scout_name,report_date,"
            "team_name,normalized_team_name,source_spreadsheet_id,source_worksheet_name,"
            "source_row_id,created_at,updated_at"
        ),
        season_id=season_id,
    )
    campogram_players = _fetch_all(
        client,
        "campogram_players",
        (
            "id,season_id,campogram_id,player_name,normalized_player_name,team_name,"
            "normalized_team_name,birth_year,source_row_id,created_at,updated_at"
        ),
        season_id=season_id,
    )
    campogram_reports = _fetch_all(
        client,
        "campogram_reports",
        (
            "id,season_id,campogram_id,campogram_player_id,player_name,normalized_player_name,"
            "scout_name,report_date,team_name,normalized_team_name,campogram_name,"
            "source_row_id,created_at,updated_at"
        ),
        season_id=season_id,
    )

    scouting_groups = _groups_from_custom_key(scouting_reports, _general_report_key)
    campogram_player_groups = _groups_from_custom_key(campogram_players, _campogram_player_key)
    campogram_report_groups = _groups_from_custom_key(campogram_reports, _campogram_report_key)

    scouting_delete_ids = [
        str(row["id"]) for group in scouting_groups for row in group["duplicates"]
    ]
    campogram_player_delete_ids = [
        str(row["id"]) for group in campogram_player_groups for row in group["duplicates"]
    ]
    campogram_report_delete_ids = [
        str(row["id"]) for group in campogram_report_groups for row in group["duplicates"]
    ]

    print("Resumen limpieza duplicados Supabase")
    print(f"- Modo: {'BORRADO' if apply else 'SIMULACION'}")
    print(f"- Temporada: {SEASON_LABEL}")
    print(f"- Informes generales leidos: {len(scouting_reports)}")
    print(f"- Jugadores campograma leidos: {len(campogram_players)}")
    print(f"- Informes campograma leidos: {len(campogram_reports)}")
    print("")
    print("- Duplicados logicos detectados:")
    print(f"  - scouting_reports: {len(scouting_groups)} grupos | {len(scouting_delete_ids)} filas a borrar")
    print(f"  - campogram_players: {len(campogram_player_groups)} grupos | {len(campogram_player_delete_ids)} filas a borrar")
    print(f"  - campogram_reports: {len(campogram_report_groups)} grupos | {len(campogram_report_delete_ids)} filas a borrar")

    sample_groups = (
        [("scouting_reports", group) for group in scouting_groups]
        + [("campogram_players", group) for group in campogram_player_groups]
        + [("campogram_reports", group) for group in campogram_report_groups]
    )
    if sample_groups:
        print("")
        print(f"- Muestras primeras {min(sample_limit, len(sample_groups))}:")
        for table, group in sample_groups[:sample_limit]:
            print(f"  - {_describe_group(table, group)}")

    if not apply:
        print("")
        print("Simulacion completada. Ejecuta con --apply para borrar duplicados.")
        return

    for group in campogram_player_groups:
        keeper_id = str(group["keeper"]["id"])
        duplicate_ids = [str(row["id"]) for row in group["duplicates"]]
        for chunk in _chunked(duplicate_ids):
            (
                client.table("campogram_reports")
                .update({"campogram_player_id": keeper_id})
                .in_("campogram_player_id", chunk)
                .execute()
            )

    _delete_by_ids(client, "scouting_reports", scouting_delete_ids)
    _delete_by_ids(client, "campogram_reports", campogram_report_delete_ids)
    _delete_by_ids(client, "campogram_players", campogram_player_delete_ids)

    print("")
    print("Limpieza completada")
    print(f"- Informes generales borrados: {len(scouting_delete_ids)}")
    print(f"- Informes campograma borrados: {len(campogram_report_delete_ids)}")
    print(f"- Jugadores campograma borrados: {len(campogram_player_delete_ids)}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Limpia duplicados historicos en Supabase.")
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Borra duplicados. Sin este flag solo simula.",
    )
    parser.add_argument(
        "--sample-limit",
        type=int,
        default=10,
        help="Numero de grupos duplicados de ejemplo que se imprimen.",
    )
    args = parser.parse_args()
    cleanup_duplicates(apply=args.apply, sample_limit=max(args.sample_limit, 0))


if __name__ == "__main__":
    main()
