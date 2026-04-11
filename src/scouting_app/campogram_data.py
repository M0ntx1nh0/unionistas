from __future__ import annotations

from collections import Counter
from dataclasses import dataclass
from typing import Any
import re
import unicodedata

import pandas as pd
import streamlit as st

from src.scouting_app.google_sheets import read_google_worksheet


CAMPOGRAM_DISPLAY_ORDER = [
    "11 IDEAL PRIORIDADES",
    "11 IDEAL TOP",
    "11 IDEAL INTERNACIONAL",
    "11 IDEAL SUB'23 (2004-200X)",
    "11 IDEAL 2003",
    "11 IDEAL CAMPOGRAMA 2",
]

POSITION_LAYOUT = [
    ["POR 1"],
    ["LTD 2", "DFC 4", "DFC 5", "LTI 3"],
    ["MC 8", "MC 6"],
    ["ED 7", "DC/MP 10", "EI 11"],
    ["DC 9"],
]

POSITION_DISPLAY_ORDER = [position for row in POSITION_LAYOUT for position in row]

BASE_COLUMN_RENAMES = {
    "jugador": "jugador",
    "situacion_de_equipo": "situacion_equipo",
    "equipo_actual": "equipo_actual",
    "cedido": "cedido",
    "equipo_propietario": "equipo_propietario",
    "categoria": "categoria",
    "edad": "ano_nacimiento",
    "posicion": "posicion",
    "agente": "agente",
    "campograma": "campograma",
    "lateralidad": "lateralidad",
}

RESPONSES_COLUMN_RENAMES = {
    "nombre_del_jugador_visionado": "jugador",
    "nombre_del_scout": "scout",
    "equipo_en_el_que_juega": "equipo",
    "categoria": "categoria",
    "cesion": "cedido",
    "en_caso_de_cesion_indicar_club_propietario_del_jugador": "equipo_propietario",
    "en_que_campograma_se_incluye_el_jugador": "campograma",
    "posicion_demarcacion": "posicion",
    "valoracion": "valoracion",
    "valoracion_tecnico_tactica": "comentario_tecnico",
    "valoracion_fisica_condicional": "comentario_fisico",
    "valoracion_psicologica_actitudinal": "comentario_psicologico",
    "marca_temporal": "marca_temporal",
}

CATEGORY_COLORS = {
    "2ª DIV": {"background": "#ffd7df", "border": "#d9485f"},
    "1RFEF": {"background": "#dcffcf", "border": "#2f9e44"},
    "2RFEF": {"background": "#d5f5f5", "border": "#138a8a"},
    "3RFEF/DH/SE": {"background": "#ffe7c2", "border": "#f08c00"},
    "EXTRANJERO": {"background": "#fff3bf", "border": "#d4b000"},
    "OTRA": {"background": "#ececec", "border": "#8f8f8f"},
}

CONSENSUS_COLORS = {
    "Fichar": {"background": "#e8f8ec", "border": "#0f8a3b", "text": "#0f8a3b"},
    "Duda": {"background": "#fff7d6", "border": "#d4b000", "text": "#946c00"},
    "Seguir viendo": {"background": "#e9f0ff", "border": "#3b82f6", "text": "#2458b8"},
    "Descartar": {"background": "#ffe4dc", "border": "#d9480f", "text": "#b43b10"},
    "Sin consenso": {"background": "#f2ecff", "border": "#7b2cbf", "text": "#6b21a8"},
    "Sin informes": {"background": "#efefef", "border": "#8f8f8f", "text": "#666666"},
}

CONSENSUS_ORDER = {
    "Fichar": 0,
    "Duda": 1,
    "Seguir viendo": 2,
    "Descartar": 3,
    "Sin consenso": 4,
    "Sin informes": 5,
}


@dataclass(frozen=True)
class CampogramDataset:
    players: pd.DataFrame
    reports: pd.DataFrame


