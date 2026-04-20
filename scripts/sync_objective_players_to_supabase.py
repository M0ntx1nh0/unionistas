"""Sincroniza datos objetivos Wyscout hacia Supabase.

Por defecto ejecuta una simulacion sin escribir datos. Para insertar/actualizar:

    .venv/bin/python scripts/sync_objective_players_to_supabase.py --apply

Antes de escribir hay que ejecutar en Supabase:

    supabase/migrations/003_objective_wyscout.sql
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
from dotenv import load_dotenv
from supabase import create_client

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))

from src.scouting_app.calendar_data import canonicalize_team_name  # noqa: E402
from src.scouting_app.data_processing import load_scouting_reports  # noqa: E402
from src.scouting_app.objective_data import (  # noqa: E402
    OBJECTIVE_VISIBLE_METRICS,
    build_radar_dataset,
    get_objective_metric_panel_columns,
    load_objective_players,
    match_objective_players,
)


SEASON_LABEL = "2025/26"
UPSERT_CHUNK_SIZE = 400
MIN_RADAR_SAMPLE_SIZE = 30


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
    parsed = pd.to_numeric(value, errors="coerce")
    if pd.isna(parsed):
        return None
    return int(parsed)


def _clean_float(value: Any) -> float | None:
    if value is None or pd.isna(value):
        return None
    parsed = pd.to_numeric(value, errors="coerce")
    if pd.isna(parsed):
        return None
    return float(parsed)


def _clean_bool(value: Any) -> bool | None:
    if value is None or pd.isna(value):
        return None
    if isinstance(value, bool):
        return value
    text = str(value).strip().lower()
    if text in {"true", "1", "yes", "si", "sí"}:
        return True
    if text in {"false", "0", "no"}:
        return False
    return None


def _clean_date(value: Any) -> str | None:
    if value is None or pd.isna(value):
        return None
    parsed = pd.to_datetime(value, errors="coerce")
    if pd.isna(parsed):
        return None
    return parsed.date().isoformat()


def _source_player_id(value: Any) -> str | None:
    cleaned = _clean_text(value)
    if not cleaned:
        return None
    parsed = pd.to_numeric(cleaned, errors="coerce")
    if not pd.isna(parsed):
        return str(int(parsed))
    return cleaned


def _json_safe(value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, pd.Timestamp):
        return value.isoformat()
    if isinstance(value, np.ndarray):
        return [_json_safe(item) for item in value.tolist()]
    if isinstance(value, (list, tuple, set)):
        return [_json_safe(item) for item in value]
    if pd.isna(value):
        return None
    if isinstance(value, np.integer):
        return int(value)
    if isinstance(value, np.floating):
        return float(value)
    try:
        json.dumps(value)
        return value
    except TypeError:
        return str(value)


def _json_safe_dict(row: pd.Series) -> dict[str, Any]:
    return {str(key): _json_safe(value) for key, value in row.to_dict().items()}


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


def _chunked(items: list[dict[str, Any]], size: int = UPSERT_CHUNK_SIZE):
    for start in range(0, len(items), size):
        yield items[start : start + size]


def _dedupe_payloads(
    payloads: list[dict[str, Any]],
    key_fields: tuple[str, ...],
) -> tuple[list[dict[str, Any]], int]:
    """Supabase/Postgres no admite dos filas con la misma clave en un mismo upsert."""
    seen: set[tuple[Any, ...]] = set()
    deduped: list[dict[str, Any]] = []

    for payload in payloads:
        key = tuple(payload.get(field) for field in key_fields)
        if key in seen:
            continue
        seen.add(key)
        deduped.append(payload)

    return deduped, len(payloads) - len(deduped)


def _radar_payload(radar_data: dict[str, Any] | None) -> dict[str, Any] | None:
    if not radar_data:
        return None

    return {
        "params": radar_data.get("params", []),
        "values": radar_data.get("values", []),
        "slice_colors": radar_data.get("slice_colors", []),
        "comparison_label": radar_data.get("comparison_label"),
        "sample_count": radar_data.get("sample_count"),
        "minimum_minutes": radar_data.get("minimum_minutes"),
        "competition_name": radar_data.get("competition_name"),
        "radar_group": radar_data.get("radar_group"),
        "compare_mode": radar_data.get("compare_mode"),
        "fallback_reason": radar_data.get("fallback_reason"),
    }


def _metric_payload(
    row: pd.Series,
    radar_data: dict[str, Any] | None = None,
    radar_specific: dict[str, Any] | None = None,
    radar_general: dict[str, Any] | None = None,
) -> dict[str, Any]:
    metrics: dict[str, Any] = {}
    for metric_key in OBJECTIVE_VISIBLE_METRICS:
        if metric_key in row.index:
            metrics[metric_key] = _json_safe(row.get(metric_key))

    panel_metrics = get_objective_metric_panel_columns(row, limit=16)
    if panel_metrics:
        metrics["_panel_metric_keys"] = panel_metrics

    radar = _radar_payload(radar_data)
    if radar:
        metrics["_radar"] = radar
    specific = _radar_payload(radar_specific)
    if specific:
        metrics["_radar_specific"] = specific
    general = _radar_payload(radar_general)
    if general:
        metrics["_radar_general"] = general

    return metrics


def _objective_player_payload(
    row: pd.Series,
    season_id: str,
    radar_data: dict[str, Any] | None = None,
    radar_specific: dict[str, Any] | None = None,
    radar_general: dict[str, Any] | None = None,
) -> dict[str, Any] | None:
    source_player_id = _source_player_id(row.get("id"))
    objective_dataset = _clean_text(row.get("objective_dataset"))
    if not source_player_id or not objective_dataset:
        return None

    full_name = _clean_text(row.get("full_name")) or _clean_text(row.get("name"))
    current_team = _clean_text(row.get("current_team_name"))
    last_club = _clean_text(row.get("last_club_name"))

    return {
        "season_id": season_id,
        "objective_dataset": objective_dataset,
        "source_player_id": source_player_id,
        "name": _clean_text(row.get("name")),
        "full_name": full_name,
        "normalized_full_name": canonicalize_team_name(full_name),
        "birth_year": _clean_int(row.get("birth_year")),
        "birth_date": _clean_date(row.get("birth_date")),
        "birth_country_name": _clean_text(row.get("birth_country_name")),
        "passport_country_names": _clean_text(row.get("passport_country_names")),
        "image": _clean_text(row.get("image")),
        "current_team_name": current_team,
        "normalized_current_team_name": canonicalize_team_name(current_team),
        "domestic_competition_name": _clean_text(row.get("domestic_competition_name")),
        "current_team_logo": _clean_text(row.get("current_team_logo")),
        "current_team_color": _clean_text(row.get("current_team_color")),
        "last_club_name": last_club,
        "normalized_last_club_name": canonicalize_team_name(last_club),
        "contract_expires": _clean_date(row.get("contract_expires")),
        "market_value": _clean_float(row.get("market_value")),
        "on_loan": _clean_bool(row.get("on_loan")),
        "positions": _clean_text(row.get("positions")),
        "primary_position": _clean_text(row.get("primary_position")),
        "primary_position_label": _clean_text(row.get("primary_position_label")),
        "secondary_position": _clean_text(row.get("secondary_position")),
        "secondary_position_label": _clean_text(row.get("secondary_position_label")),
        "third_position": _clean_text(row.get("third_position")),
        "third_position_label": _clean_text(row.get("third_position_label")),
        "foot": _clean_text(row.get("foot")),
        "height": _clean_float(row.get("height")),
        "weight": _clean_float(row.get("weight")),
        "metrics": _metric_payload(
            row,
            radar_data=radar_data,
            radar_specific=radar_specific,
            radar_general=radar_general,
        ),
        "raw_data": _json_safe_dict(row),
    }


def _build_radar_variants(objective_df: pd.DataFrame, objective_player_id: Any) -> dict[str, Any]:
    specific_radar = build_radar_dataset(
        objective_df,
        objective_player_id,
        compare_mode="specific",
    )
    general_radar = build_radar_dataset(
        objective_df,
        objective_player_id,
        compare_mode="general",
    )

    best_radar: dict[str, Any] | None = None
    if specific_radar and int(specific_radar.get("sample_count") or 0) >= MIN_RADAR_SAMPLE_SIZE:
        best_radar = specific_radar
    elif general_radar:
        if specific_radar:
            general_radar["fallback_reason"] = (
                f"Muestra especifica baja: {specific_radar.get('sample_count')} jugadores. "
                f"Se usa familia general."
            )
        else:
            general_radar["fallback_reason"] = "Sin muestra especifica suficiente. Se usa familia general."
        best_radar = general_radar
    else:
        best_radar = specific_radar

    if specific_radar and int(specific_radar.get("sample_count") or 0) < MIN_RADAR_SAMPLE_SIZE:
        specific_radar["fallback_reason"] = (
            f"Muestra especifica baja: {specific_radar.get('sample_count')} jugadores. "
            "Interpreta este radar con cautela."
        )

    return {
        "best": best_radar,
        "specific": specific_radar,
        "general": general_radar,
    }


def _build_best_radar_dataset(objective_df: pd.DataFrame, objective_player_id: Any) -> dict[str, Any] | None:
    specific_radar = build_radar_dataset(
        objective_df,
        objective_player_id,
        compare_mode="specific",
    )
    if specific_radar and int(specific_radar.get("sample_count") or 0) >= MIN_RADAR_SAMPLE_SIZE:
        return specific_radar

    general_radar = build_radar_dataset(
        objective_df,
        objective_player_id,
        compare_mode="general",
    )
    if general_radar:
        if specific_radar:
            general_radar["fallback_reason"] = (
                f"Muestra especifica baja: {specific_radar.get('sample_count')} jugadores. "
                f"Se usa familia general."
            )
        else:
            general_radar["fallback_reason"] = "Sin muestra especifica suficiente. Se usa familia general."
        return general_radar

    return specific_radar


def _fetch_objective_player_ids(client, season_id: str) -> dict[tuple[str, str], str]:
    mapping: dict[tuple[str, str], str] = {}
    page_size = 1000
    for start in range(0, 100000, page_size):
        response = (
            client.table("objective_players")
            .select("id,objective_dataset,source_player_id")
            .eq("season_id", season_id)
            .range(start, start + page_size - 1)
            .execute()
        )
        rows = response.data or []
        for row in rows:
            mapping[(str(row["objective_dataset"]), str(row["source_player_id"]))] = str(row["id"])
        if len(rows) < page_size:
            break
    return mapping


def _match_status_order(status: str | None) -> int:
    return {"seguro": 0, "probable": 1, "dudoso": 2, "sin_match": 3}.get(status or "", 9)


def _objective_match_payload(
    row: pd.Series,
    season_id: str,
    objective_player_ids: dict[tuple[str, str], str],
) -> dict[str, Any] | None:
    objective_dataset = _clean_text(row.get("objective_dataset"))
    source_player_id = _source_player_id(row.get("objective_player_id"))
    if not objective_dataset or not source_player_id:
        return None

    objective_player_id = objective_player_ids.get((objective_dataset, source_player_id))
    if not objective_player_id:
        return None

    scouting_player_name = _clean_text(row.get("scouting_player_name"))

    return {
        "season_id": season_id,
        "objective_player_id": objective_player_id,
        "objective_dataset": objective_dataset,
        "scouting_player_name": scouting_player_name,
        "normalized_scouting_player_name": canonicalize_team_name(scouting_player_name),
        "scouting_birth_year": _clean_int(row.get("scouting_birth_year")),
        "scouting_team": _clean_text(row.get("scouting_team")),
        "objective_full_name": _clean_text(row.get("objective_full_name")),
        "objective_birth_year": _clean_int(row.get("objective_birth_year")),
        "objective_team": _clean_text(row.get("objective_team")),
        "objective_last_club": _clean_text(row.get("objective_last_club")),
        "name_similarity": _clean_float(row.get("name_similarity")),
        "team_similarity": _clean_float(row.get("team_similarity")),
        "birth_year_match": _clean_float(row.get("birth_year_match")),
        "match_score": _clean_float(row.get("match_score")),
        "match_status": _clean_text(row.get("match_status")) or "sin_match",
        "raw_data": _json_safe_dict(row),
    }


def sync_objective_players(apply: bool, source: str) -> None:
    objective_df = load_objective_players(source=source)  # type: ignore[arg-type]
    subjective_df = load_scouting_reports()
    matches_df = match_objective_players(subjective_df, objective_df)

    if not matches_df.empty:
        matches_df = matches_df.sort_values(
            by=["match_status", "match_score", "name_similarity"],
            key=lambda series: (
                series.map(_match_status_order)
                if series.name == "match_status"
                else series
            ),
            ascending=[True, False, False],
            na_position="last",
        )

    print("Resumen datos objetivos Wyscout")
    print(f"- Modo: {'ESCRITURA' if apply else 'SIMULACION'}")
    print(f"- Fuente: {source}")
    print(f"- Jugadores objetivos detectados: {len(objective_df)}")
    print(f"- Informes subjetivos para cruce: {len(subjective_df)}")
    print(f"- Cruces generados: {len(matches_df)}")
    if not matches_df.empty:
        print("- Estado cruces:")
        print(matches_df["match_status"].value_counts(dropna=False).to_string())

    if not apply:
        print("Simulacion completada. Ejecuta con --apply para escribir en Supabase.")
        return

    client = _get_supabase_client()
    season_id = _get_season_id(client)

    radar_by_source_id: dict[str, dict[str, Any]] = {}
    for _, row in objective_df.iterrows():
        source_player_id = _source_player_id(row.get("id"))
        if not source_player_id:
            continue
        radar_variants = _build_radar_variants(objective_df, row.get("id"))
        if any(radar_variants.values()):
            radar_by_source_id[source_player_id] = radar_variants

    player_payloads = []
    for _, row in objective_df.iterrows():
        source_player_id = _source_player_id(row.get("id"))
        payload = _objective_player_payload(
            row,
            season_id,
            radar_data=(radar_by_source_id.get(source_player_id or "") or {}).get("best"),
            radar_specific=(radar_by_source_id.get(source_player_id or "") or {}).get("specific"),
            radar_general=(radar_by_source_id.get(source_player_id or "") or {}).get("general"),
        )
        if payload is not None:
            player_payloads.append(payload)
    player_payloads, duplicated_players = _dedupe_payloads(
        player_payloads,
        ("season_id", "objective_dataset", "source_player_id"),
    )
    if duplicated_players:
        print(f"- Jugadores objetivos duplicados omitidos: {duplicated_players}")

    for chunk in _chunked(player_payloads):
        client.table("objective_players").upsert(
            chunk,
            on_conflict="season_id,objective_dataset,source_player_id",
        ).execute()

    objective_player_ids = _fetch_objective_player_ids(client, season_id)
    match_payloads = [
        payload
        for _, row in matches_df.iterrows()
        if (payload := _objective_match_payload(row, season_id, objective_player_ids)) is not None
    ]
    match_payloads, duplicated_matches = _dedupe_payloads(
        match_payloads,
        (
            "season_id",
            "objective_dataset",
            "objective_player_id",
            "normalized_scouting_player_name",
        ),
    )
    if duplicated_matches:
        print(f"- Cruces duplicados omitidos: {duplicated_matches}")

    for chunk in _chunked(match_payloads):
        client.table("objective_player_matches").upsert(
            chunk,
            on_conflict="season_id,objective_dataset,objective_player_id,normalized_scouting_player_name",
        ).execute()

    print("Sincronizacion completada")
    print(f"- Jugadores objetivos sincronizados: {len(player_payloads)}")
    print(f"- Cruces sincronizados: {len(match_payloads)}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Sincroniza datos objetivos Wyscout con Supabase.")
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Escribe los datos en Supabase. Sin este flag solo simula.",
    )
    parser.add_argument(
        "--source",
        choices=["local", "drive"],
        default="local",
        help="Origen de los CSV Wyscout. En local usa data/raw; en drive usa Google Drive.",
    )
    args = parser.parse_args()
    sync_objective_players(apply=args.apply, source=args.source)


if __name__ == "__main__":
    main()
