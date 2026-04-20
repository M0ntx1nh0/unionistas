"""Sincroniza campogramas desde Google Sheets hacia Supabase.

Por defecto ejecuta una simulacion sin escribir datos. Para insertar/actualizar:

    .venv/bin/python scripts/sync_campograms_to_supabase.py --apply
"""

from __future__ import annotations

import argparse
import hashlib
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

from src.scouting_app.campogram_data import (
    CAMPOGRAM_DISPLAY_ORDER,
    build_campogram_dataset,
    get_campogram_ordered_names,
    _get_campogram_sheet_config,
    _normalize_lookup_key,
)


SEASON_LABEL = "2025/26"


def _clean_text(value: Any) -> str | None:
    if value is None:
        return None
    if pd.isna(value):
        return None
    text = str(value).strip()
    return text or None


def _clean_bool(value: Any) -> bool | None:
    text = _normalize_lookup_key(value)
    if not text:
        return None
    if text in {"si", "s", "yes", "true", "1"}:
        return True
    if text in {"no", "n", "false", "0"}:
        return False
    return None


def _clean_int(value: Any) -> int | None:
    if value is None or pd.isna(value):
        return None
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return None


def _clean_timestamp(value: Any) -> str | None:
    if value is None or pd.isna(value):
        return None
    timestamp = pd.to_datetime(value, errors="coerce")
    if pd.isna(timestamp):
        return None
    return timestamp.isoformat()


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


def _stable_source_row_id(prefix: str, *parts: Any) -> str:
    """Genera un identificador estable aunque se muevan filas en Google Sheets."""
    normalized_parts = [_normalize_lookup_key(part) for part in parts]
    digest = hashlib.sha1("||".join(normalized_parts).encode("utf-8")).hexdigest()
    return f"{prefix}:{digest}"


def _dedupe_payloads(
    payloads: list[dict[str, Any]],
    key_field: str = "source_row_id",
) -> tuple[list[dict[str, Any]], int]:
    """Evita enviar dos veces el mismo registro en un mismo upsert."""
    seen: set[Any] = set()
    deduped: list[dict[str, Any]] = []

    for payload in payloads:
        key = payload.get(key_field)
        if key in seen:
            continue
        seen.add(key)
        deduped.append(payload)

    return deduped, len(payloads) - len(deduped)


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


def _upsert_campograms(client, season_id: str, campogram_names: list[str], apply: bool) -> dict[str, str]:
    campogram_ids: dict[str, str] = {}

    for index, name in enumerate(campogram_names):
        normalized_name = _normalize_lookup_key(name)
        existing = (
            client.table("campograms")
            .select("id")
            .eq("season_id", season_id)
            .eq("normalized_name", normalized_name)
            .limit(1)
            .execute()
            .data
            or []
        )
        if existing:
            campogram_ids[name] = str(existing[0]["id"])
            continue

        if not apply:
            campogram_ids[name] = f"dry-run-{normalized_name}"
            continue

        payload = {
            "season_id": season_id,
            "name": name,
            "normalized_name": normalized_name,
            "display_order": CAMPOGRAM_DISPLAY_ORDER.index(name) if name in CAMPOGRAM_DISPLAY_ORDER else index,
            "active": True,
        }
        inserted = client.table("campograms").insert(payload).execute().data or []
        if not inserted:
            raise RuntimeError(f"No se pudo insertar el campograma {name}.")
        campogram_ids[name] = str(inserted[0]["id"])

    return campogram_ids


def _player_payload(
    row: pd.Series,
    season_id: str,
    campogram_id: str,
    source_config: dict[str, str],
) -> dict[str, Any]:
    player_name = _clean_text(row.get("jugador")) or "Sin nombre"
    normalized_player_name = _clean_text(row.get("jugador_normalizado")) or _normalize_lookup_key(player_name)
    team_name = _clean_text(row.get("equipo_actual"))
    normalized_team_name = _clean_text(row.get("equipo_actual_normalizado")) or _normalize_lookup_key(team_name)
    position = _clean_text(row.get("posicion_canonica"))
    birth_year = _clean_int(row.get("ano_nacimiento"))
    identity_discriminator = birth_year if birth_year is not None else normalized_team_name
    source_row_id = _stable_source_row_id(
        "player",
        season_id,
        campogram_id,
        normalized_player_name,
        identity_discriminator,
    )

    return {
        "season_id": season_id,
        "campogram_id": campogram_id,
        "player_name": player_name,
        "normalized_player_name": normalized_player_name,
        "team_name": team_name,
        "normalized_team_name": normalized_team_name,
        "loaned": _clean_bool(row.get("cedido")),
        "owner_team_name": _clean_text(row.get("equipo_propietario")),
        "normalized_owner_team_name": _normalize_lookup_key(row.get("equipo_propietario")),
        "category": _clean_text(row.get("categoria")),
        "birth_year": birth_year,
        "position": position,
        "agent": _clean_text(row.get("agente")),
        "foot": _clean_text(row.get("lateralidad")),
        "source_spreadsheet_id": source_config.get("spreadsheet_id"),
        "source_worksheet_name": source_config.get("base_data_worksheet_name"),
        "source_row_id": source_row_id,
        "raw_data": _json_safe_dict(row),
    }