def _get_campogram_sheet_config() -> dict[str, str]:
    if "campogram_sheet" not in st.secrets:
        raise KeyError("Falta la clave 'campogram_sheet' en .streamlit/secrets.toml.")

    config = dict(st.secrets["campogram_sheet"])
    required_keys = [
        "spreadsheet_id",
        "responses_worksheet_name",
        "base_data_worksheet_name",
    ]
    missing = [key for key in required_keys if not config.get(key)]
    if missing:
        raise KeyError(f"Faltan claves en campogram_sheet: {', '.join(missing)}")
    return config


def _normalize_header_name(value: Any) -> str:
    text = str(value or "").replace("\n", " ").strip().lower()
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    text = re.sub(r"[^a-z0-9]+", "_", text)
    return text.strip("_")


def _normalize_generic_text(value: Any) -> str:
    text = str(value or "").strip()
    text = re.sub(r"\s+", " ", text)
    return text


def _normalize_lookup_key(value: Any) -> str:
    text = unicodedata.normalize("NFKD", _normalize_generic_text(value)).encode("ascii", "ignore").decode()
    text = text.lower()
    text = re.sub(r"[^a-z0-9]+", " ", text)
    return " ".join(text.split())


def _normalize_player_name(value: Any) -> str:
    return _normalize_lookup_key(value)


def _normalize_team_name(value: Any) -> str:
    text = _normalize_lookup_key(value)
    replacements = {
        "cf ": "",
        "fc ": "",
        "cd ": "",
        "ud ": "",
        "sd ": "",
        "rc ": "",
    }
    for source, target in replacements.items():
        if text.startswith(source):
            text = target + text[len(source):]
    return " ".join(text.split())


def _canonical_campogram(value: Any) -> str:
    normalized = _normalize_lookup_key(value)
    aliases = {
        "11 ideal prioridades": "11 IDEAL PRIORIDADES",
        "11 ideal prioridades 2": "11 IDEAL CAMPOGRAMA 2",
        "11 ideal top": "11 IDEAL TOP",
        "11 ideal extranjero": "11 IDEAL INTERNACIONAL",
        "11 ideal internacional": "11 IDEAL INTERNACIONAL",
        "11 ideal sub23": "11 IDEAL SUB'23 (2004-200X)",
        "11 ideal sub 23": "11 IDEAL SUB'23 (2004-200X)",
        "11 ideal sub 23 2004 200x": "11 IDEAL SUB'23 (2004-200X)",
        "11 ideal sub23 2004 200x": "11 IDEAL SUB'23 (2004-200X)",
        "11 ideal 2003": "11 IDEAL 2003",
        "11 ideal campograma 2": "11 IDEAL CAMPOGRAMA 2",
    }
    return aliases.get(normalized, _normalize_generic_text(value))


def _canonical_position(value: Any) -> str:
    normalized = _normalize_lookup_key(value).replace(" ", "")
    position_map = {
        "por1": "POR 1",
        "dfc4": "DFC 4",
        "dfc5": "DFC 5",
        "lti3": "LTI 3",
        "ltd2": "LTD 2",
        "mc6": "MC 6",
        "mc8": "MC 8",
        "dc9": "DC 9",
        "ed7": "ED 7",
        "ei11": "EI 11",
        "dcmp10": "DC/MP 10",
        "sdmp10": "DC/MP 10",
        "mp10": "DC/MP 10",
        "sd10": "DC/MP 10",
    }
    return position_map.get(normalized, _normalize_generic_text(value).upper())


def _canonical_verdict(value: Any) -> str:
    normalized = _normalize_lookup_key(value)
    verdict_map = {
        "fichar": "Fichar",
        "duda": "Duda",
        "seguir viendo": "Seguir viendo",
        "seguir valorando": "Seguir viendo",
        "descartar": "Descartar",
    }
    return verdict_map.get(normalized, _normalize_generic_text(value))


