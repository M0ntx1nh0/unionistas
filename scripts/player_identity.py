"""Utilidades para asignar identidades internas estables durante los syncs."""

from __future__ import annotations

from typing import Any


PAGE_SIZE = 1_000
WRITE_BATCH_SIZE = 500


def _valid_birth_year(value: Any) -> int | None:
    try:
        year = int(value)
    except (TypeError, ValueError):
        return None
    return year if 1900 <= year <= 2100 else None


def _fetch_player_ids(client: Any) -> dict[tuple[str, int], str]:
    player_ids: dict[tuple[str, int], str] = {}
    offset = 0

    while True:
        response = (
            client.table("players")
            .select("id,normalized_name,birth_year")
            .range(offset, offset + PAGE_SIZE - 1)
            .execute()
        )
        rows = response.data or []
        for row in rows:
            normalized_name = str(row.get("normalized_name") or "").strip()
            birth_year = _valid_birth_year(row.get("birth_year"))
            if normalized_name and birth_year is not None:
                player_ids[(normalized_name, birth_year)] = str(row["id"])

        if len(rows) < PAGE_SIZE:
            break
        offset += PAGE_SIZE

    return player_ids


def attach_player_ids(
    client: Any,
    payloads: list[dict[str, Any]],
    *,
    name_field: str = "player_name",
    normalized_field: str = "normalized_player_name",
    birth_year_field: str = "birth_year",
) -> tuple[int, int, int]:
    """Asigna ``player_id`` por nombre normalizado y ano de nacimiento.

    Las identidades nuevas solo se crean cuando ambos datos estan presentes.
    Devuelve: enlazados, identidades creadas y pendientes de revision.
    """

    player_ids = _fetch_player_ids(client)
    missing_by_key: dict[tuple[str, int], dict[str, Any]] = {}

    for payload in payloads:
        normalized_name = str(payload.get(normalized_field) or "").strip()
        birth_year = _valid_birth_year(payload.get(birth_year_field))
        if not normalized_name or birth_year is None:
            continue

        key = (normalized_name, birth_year)
        if key in player_ids or key in missing_by_key:
            continue

        missing_by_key[key] = {
            "canonical_name": str(payload.get(name_field) or normalized_name).strip(),
            "normalized_name": normalized_name,
            "birth_year": birth_year,
            "nationality": payload.get("nationality"),
            "primary_position": payload.get("position"),
            "secondary_position": payload.get("secondary_position"),
            "foot": payload.get("foot"),
            "identity_status": "canonical",
        }

    missing_rows = list(missing_by_key.values())
    for start in range(0, len(missing_rows), WRITE_BATCH_SIZE):
        client.table("players").upsert(
            missing_rows[start : start + WRITE_BATCH_SIZE],
            on_conflict="normalized_name,birth_year",
            ignore_duplicates=True,
        ).execute()

    if missing_rows:
        player_ids = _fetch_player_ids(client)

    linked = 0
    pending = 0
    for payload in payloads:
        normalized_name = str(payload.get(normalized_field) or "").strip()
        birth_year = _valid_birth_year(payload.get(birth_year_field))
        player_id = player_ids.get((normalized_name, birth_year)) if birth_year is not None else None
        if player_id:
            payload["player_id"] = player_id
            linked += 1
        else:
            pending += 1

    return linked, len(missing_rows), pending
