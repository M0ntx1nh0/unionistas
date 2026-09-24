"""Audita la futura asignacion de ``player_id`` sin modificar Supabase.

La identidad provisional reproduce la relacion que ya utiliza el proyecto:
nombre normalizado + ano de nacimiento. El resultado permite revisar la
cobertura y los casos ambiguos antes de ejecutar cualquier migracion.

Uso:

    .venv/bin/python scripts/audit_player_identity_migration.py
"""

from __future__ import annotations

import argparse
import csv
import json
import os
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, Iterable

from dotenv import load_dotenv
from supabase import create_client


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT_DIR = PROJECT_ROOT / "outputs" / "player_identity_audit"
PAGE_SIZE = 1_000


def _clean_text(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _clean_year(value: Any) -> int | None:
    if value in (None, ""):
        return None
    try:
        year = int(float(str(value).strip()))
    except (TypeError, ValueError):
        return None
    return year if 1900 <= year <= 2100 else None


def _normalize(value: Any) -> str:
    import re
    import unicodedata

    text = unicodedata.normalize("NFKD", _clean_text(value) or "")
    text = "".join(char for char in text if not unicodedata.combining(char))
    text = re.sub(r"[^a-zA-Z0-9]+", " ", text).strip().lower()
    return " ".join(text.split())


def _join_values(values: Iterable[Any]) -> str:
    cleaned = sorted({_clean_text(value) for value in values if _clean_text(value)})
    return " | ".join(cleaned)


def _get_client():
    load_dotenv(PROJECT_ROOT / ".env")
    supabase_url = os.getenv("SUPABASE_URL")
    service_role_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    if not supabase_url or not service_role_key:
        raise RuntimeError("Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env")
    if service_role_key == "tu_service_role_key":
        raise RuntimeError("SUPABASE_SERVICE_ROLE_KEY sigue con el placeholder.")
    return create_client(supabase_url, service_role_key)


def _fetch_all(client, table: str, columns: str) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    offset = 0
    while True:
        response = client.table(table).select(columns).range(offset, offset + PAGE_SIZE - 1).execute()
        page = response.data or []
        rows.extend(page)
        if len(page) < PAGE_SIZE:
            return rows
        offset += PAGE_SIZE


def _fetch_optional(client, table: str, columns: str) -> list[dict[str, Any]]:
    try:
        return _fetch_all(client, table, columns)
    except Exception as exc:  # La auditoria sigue si una fase opcional aun no esta desplegada.
        print(f"- Aviso: no se pudo leer {table}: {exc}")
        return []


@dataclass(frozen=True)
class IdentityRecord:
    source: str
    record_id: str
    season_id: str | None
    season_label: str | None
    player_id: str | None
    player_name: str
    normalized_name: str
    birth_year: int | None
    team_name: str | None

    @property
    def identity_key(self) -> tuple[str, int] | None:
        if not self.normalized_name or self.birth_year is None:
            return None
        return self.normalized_name, self.birth_year


def _record_from_row(
    row: dict[str, Any],
    *,
    source: str,
    season_labels: dict[str, str],
    name_fields: tuple[str, ...],
    normalized_field: str | None = None,
    team_fields: tuple[str, ...] = ("team_name",),
    season_id: str | None = None,
) -> IdentityRecord | None:
    player_name = next((_clean_text(row.get(field)) for field in name_fields if _clean_text(row.get(field))), None)
    if not player_name:
        return None
    row_season_id = season_id or _clean_text(row.get("season_id"))
    normalized_name = _clean_text(row.get(normalized_field)) if normalized_field else None
    team_name = next((_clean_text(row.get(field)) for field in team_fields if _clean_text(row.get(field))), None)
    return IdentityRecord(
        source=source,
        record_id=str(row.get("id") or ""),
        season_id=row_season_id,
        season_label=season_labels.get(row_season_id or ""),
        player_id=_clean_text(row.get("player_id")),
        player_name=player_name,
        normalized_name=_normalize(normalized_name or player_name),
        birth_year=_clean_year(row.get("birth_year")),
        team_name=team_name,
    )


def _write_csv(path: Path, rows: list[dict[str, Any]], fieldnames: list[str]) -> None:
    with path.open("w", newline="", encoding="utf-8") as file:
        writer = csv.DictWriter(file, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def run_audit(output_dir: Path) -> dict[str, Any]:
    client = _get_client()
    seasons = _fetch_all(client, "seasons", "id,label")
    season_labels = {str(row["id"]): str(row["label"]) for row in seasons}

    players = _fetch_all(
        client,
        "players",
        "id,canonical_name,normalized_name,birth_year",
    )
    reports = _fetch_all(
        client,
        "scouting_reports",
        "id,season_id,player_id,player_name,normalized_player_name,birth_year,team_name,comments",
    )
    campogram_players = _fetch_all(
        client,
        "campogram_players",
        "id,season_id,player_id,player_name,normalized_player_name,birth_year,team_name",
    )
    try:
        objective_players = _fetch_all(
            client,
            "objective_players",
            "id,season_id,player_id,full_name,name,normalized_full_name,birth_year,current_team_name,source_player_id,objective_dataset",
        )
    except Exception:
        # La columna se incorpora en la fase estructural 010.
        objective_players = _fetch_all(
            client,
            "objective_players",
            "id,season_id,full_name,name,normalized_full_name,birth_year,current_team_name,source_player_id,objective_dataset",
        )
    objective_matches = _fetch_all(
        client,
        "objective_player_matches",
        "id,season_id,objective_player_id,normalized_scouting_player_name,scouting_birth_year,match_status,match_score",
    )
    shortlists = _fetch_optional(client, "uscout_shortlists", "id,season_id")
    shortlist_seasons = {str(row["id"]): str(row["season_id"]) for row in shortlists}
    shortlist_players = _fetch_optional(
        client,
        "uscout_shortlist_players",
        "id,shortlist_id,player_id,player_name,normalized_player_name,birth_year,team_name",
    )
    boards = _fetch_optional(client, "uscout_boards", "id,season_id")
    board_seasons = {str(row["id"]): str(row["season_id"]) for row in boards}
    board_slots = _fetch_optional(
        client,
        "uscout_board_slots",
        "id,board_id,player_id,player_name,normalized_player_name,birth_year,team_name",
    )
    pipeline_events = _fetch_all(client, "campogram_player_pipeline_events", "id")
    player_seasons = _fetch_optional(client, "player_seasons", "id,player_id,season_id")
    identity_links = _fetch_optional(client, "player_identity_links", "id,player_id,source_table")
    external_ids = _fetch_optional(client, "player_external_ids", "id,player_id,source_system")

    records: list[IdentityRecord] = []
    source_specs = [
        (reports, "scouting_reports", ("player_name",), "normalized_player_name", ("team_name",), None),
        (campogram_players, "campogram_players", ("player_name",), "normalized_player_name", ("team_name",), None),
        (
            objective_players,
            "objective_players",
            ("full_name", "name"),
            "normalized_full_name",
            ("current_team_name",),
            None,
        ),
    ]
    for rows, source, name_fields, normalized_field, team_fields, fixed_season in source_specs:
        for row in rows:
            record = _record_from_row(
                row,
                source=source,
                season_labels=season_labels,
                name_fields=name_fields,
                normalized_field=normalized_field,
                team_fields=team_fields,
                season_id=fixed_season,
            )
            if record:
                records.append(record)

    for row in shortlist_players:
        record = _record_from_row(
            row,
            source="uscout_shortlist_players",
            season_labels=season_labels,
            name_fields=("player_name",),
            normalized_field="normalized_player_name",
            season_id=shortlist_seasons.get(str(row.get("shortlist_id"))),
        )
        if record:
            records.append(record)

    for row in board_slots:
        record = _record_from_row(
            row,
            source="uscout_board_slots",
            season_labels=season_labels,
            name_fields=("player_name",),
            normalized_field="normalized_player_name",
            season_id=board_seasons.get(str(row.get("board_id"))),
        )
        if record:
            records.append(record)

    grouped: dict[tuple[str, int], list[IdentityRecord]] = defaultdict(list)
    unresolved: list[IdentityRecord] = []
    for record in records:
        if record.identity_key:
            grouped[record.identity_key].append(record)
        else:
            unresolved.append(record)

    existing_by_key: dict[tuple[str, int], set[str]] = defaultdict(set)
    for player in players:
        normalized_name = _normalize(player.get("normalized_name") or player.get("canonical_name"))
        birth_year = _clean_year(player.get("birth_year"))
        player_id = _clean_text(player.get("id"))
        if normalized_name and birth_year is not None and player_id:
            existing_by_key[(normalized_name, birth_year)].add(player_id)

    candidate_rows: list[dict[str, Any]] = []
    conflict_rows: list[dict[str, Any]] = []
    for (normalized_name, birth_year), identity_records in sorted(grouped.items()):
        linked_ids = {record.player_id for record in identity_records if record.player_id}
        linked_ids.update(existing_by_key.get((normalized_name, birth_year), set()))
        row = {
            "normalized_name": normalized_name,
            "birth_year": birth_year,
            "display_names": _join_values(record.player_name for record in identity_records),
            "seasons": _join_values(record.season_label for record in identity_records),
            "teams": _join_values(record.team_name for record in identity_records),
            "sources": _join_values(record.source for record in identity_records),
            "records": len(identity_records),
            "existing_player_ids": _join_values(linked_ids),
            "status": "conflicto_ids" if len(linked_ids) > 1 else "seguro",
        }
        (conflict_rows if len(linked_ids) > 1 else candidate_rows).append(row)

    unresolved_rows = [
        {
            "source": record.source,
            "record_id": record.record_id,
            "season": record.season_label or "",
            "player_name": record.player_name,
            "normalized_name": record.normalized_name,
            "birth_year": record.birth_year or "",
            "team_name": record.team_name or "",
            "existing_player_id": record.player_id or "",
            "reason": "sin_ano_nacimiento" if record.birth_year is None else "sin_nombre_normalizado",
        }
        for record in unresolved
    ]

    source_totals: dict[str, int] = defaultdict(int)
    source_linked: dict[str, int] = defaultdict(int)
    source_safe: dict[str, int] = defaultdict(int)
    safe_keys = {(row["normalized_name"], int(row["birth_year"])) for row in candidate_rows}
    for record in records:
        source_totals[record.source] += 1
        if record.player_id:
            source_linked[record.source] += 1
        if record.identity_key in safe_keys:
            source_safe[record.source] += 1

    operational_sources = {
        "scouting_reports",
        "campogram_players",
        "uscout_shortlist_players",
        "uscout_board_slots",
    }
    operational_keys = {
        record.identity_key
        for record in records
        if record.source in operational_sources and record.identity_key is not None
    }
    objective_keys = {
        record.identity_key
        for record in records
        if record.source == "objective_players" and record.identity_key is not None
    }
    objective_match_statuses: dict[str, int] = defaultdict(int)
    safe_objective_matches_linkable = 0
    for match in objective_matches:
        match_status = str(match.get("match_status") or "sin_estado")
        objective_match_statuses[match_status] += 1
        match_key = (
            _normalize(match.get("normalized_scouting_player_name")),
            _clean_year(match.get("scouting_birth_year")),
        )
        if match_status == "seguro" and match_key[1] is not None and match_key in operational_keys:
            safe_objective_matches_linkable += 1

    summary = {
        "generated_at": datetime.now().astimezone().isoformat(),
        "mode": "read_only",
        "database_counts": {
            "players": len(players),
            "scouting_reports": len(reports),
            "scouting_reports_with_comments": sum(1 for row in reports if _clean_text(row.get("comments"))),
            "campogram_players": len(campogram_players),
            "campogram_pipeline_events": len(pipeline_events),
            "objective_players": len(objective_players),
            "objective_player_matches": len(objective_matches),
            "uscout_shortlist_players": len(shortlist_players),
            "uscout_board_slots": len(board_slots),
            "player_seasons": len(player_seasons),
            "player_identity_links": len(identity_links),
            "player_external_ids": len(external_ids),
        },
        "identity_counts": {
            "safe_identity_groups": len(candidate_rows),
            "conflicting_identity_groups": len(conflict_rows),
            "records_missing_identity_data": len(unresolved_rows),
            "operational_identity_groups": len(operational_keys),
            "objective_only_identity_groups": len(objective_keys - operational_keys),
            "exact_operational_objective_overlap": len(operational_keys & objective_keys),
        },
        "objective_match_statuses": dict(sorted(objective_match_statuses.items())),
        "safe_objective_matches_linkable": safe_objective_matches_linkable,
        "sources": {
            source: {
                "records": source_totals[source],
                "already_linked_by_player_id": source_linked[source],
                "eligible_for_safe_backfill": source_safe[source],
            }
            for source in sorted(source_totals)
        },
    }

    output_dir.mkdir(parents=True, exist_ok=True)
    (output_dir / "summary.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    candidate_fields = [
        "normalized_name",
        "birth_year",
        "display_names",
        "seasons",
        "teams",
        "sources",
        "records",
        "existing_player_ids",
        "status",
    ]
    _write_csv(output_dir / "safe_identity_groups.csv", candidate_rows, candidate_fields)
    _write_csv(output_dir / "conflicting_identity_groups.csv", conflict_rows, candidate_fields)
    _write_csv(
        output_dir / "unresolved_records.csv",
        unresolved_rows,
        [
            "source",
            "record_id",
            "season",
            "player_name",
            "normalized_name",
            "birth_year",
            "team_name",
            "existing_player_id",
            "reason",
        ],
    )

    print("Auditoria de identidad completada (solo lectura)")
    print(f"- Grupos seguros: {len(candidate_rows)}")
    print(f"- Grupos con conflicto de IDs: {len(conflict_rows)}")
    print(f"- Registros sin identidad completa: {len(unresolved_rows)}")
    print(f"- Resultados: {output_dir}")
    return summary


def main() -> None:
    parser = argparse.ArgumentParser(description="Audita la identidad de jugadores sin escribir datos.")
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=DEFAULT_OUTPUT_DIR,
        help=f"Directorio de salida (por defecto: {DEFAULT_OUTPUT_DIR})",
    )
    args = parser.parse_args()
    run_audit(args.output_dir)


if __name__ == "__main__":
    main()