def _category_family(value: Any) -> str:
    normalized = _normalize_lookup_key(value)
    if not normalized:
        return "OTRA"
    if "2 division" in normalized or normalized == "2 div":
        return "2ª DIV"
    if "1 rfef" in normalized or "1a rfef" in normalized or "1 rfef grupo" in normalized:
        return "1RFEF"
    if "2 rfef" in normalized or "2a rfef" in normalized or "2 rfef grupo" in normalized:
        return "2RFEF"
    if "3rfef" in normalized or "3 rfef" in normalized or "dh" in normalized or "juvenil" in normalized or "division de honor" in normalized:
        return "3RFEF/DH/SE"
    if normalized in {"francia", "grecia"} or "extranjero" in normalized or "internacional" in normalized:
        return "EXTRANJERO"
    return "OTRA"


def load_campogram_base_data() -> pd.DataFrame:
    config = _get_campogram_sheet_config()
    df = read_google_worksheet(
        config["spreadsheet_id"],
        config["base_data_worksheet_name"],
    )
    if df.empty:
        return df

    rename_map = {
        column: BASE_COLUMN_RENAMES.get(_normalize_header_name(column), _normalize_header_name(column))
        for column in df.columns
    }
    df = df.rename(columns=rename_map)
    for column in df.columns:
        df[column] = df[column].map(_normalize_generic_text)

    if "ano_nacimiento" in df.columns:
        df["ano_nacimiento"] = pd.to_numeric(df["ano_nacimiento"], errors="coerce")

    return df.reset_index(drop=True)


def load_campogram_responses() -> pd.DataFrame:
    config = _get_campogram_sheet_config()
    df = read_google_worksheet(
        config["spreadsheet_id"],
        config["responses_worksheet_name"],
    )
    if df.empty:
        return df

    rename_map = {
        column: RESPONSES_COLUMN_RENAMES.get(_normalize_header_name(column), _normalize_header_name(column))
        for column in df.columns
    }
    df = df.rename(columns=rename_map)
    for column in df.columns:
        df[column] = df[column].map(_normalize_generic_text)

    if "marca_temporal" in df.columns:
        df["marca_temporal"] = pd.to_datetime(df["marca_temporal"], dayfirst=True, errors="coerce")
    return df.reset_index(drop=True)


def _build_player_consensus(reports_df: pd.DataFrame) -> tuple[str, str]:
    if reports_df.empty or "valoracion_canonica" not in reports_df.columns:
        return "Sin informes", "-"

    verdicts = reports_df["valoracion_canonica"].dropna()
    if verdicts.empty:
        return "Sin informes", "-"

    counts = verdicts.value_counts()
    highest = int(counts.iloc[0])
    top_verdicts = counts[counts == highest]
    if len(top_verdicts) > 1:
        detail = " / ".join(f"{verdict} ({count})" for verdict, count in top_verdicts.items())
        return "Sin consenso", detail

    winner = str(top_verdicts.index[0])
    return winner, f"{winner} ({highest})"


