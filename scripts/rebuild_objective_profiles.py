"""Recalcula perfiles objetivos y los guarda en Supabase sin rehacer la sync completa.

Uso habitual:

    .venv/bin/python scripts/rebuild_objective_profiles.py --source drive
    .venv/bin/python scripts/rebuild_objective_profiles.py --source drive --apply

Por defecto ejecuta una simulación y no escribe en Supabase.
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path
from typing import Any, Literal

import pandas as pd
from dotenv import load_dotenv
from supabase import create_client

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))

from src.scouting_app.objective_data import load_objective_players  # noqa: E402
from src.scouting_app.objective_profiles import apply_objective_profiles  # noqa: E402


SEASON_LABEL = "2025/26"
UPSERT_CHUNK_SIZE = 400


def _clean_text(value: Any) -> str | None:
    if value is None:
        return None
    if pd.isna(value):
        return None
    text = str(value).strip()
    return text or None


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
    if isinstance(value, dict):
        return {str(key): _json_safe(item) for key, item in value.items()}
    if isinstance(value, (list, tuple, set)):
        return [_json_safe(item) for item in value]
    if pd.isna(value):
        return None
    return value


def _chunked(items: list[dict[str, Any]], size: int = UPSERT_CHUNK_SIZE):
    for start in range(0, len(items), size):
        yield items[start : start + size]


def _dedupe_payloads_by_id(payloads: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], int]:
    deduped: list[dict[str, Any]] = []
    seen_ids: set[str] = set()

    for payload in payloads:
        row_id = _clean_text(payload.get("id"))
        if not row_id:
            continue
        if row_id in seen_ids:
            continue
        seen_ids.add(row_id)
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


def _fetch_objective_player_mapping(client, season_id: str) -> dict[tuple[str, str], str]:
    mapping: dict[tuple[str, str], str] = {}
    page_size = 1000

    for start in range(0, 100_000, page_size):
        response = (
            client.table("objective_players")
            .select("id,objective_dataset,source_player_id")
            .eq("season_id", season_id)
            .range(start, start + page_size - 1)
            .execute()
        )
        rows = response.data or []
        for row in rows:
            objective_dataset = _clean_text(row.get("objective_dataset"))
            source_player_id = _source_player_id(row.get("source_player_id"))
            row_id = _clean_text(row.get("id"))
            if objective_dataset and source_player_id and row_id:
                mapping[(objective_dataset, source_player_id)] = row_id
        if len(rows) < page_size:
            break

    return mapping


def rebuild_profiles(
    *,
    apply: bool,
    source: Literal["local", "drive"],
) -> None:
    objective_df = load_objective_players(source=source)
    objective_df = apply_objective_profiles(objective_df)

    total_players = len(objective_df)
    lateral_mask = objective_df["profile_family"].eq("Laterales")
    center_back_mask = objective_df["profile_family"].eq("Centrales")
    midfield_mask = objective_df["profile_family"].eq("Centrocampistas")
    striker_mask = objective_df["profile_family"].eq("Delanteros")
    winger_mask = objective_df["profile_family"].eq("Extremos")
    lateral_players = int(lateral_mask.sum())
    center_back_players = int(center_back_mask.sum())
    midfield_players = int(midfield_mask.sum())
    striker_players = int(striker_mask.sum())
    winger_players = int(winger_mask.sum())
    primary_count = int(objective_df["primary_profile"].notna().sum())
    secondary_count = int(objective_df["secondary_profile"].notna().sum())

    print("Resumen rebuild perfiles objetivos")
    print(f"- Modo: {'ESCRITURA' if apply else 'SIMULACION'}")
    print(f"- Fuente: {source}")
    print(f"- Jugadores leídos: {total_players}")
    print(f"- Jugadores perfilados como Laterales: {lateral_players}")
    print(f"- Jugadores perfilados como Centrales: {center_back_players}")
    print(f"- Jugadores perfilados como Centrocampistas: {midfield_players}")
    print(f"- Jugadores perfilados como Delanteros: {striker_players}")
    print(f"- Jugadores perfilados como Extremos: {winger_players}")
    print(f"- Perfiles principales detectados: {primary_count}")
    print(f"- Perfiles secundarios detectados: {secondary_count}")

    client = _get_supabase_client()
    season_id = _get_season_id(client)
    player_mapping = _fetch_objective_player_mapping(client, season_id)

    payloads: list[dict[str, Any]] = []
    missing_in_supabase = 0
    for _, row in objective_df.iterrows():
        objective_dataset = _clean_text(row.get("objective_dataset"))
        source_player_id = _source_player_id(row.get("id"))
        if not objective_dataset or not source_player_id:
            continue
        objective_player_id = player_mapping.get((objective_dataset, source_player_id))
        if not objective_player_id:
            missing_in_supabase += 1
            continue
        payloads.append(
            {
                "id": objective_player_id,
                "season_id": season_id,
                "objective_dataset": objective_dataset,
                "source_player_id": source_player_id,
                "primary_profile": _clean_text(row.get("primary_profile")),
                "secondary_profile": _clean_text(row.get("secondary_profile")),
                "profile_family": _clean_text(row.get("profile_family")),
                "profile_score_map": _json_safe(row.get("profile_score_map")) or {},
            }
        )

    print(f"- Filas preparadas para actualizar: {len(payloads)}")
    print(f"- Filas sin correspondencia en Supabase: {missing_in_supabase}")

    payloads, duplicated_rows = _dedupe_payloads_by_id(payloads)
    print(f"- Filas duplicadas omitidas en rebuild: {duplicated_rows}")
    print(f"- Filas finales a escribir: {len(payloads)}")

    if lateral_mask.any():
        sample = objective_df.loc[
            lateral_mask,
            [
                "full_name",
                "current_team_name",
                "primary_position_label",
                "primary_profile",
                "secondary_profile",
            ],
        ].head(10)
        print("- Muestra laterales:")
        print(sample.to_string(index=False))

    if center_back_mask.any():
        sample = objective_df.loc[
            center_back_mask,
            [
                "full_name",
                "current_team_name",
                "primary_position_label",
                "primary_profile",
                "secondary_profile",
            ],
        ].head(10)
        print("- Muestra centrales:")
        print(sample.to_string(index=False))

    if midfield_mask.any():
        sample = objective_df.loc[
            midfield_mask,
            [
                "full_name",
                "current_team_name",
                "primary_position_label",
                "primary_profile",
                "secondary_profile",
            ],
        ].head(10)
        print("- Muestra centrocampistas:")
        print(sample.to_string(index=False))

    if striker_mask.any():
        sample = objective_df.loc[
            striker_mask,
            [
                "full_name",
                "current_team_name",
                "primary_position_label",
                "primary_profile",
                "secondary_profile",
            ],
        ].head(10)
        print("- Muestra delanteros:")
        print(sample.to_string(index=False))

    if winger_mask.any():
        sample = objective_df.loc[
            winger_mask,
            [
                "full_name",
                "current_team_name",
                "primary_position_label",
                "primary_profile",
                "secondary_profile",
            ],
        ].head(10)
        print("- Muestra extremos:")
        print(sample.to_string(index=False))

    if not apply:
        print("Simulación completada. Ejecuta con --apply para escribir perfiles en Supabase.")
        return

    for chunk in _chunked(payloads):
        client.table("objective_players").upsert(chunk, on_conflict="id").execute()

    print("Rebuild completado.")
    print(f"- Filas actualizadas en objective_players: {len(payloads)}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Recalcula perfiles objetivos y actualiza Supabase.")
    parser.add_argument("--apply", action="store_true", help="Escribe cambios en Supabase.")
    parser.add_argument(
        "--source",
        choices=("local", "drive"),
        default="drive",
        help="Fuente de los datos objetivos para recalcular perfiles.",
    )
    args = parser.parse_args()
    rebuild_profiles(apply=args.apply, source=args.source)


if __name__ == "__main__":
    main()
