from __future__ import annotations

from collections import Counter
import unicodedata
from typing import Any

import pandas as pd

from src.scouting_app.google_sheets import read_google_sheet


COLUMN_RENAMES = {
    "Nombre del Jugador": "nombre_jugador",
    "Ojeador": "ojeador",
    "Año de Nacimiento": "ano_nacimiento",
    "Lugar de Nacimiento": "lugar_nacimiento",
    "Nacionalidad": "nacionalidad",
    "Demarcación": "demarcacion",
    "Lateralidad": "lateralidad",
    "Equipo": "equipo",
    "Competición": "competicion",
    "Jornada Nº": "jornada_numero",
    "Partido Visionado": "partido_visionado",
    "Visualización": "visualizacion",
    "Aspectos Positivos": "aspectos_positivos",
    "Aspectos Negativos": "aspectos_negativos",
    "Capacidades Técnicas": "capacidades_tecnicas",
    "Capacidades Tácticas - Psicológicas": "capacidades_tacticas_psicologicas",
    "Capacidades Físicas": "capacidades_fisicas",
    "Representante - Agencia": "representante_agencia",
    "Año finalización contrato": "ano_fin_contrato",
    "En Propiedad o Cesión": "situacion_contractual",
    "Número de veces visto por el mismo Scout": "veces_visto_mismo_scout",
    "Veredicto": "veredicto",
    "Marca temporal": "marca_temporal",
}


def _normalize_column_name(name: str) -> str:
    normalized = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
    normalized = normalized.strip().lower().replace(" - ", "_").replace(" ", "_")
    return normalized.replace("º", "").replace("__", "_")


def _normalize_text(value: Any) -> Any:
    if isinstance(value, str):
        clean = value.strip()
        return None if clean in {"", "-", "N/D"} else clean
    return value


def _split_positions(value: Any) -> tuple[str | None, list[str]]:
    if not isinstance(value, str):
        return None, []

    positions = [item.strip() for item in value.split(",") if item.strip()]
    if not positions:
        return None, []

    return positions[0], positions[1:]


