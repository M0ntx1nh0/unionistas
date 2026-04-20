"""Sincroniza informes subjetivos generales desde Google Sheets hacia Supabase.

Por defecto ejecuta una simulacion sin escribir datos. Para insertar/actualizar:

    .venv/bin/python scripts/sync_scouting_reports_to_supabase.py --apply
"""

from __future__ import annotations

import argparse
import hashlib
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

from src.scouting_app.calendar_data import canonicalize_team_name, competition_family  # noqa: E402
from src.scouting_app.data_processing import load_scouting_reports  # noqa: E402
from src.scouting_app.google_sheets import _get_sheet_config  # noqa: E402


SEASON_LABEL = "2025/26"


def _clean_text(value: Any) -> str | None:
    if value is None:
        return None
    if pd.isna(value):
        return None
    text = str(value).strip()
    return text or None


def _clean_timestamp(value: Any) -> str | None:
    if value is None or pd.isna(value):
        return None
    parsed = pd.to_datetime(value, errors="coerce")
    if pd.isna(parsed):
        return None
    return parsed.isoformat()


def _clean_date(value: Any) -> str | None:
    if value is None or pd.isna(value):
        return None
    parsed = pd.to_datetime(value, errors="coerce")
    if pd.isna(parsed):
        return None
    return parsed.date().isoformat()


def _clean_int(value: Any) -> int | None:
    if value is None or pd.isna(value):
        return None
    parsed = pd.to_numeric(value, errors="coerce")
    if pd.isna(parsed):
        return None
    return int(parsed)


def _json_safe_dict(row: pd.Series) -> dict[str, Any]:
    payload: dict[str, Any] = {}
    for key, value in row.to_dict().items():
        if value is None:
            payload[str(key)] = None
        elif isinstance(value, pd.Timestamp):
            payload[str(key)] = value.isoformat()
        elif isinstance(value, np.ndarray):
            payload[str(key)] = value.tolist()
        elif isinstance(value, (list, tuple, set)):
            payload[str(key)] = list(value)
        elif pd.isna(value):
            payload[str(key)] = None
        else:
            try:
                json.dumps(value)
                payload[str(key)] = value
            except TypeError:
                payload[str(key)] = str(value)
    return payload


def _stable_source_row_id(prefix: str, *parts: Any) -> str:
    """Genera un identificador estable aunque se muevan filas en Google Sheets."""
    normalized_parts = [canonicalize_team_name(part) for part in parts]
    digest = hashlib.sha1("||".join(normalized_parts).encode("utf-8")).hexdigest()
    return f"{prefix}:{digest}"


def _dedupe_payloads(
    payloads: list[dict[str, Any]],
    key_field: str = "source_row_id",
) -> tuple[list[dict[str, Any]], int]:
    """Evita enviar dos veces el mismo informe en un mismo upsert."""
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