def build_campogram_dataset() -> CampogramDataset:
    base_df = load_campogram_base_data()
    responses_df = load_campogram_responses()

    if base_df.empty:
        return CampogramDataset(players=base_df, reports=pd.DataFrame())

    base_df = base_df.copy()
    base_df["row_order"] = range(len(base_df))
    base_df["jugador_normalizado"] = base_df["jugador"].apply(_normalize_player_name)
    base_df["equipo_actual_normalizado"] = base_df["equipo_actual"].apply(_normalize_team_name)
    base_df["campograma_canonico"] = base_df["campograma"].apply(_canonical_campogram)
    base_df["posicion_canonica"] = base_df["posicion"].apply(_canonical_position)
    base_df["categoria_familia"] = base_df["categoria"].apply(_category_family)
    base_df["player_row_id"] = base_df.index.astype(str)

    if responses_df.empty:
        players_df = base_df.copy()
        players_df["report_count"] = 0
        players_df["scout_count"] = 0
        players_df["consensus_label"] = "Sin informes"
        players_df["consensus_detail"] = "-"
        players_df["consensus_order"] = CONSENSUS_ORDER["Sin informes"]
        players_df["latest_report_at"] = pd.NaT
        players_df["latest_scout"] = ""
        players_df["scouts_list"] = ""
        players_df["report_positions"] = ""
        players_df["position_check"] = "Sin informes"
        return CampogramDataset(players=players_df, reports=responses_df)

    responses_df = responses_df.copy()
    responses_df["jugador_normalizado"] = responses_df["jugador"].apply(_normalize_player_name)
    responses_df["equipo_normalizado"] = responses_df["equipo"].apply(_normalize_team_name)
    responses_df["campograma_canonico"] = responses_df["campograma"].apply(_canonical_campogram)
    responses_df["posicion_canonica"] = responses_df["posicion"].apply(_canonical_position)
    responses_df["valoracion_canonica"] = responses_df["valoracion"].apply(_canonical_verdict)

    grouped_reports = {
        player_key: group.copy()
        for player_key, group in responses_df.groupby("jugador_normalizado")
    }

    matched_reports: list[pd.DataFrame] = []
    summaries: list[dict[str, Any]] = []

    for _, player_row in base_df.iterrows():
        player_reports = grouped_reports.get(player_row["jugador_normalizado"], pd.DataFrame()).copy()

        if not player_reports.empty and player_row["equipo_actual_normalizado"]:
            exact_team_reports = player_reports[
                player_reports["equipo_normalizado"] == player_row["equipo_actual_normalizado"]
            ]
            if not exact_team_reports.empty:
                player_reports = exact_team_reports

        if not player_reports.empty and player_row["campograma_canonico"]:
            exact_campogram_reports = player_reports[
                player_reports["campograma_canonico"] == player_row["campograma_canonico"]
            ]
            if not exact_campogram_reports.empty:
                player_reports = exact_campogram_reports

        if not player_reports.empty:
            player_reports = player_reports.sort_values("marca_temporal", ascending=False)
            player_reports["player_row_id"] = player_row["player_row_id"]
            matched_reports.append(player_reports)

        consensus_label, consensus_detail = _build_player_consensus(player_reports)
        latest_report = player_reports.iloc[0] if not player_reports.empty else pd.Series(dtype="object")
        report_positions = (
            sorted({str(value).strip() for value in player_reports["posicion_canonica"].dropna() if str(value).strip()})
            if not player_reports.empty
            else []
        )
        if not report_positions:
            position_check = "Sin informes"
        elif report_positions == [player_row["posicion_canonica"]]:
            position_check = "Coincide"
        else:
            position_check = "Revisar"

        scouts = (
            sorted({str(value).strip() for value in player_reports["scout"].dropna() if str(value).strip()})
            if not player_reports.empty
            else []
        )
        summaries.append(
            {
                "player_row_id": player_row["player_row_id"],
                "report_count": int(len(player_reports)),
                "scout_count": len(scouts),
                "consensus_label": consensus_label,
                "consensus_detail": consensus_detail,
                "consensus_order": CONSENSUS_ORDER.get(consensus_label, 99),
                "latest_report_at": latest_report.get("marca_temporal"),
                "latest_scout": str(latest_report.get("scout") or ""),
                "scouts_list": " | ".join(scouts),
                "report_positions": " | ".join(report_positions),
                "position_check": position_check,
            }
        )

    summary_df = pd.DataFrame(summaries)
    players_df = base_df.merge(summary_df, on="player_row_id", how="left")
    players_df["report_count"] = players_df["report_count"].fillna(0).astype(int)
    players_df["scout_count"] = players_df["scout_count"].fillna(0).astype(int)
    players_df["consensus_label"] = players_df["consensus_label"].fillna("Sin informes")
    players_df["consensus_detail"] = players_df["consensus_detail"].fillna("-")
    players_df["consensus_order"] = (
        players_df["consensus_order"].fillna(CONSENSUS_ORDER["Sin informes"]).astype(int)
    )
    players_df["latest_scout"] = players_df["latest_scout"].fillna("")
    players_df["scouts_list"] = players_df["scouts_list"].fillna("")
    players_df["report_positions"] = players_df["report_positions"].fillna("")
    players_df["position_check"] = players_df["position_check"].fillna("Sin informes")

    reports_df = pd.concat(matched_reports, ignore_index=True) if matched_reports else pd.DataFrame()
    return CampogramDataset(players=players_df, reports=reports_df)