def _normalize_capability_token(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode()
    return " ".join(normalized.lower().strip().split())


def _display_capability_token(value: str) -> str:
    cleaned = " ".join(value.strip().split())
    return cleaned[:1].upper() + cleaned[1:] if cleaned else cleaned


def load_scouting_reports() -> pd.DataFrame:
    df = read_google_sheet()

    if df.empty:
        return df

    df.columns = [column.strip() for column in df.columns]
    rename_map = {
        column: COLUMN_RENAMES.get(column, _normalize_column_name(column))
        for column in df.columns
    }
    df = df.rename(columns=rename_map)
    df = df.map(_normalize_text)

    if "demarcacion" in df.columns:
        split_positions = df["demarcacion"].apply(_split_positions)
        df["demarcacion_principal"] = split_positions.apply(lambda item: item[0])
        df["demarcacion_secundaria"] = split_positions.apply(
            lambda item: ", ".join(item[1]) if item[1] else None
        )
        df["demarcacion_secundaria_lista"] = split_positions.apply(lambda item: item[1])

    for numeric_column in ["ano_nacimiento", "jornada_numero", "veces_visto_mismo_scout"]:
        if numeric_column in df.columns:
            df[numeric_column] = pd.to_numeric(df[numeric_column], errors="coerce")

    if "marca_temporal" in df.columns:
        df["marca_temporal"] = pd.to_datetime(
            df["marca_temporal"],
            dayfirst=True,
            errors="coerce",
        )

    if "ano_fin_contrato" in df.columns:
        df["ano_fin_contrato"] = pd.to_datetime(
            df["ano_fin_contrato"],
            dayfirst=True,
            errors="coerce",
        )

    if "marca_temporal" in df.columns:
        return df.sort_values("marca_temporal", ascending=False, na_position="last")
    return df


def filter_reports(df: pd.DataFrame, filters: dict[str, Any]) -> pd.DataFrame:
    filtered = df.copy()

    if filters["player"] != "Todos":
        filtered = filtered[filtered["nombre_jugador"] == filters["player"]]
    if filters["scouts"]:
        filtered = filtered[filtered["ojeador"].isin(filters["scouts"])]
    if filters["primary_positions"]:
        filtered = filtered[
            filtered["demarcacion_principal"].isin(filters["primary_positions"])
        ]
    if filters["secondary_positions"]:
        secondary_filters = [value for value in filters["secondary_positions"] if value != "Ninguna"]
        include_none = "Ninguna" in filters["secondary_positions"]
        filtered = filtered[
            filtered["demarcacion_secundaria_lista"].apply(
                lambda positions: (
                    (include_none and not (positions or []))
                    or any(position in (positions or []) for position in secondary_filters)
                )
            )
        ]
    if filters["teams"]:
        filtered = filtered[filtered["equipo"].isin(filters["teams"])]
    if filters["competitions"]:
        filtered = filtered[filtered["competicion"].isin(filters["competitions"])]
    if filters["verdicts"]:
        filtered = filtered[filtered["veredicto"].isin(filters["verdicts"])]

    return filtered


def build_player_summary(player_df: pd.DataFrame) -> dict[str, str | int]:
    latest = player_df.sort_values("marca_temporal", ascending=False).iloc[0]
    verdict_series = (
        player_df["veredicto"].dropna()
        if "veredicto" in player_df.columns
        else pd.Series(dtype="object")
    )
    latest_verdict = latest.get("veredicto") or "Sin veredicto"
    consensus_label = "Sin veredicto"
    consensus_detail = "-"

    if not verdict_series.empty:
        verdict_counts = verdict_series.value_counts()
        highest_count = int(verdict_counts.iloc[0])
        top_verdicts = verdict_counts[verdict_counts == highest_count]

        if len(top_verdicts) == 1:
            consensus_label = str(top_verdicts.index[0])
            consensus_detail = f"{consensus_label} ({highest_count})"
        else:
            consensus_label = "Sin consenso"
            consensus_detail = " / ".join(
                f"{verdict} ({count})" for verdict, count in top_verdicts.items()
            )

    last_seen = latest["marca_temporal"]
    last_seen_str = last_seen.strftime("%d/%m/%Y") if pd.notna(last_seen) else "-"

    verdict_scouts: list[str] = []
    if {"veredicto", "ojeador"}.issubset(player_df.columns):
        verdict_groups = (
            player_df.dropna(subset=["veredicto"])
            .groupby("veredicto")["ojeador"]
            .apply(lambda scouts: sorted({str(scout).strip() for scout in scouts if str(scout).strip()}))
        )
        verdict_scouts = [
            f"{verdict}: {', '.join(scouts)}"
            for verdict, scouts in verdict_groups.items()
            if scouts
        ]

    primary_position_label = latest.get("demarcacion_principal") or latest.get("demarcacion") or "-"
    position_scouts: list[str] = []
    if {"demarcacion_principal", "ojeador"}.issubset(player_df.columns):
        position_groups = (
            player_df.dropna(subset=["demarcacion_principal"])
            .groupby("demarcacion_principal")["ojeador"]
            .apply(lambda scouts: sorted({str(scout).strip() for scout in scouts if str(scout).strip()}))
        )
        position_scouts = [
            f"{position}: {', '.join(scouts)}"
            for position, scouts in position_groups.items()
            if scouts
        ]

    return {
        "times_seen": int(len(player_df)),
        "latest_verdict": latest_verdict,
        "consensus_label": consensus_label,
        "consensus_detail": consensus_detail,
        "verdict_scouts": " | ".join(verdict_scouts) if verdict_scouts else "-",
        "last_seen": last_seen_str,
        "team": latest.get("equipo") or "-",
        "competition": latest.get("competicion") or "-",
        "position": latest.get("demarcacion") or "-",
        "primary_position": primary_position_label,
        "position_scouts": " | ".join(position_scouts) if position_scouts else "-",
        "birth_year": (
            str(int(latest["ano_nacimiento"]))
            if pd.notna(latest.get("ano_nacimiento"))
            else "-"
        ),
        "nationality": latest.get("nacionalidad") or "-",
        "foot": latest.get("lateralidad") or "-",
    }


def summarize_repeated_capabilities(player_df: pd.DataFrame) -> dict[str, list[tuple[str, int]]]:
    capability_columns = {
        "tecnicas": "capacidades_tecnicas",
        "tacticas_psicologicas": "capacidades_tacticas_psicologicas",
        "fisicas": "capacidades_fisicas",
    }
    summary: dict[str, list[tuple[str, int]]] = {}

    for summary_key, column in capability_columns.items():
        if column not in player_df.columns:
            summary[summary_key] = []
            continue

        counter: Counter[str] = Counter()
        display_names: dict[str, str] = {}
        for raw_value in player_df[column].dropna():
            if not isinstance(raw_value, str):
                continue
            for token in raw_value.split(","):
                cleaned = token.strip()
                if not cleaned:
                    continue
                normalized = _normalize_capability_token(cleaned)
                if not normalized:
                    continue
                counter[normalized] += 1
                display_names.setdefault(normalized, _display_capability_token(cleaned))

        repeated = [
            (display_names[key], count)
            for key, count in counter.items()
            if count >= 2
        ]
        repeated.sort(key=lambda item: (-item[1], item[0]))
        summary[summary_key] = repeated

    return summary