def _report_payload(
    row: pd.Series,
    season_id: str,
    source_config: dict[str, str],
    source_row_id: str,
) -> dict[str, Any]:
    player_name = _clean_text(row.get("nombre_jugador")) or "Sin nombre"
    team_name = _clean_text(row.get("equipo"))
    competition = _clean_text(row.get("competicion"))
    scout_name = _clean_text(row.get("ojeador"))
    report_date = _clean_timestamp(row.get("marca_temporal"))
    position = _clean_text(row.get("demarcacion_principal")) or _clean_text(row.get("demarcacion"))
    verdict = _clean_text(row.get("veredicto"))
    positive_aspects = _clean_text(row.get("aspectos_positivos"))
    negative_aspects = _clean_text(row.get("aspectos_negativos"))
    rating_technical = _clean_text(row.get("capacidades_tecnicas"))
    rating_physical = _clean_text(row.get("capacidades_fisicas"))
    rating_psychological = _clean_text(row.get("capacidades_tacticas_psicologicas"))

    comments = [
        positive_aspects,
        negative_aspects,
    ]
    combined_comments = "\n\n".join(comment for comment in comments if comment)
    stable_source_row_id = _stable_source_row_id(
        "report",
        source_config.get("spreadsheet_id"),
        source_config.get("worksheet_name"),
        season_id,
        player_name,
        scout_name,
        report_date,
        team_name,
    )
    raw_data = _json_safe_dict(row)
    raw_data["google_row_id"] = source_row_id

    return {
        "season_id": season_id,
        "player_name": player_name,
        "normalized_player_name": canonicalize_team_name(player_name),
        "scout_name": scout_name,
        "report_date": report_date,
        "team_name": team_name,
        "normalized_team_name": canonicalize_team_name(team_name),
        "competition": competition_family(competition),
        "group_name": None,
        "position": position,
        "verdict": verdict,
        "birth_year": _clean_int(row.get("ano_nacimiento")),
        "birth_place": _clean_text(row.get("lugar_nacimiento")),
        "nationality": _clean_text(row.get("nacionalidad")),
        "foot": _clean_text(row.get("lateralidad")),
        "secondary_position": _clean_text(row.get("demarcacion_secundaria")),
        "contract_until": _clean_date(row.get("ano_fin_contrato")),
        "agency": _clean_text(row.get("representante_agencia")),
        "contract_status": _clean_text(row.get("situacion_contractual")),
        "matchday": _clean_int(row.get("jornada_numero")),
        "watched_match": _clean_text(row.get("partido_visionado")),
        "viewing_type": _clean_text(row.get("visualizacion")),
        "positive_aspects": positive_aspects,
        "negative_aspects": negative_aspects,
        "times_seen_same_scout": _clean_int(row.get("veces_visto_mismo_scout")),
        "rating_technical": rating_technical,
        "rating_physical": rating_physical,
        "rating_psychological": rating_psychological,
        "comments": combined_comments or None,
        "source_spreadsheet_id": source_config.get("spreadsheet_id"),
        "source_worksheet_name": source_config.get("worksheet_name"),
        "source_row_id": stable_source_row_id,
        "raw_data": raw_data,
    }


def sync_scouting_reports(apply: bool) -> None:
    reports_df = load_scouting_reports()
    source_config = _get_sheet_config()

    if reports_df.empty:
        print("No hay informes subjetivos para sincronizar.")
        return

    reports_df = reports_df.reset_index(drop=True)
    valid_reports = reports_df[reports_df["nombre_jugador"].notna()].copy()

    print("Resumen informes subjetivos")
    print(f"- Modo: {'ESCRITURA' if apply else 'SIMULACION'}")
    print(f"- Filas detectadas: {len(reports_df)}")
    print(f"- Informes con jugador: {len(valid_reports)}")
    print(f"- Jugadores unicos: {valid_reports['nombre_jugador'].nunique()}")
    print(f"- Scouts unicos: {valid_reports['ojeador'].nunique() if 'ojeador' in valid_reports.columns else 0}")

    if not apply:
        print("Simulacion completada. Ejecuta con --apply para escribir en Supabase.")
        return

    client = _get_supabase_client()
    season_id = _get_season_id(client)

    payloads = [
        _report_payload(row, season_id, source_config, source_row_id=str(index))
        for index, row in valid_reports.iterrows()
    ]
    payloads, duplicate_reports = _dedupe_payloads(payloads)
    if duplicate_reports:
        print(f"- Informes duplicados omitidos antes de escribir: {duplicate_reports}")

    if payloads:
        client.table("scouting_reports").upsert(
            payloads,
            on_conflict="season_id,source_system,source_row_id",
        ).execute()

    print("Sincronizacion completada")
    print(f"- Informes sincronizados: {len(payloads)}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Sincroniza informes subjetivos con Supabase.")
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Escribe los datos en Supabase. Sin este flag solo simula.",
    )
    args = parser.parse_args()
    sync_scouting_reports(apply=args.apply)


if __name__ == "__main__":
    main()