def get_campogram_ordered_names(players_df: pd.DataFrame) -> list[str]:
    available = players_df["campograma_canonico"].dropna().unique().tolist() if not players_df.empty else []
    ordered = [name for name in CAMPOGRAM_DISPLAY_ORDER if name in available]
    remaining = sorted(name for name in available if name not in ordered)
    return ordered + remaining


def get_position_blocks(players_df: pd.DataFrame, campogram_name: str) -> dict[str, pd.DataFrame]:
    campogram_df = players_df[players_df["campograma_canonico"] == campogram_name].copy()
    blocks: dict[str, pd.DataFrame] = {}
    for position in POSITION_DISPLAY_ORDER:
        position_df = campogram_df[campogram_df["posicion_canonica"] == position].copy()
        if position_df.empty:
            continue
        blocks[position] = position_df.sort_values(["row_order", "consensus_order", "jugador"])

    extra_positions = sorted(
        position for position in campogram_df["posicion_canonica"].dropna().unique().tolist()
        if position not in POSITION_DISPLAY_ORDER
    )
    for position in extra_positions:
        position_df = campogram_df[campogram_df["posicion_canonica"] == position].copy()
        if position_df.empty:
            continue
        blocks[position] = position_df.sort_values(["row_order", "consensus_order", "jugador"])

    return blocks


def get_category_style(category_family: str) -> dict[str, str]:
    return CATEGORY_COLORS.get(category_family, CATEGORY_COLORS["OTRA"])


def get_consensus_style(consensus_label: str) -> dict[str, str]:
    return CONSENSUS_COLORS.get(consensus_label, CONSENSUS_COLORS["Sin informes"])


def summarize_campogram(players_df: pd.DataFrame, campogram_name: str, reports_df: pd.DataFrame) -> dict[str, Any]:
    scoped_players = players_df[players_df["campograma_canonico"] == campogram_name].copy()
    scoped_ids = set(scoped_players["player_row_id"].astype(str))
    scoped_reports = (
        reports_df[reports_df["player_row_id"].astype(str).isin(scoped_ids)].copy()
        if not reports_df.empty
        else pd.DataFrame()
    )

    consensus_counter = Counter(scoped_players["consensus_label"].dropna())
    scouts = (
        sorted({str(value).strip() for value in scoped_reports["scout"].dropna() if str(value).strip()})
        if not scoped_reports.empty
        else []
    )
    return {
        "players": int(len(scoped_players)),
        "players_with_reports": int((scoped_players["report_count"] > 0).sum()),
        "scouts": len(scouts),
        "with_consensus": int(scoped_players["consensus_label"].isin(["Fichar", "Duda", "Seguir viendo", "Descartar"]).sum()),
        "sin_consenso": int(consensus_counter.get("Sin consenso", 0)),
        "fichar": int(consensus_counter.get("Fichar", 0)),
        "duda": int(consensus_counter.get("Duda", 0)),
        "seguir_viendo": int(consensus_counter.get("Seguir viendo", 0)),
        "descartar": int(consensus_counter.get("Descartar", 0)),
        "sin_informes": int(consensus_counter.get("Sin informes", 0)),
    }