def _report_payload(
    row: pd.Series,
    season_id: str,
    campogram_id: str | None,
    campogram_player_id: str | None,
    source_config: dict[str, str],
    row_index: int,
) -> dict[str, Any]:
    player_name = _clean_text(row.get("jugador")) or "Sin nombre"
    normalized_player_name = _clean_text(row.get("jugador_normalizado")) or _normalize_lookup_key(player_name)
    scout_name = _clean_text(row.get("scout"))
    report_date = _clean_timestamp(row.get("marca_temporal"))
    team_name = _clean_text(row.get("equipo"))
    normalized_team_name = _clean_text(row.get("equipo_normalizado")) or _normalize_lookup_key(team_name)
    position = _clean_text(row.get("posicion_canonica"))
    verdict = _clean_text(row.get("valoracion_canonica"))
    technical_comment = _clean_text(row.get("comentario_tecnico"))
    physical_comment = _clean_text(row.get("comentario_fisico"))
    psychological_comment = _clean_text(row.get("comentario_psicologico"))
    source_row_id = _stable_source_row_id(
        "report",
        season_id,
        campogram_id,
        normalized_player_name,
        scout_name,
        report_date,
        normalized_team_name,
    )
    raw_data = _json_safe_dict(row)
    raw_data["google_player_row_id"] = _clean_text(row.get("player_row_id"))
    raw_data["google_response_row_index"] = row_index

    return {
        "season_id": season_id,
        "campogram_id": campogram_id,
        "campogram_player_id": campogram_player_id,
        "player_name": player_name,
        "normalized_player_name": normalized_player_name,
        "scout_name": scout_name,
        "report_date": report_date,
        "team_name": team_name,
        "normalized_team_name": normalized_team_name,
        "category": _clean_text(row.get("categoria")),
        "loaned": _clean_bool(row.get("cedido")),
        "owner_team_name": _clean_text(row.get("equipo_propietario")),
        "campogram_name": _clean_text(row.get("campograma_canonico")),
        "normalized_campogram_name": _normalize_lookup_key(row.get("campograma_canonico")),
        "position": position,
        "verdict": verdict,
        "technical_comment": technical_comment,
        "physical_comment": physical_comment,
        "psychological_comment": psychological_comment,
        "source_spreadsheet_id": source_config.get("spreadsheet_id"),
        "source_worksheet_name": source_config.get("responses_worksheet_name"),
        "source_row_id": source_row_id,
        "raw_data": raw_data,
    }


def sync_campograms(apply: bool) -> None:
    dataset = build_campogram_dataset()
    players_df = dataset.players
    reports_df = dataset.reports

    if players_df.empty:
        print("No hay jugadores de campograma para sincronizar.")
        return

    campogram_names = get_campogram_ordered_names(players_df)
    source_config = _get_campogram_sheet_config()

    print("Resumen campogramas")
    print(f"- Modo: {'ESCRITURA' if apply else 'SIMULACION'}")
    print(f"- Campogramas detectados: {len(campogram_names)}")
    print(f"- Jugadores detectados: {len(players_df)}")
    print(f"- Informes enlazados: {len(reports_df)}")

    if not apply:
        print("Simulacion completada. Ejecuta con --apply para escribir en Supabase.")
        return

    client = _get_supabase_client()
    season_id = _get_season_id(client)
    campogram_ids = _upsert_campograms(client, season_id, campogram_names, apply=True)

    player_id_by_source_row: dict[str, str] = {}
    player_source_row_by_google_row: dict[str, str] = {}
    player_payloads = []
    for _, row in players_df.iterrows():
        campogram_name = _clean_text(row.get("campograma_canonico")) or ""
        campogram_id = campogram_ids.get(campogram_name)
        if not campogram_id:
            continue
        payload = _player_payload(row, season_id, campogram_id, source_config)
        google_row_id = _clean_text(row.get("player_row_id")) or ""
        if google_row_id:
            player_source_row_by_google_row[google_row_id] = str(payload["source_row_id"])
        player_payloads.append(payload)

    player_payloads, duplicate_players = _dedupe_payloads(player_payloads)
    if duplicate_players:
        print(f"- Jugadores duplicados omitidos antes de escribir: {duplicate_players}")

    if player_payloads:
        inserted_players = (
            client.table("campogram_players")
            .upsert(player_payloads, on_conflict="campogram_id,source_system,source_row_id")
            .execute()
            .data
            or []
        )
        for player in inserted_players:
            source_row_id = str(player.get("source_row_id") or "")
            if source_row_id:
                player_id_by_source_row[source_row_id] = str(player["id"])

    report_payloads = []
    for row_index, row in reports_df.iterrows():
        campogram_name = _clean_text(row.get("campograma_canonico")) or ""
        google_row_id = _clean_text(row.get("player_row_id")) or ""
        player_source_row_id = player_source_row_by_google_row.get(google_row_id, "")
        report_payloads.append(
            _report_payload(
                row=row,
                season_id=season_id,
                campogram_id=campogram_ids.get(campogram_name),
                campogram_player_id=player_id_by_source_row.get(player_source_row_id),
                source_config=source_config,
                row_index=int(row_index),
            )
        )

    report_payloads, duplicate_reports = _dedupe_payloads(report_payloads)
    if duplicate_reports:
        print(f"- Informes duplicados omitidos antes de escribir: {duplicate_reports}")

    if report_payloads:
        client.table("campogram_reports").upsert(
            report_payloads,
            on_conflict="season_id,source_system,source_row_id",
        ).execute()

    print("Sincronizacion completada")
    print(f"- Campogramas sincronizados: {len(campogram_ids)}")
    print(f"- Jugadores sincronizados: {len(player_payloads)}")
    print(f"- Informes sincronizados: {len(report_payloads)}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Sincroniza campogramas con Supabase.")
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Escribe los datos en Supabase. Sin este flag solo simula.",
    )
    args = parser.parse_args()
    sync_campograms(apply=args.apply)


if __name__ == "__main__":
    main()
