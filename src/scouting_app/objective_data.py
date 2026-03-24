from __future__ import annotations

from difflib import SequenceMatcher
from io import BytesIO
from pathlib import Path
import re
import unicodedata
from typing import Any, Literal

import pandas as pd
from google.auth.transport.requests import Request
import requests
import streamlit as st

from src.scouting_app.google_sheets import get_google_credentials


RAW_DATA_DIR = Path("data/raw")
CONFIG_DATA_DIR = Path("data/config")
ALL_OBJECTIVE_DATASET = "all_objective"
DEFAULT_OBJECTIVE_DATASET = ALL_OBJECTIVE_DATASET
RADAR_CONFIG_PATH = CONFIG_DATA_DIR / "radar_metrics.csv"
OBJECTIVE_DATASETS = {
    "1rfef_2025_26": RAW_DATA_DIR / "1RFEF_2025-26.csv",
    "2rfef_2025_26": RAW_DATA_DIR / "2RFEF_2025-26.csv",
}
OBJECTIVE_DRIVE_FILE_IDS = {
    "1rfef_2025_26": "1Tdg0EUwLMALqoF4JaHJECf0b4IPkWgvN",
    "2rfef_2025_26": "1Sbwh_wPdr5F4T8NpM26pTniZ44DZCyGF",
}
OBJECTIVE_DRIVE_API_TEMPLATE = "https://www.googleapis.com/drive/v3/files/{file_id}?alt=media"

OBJECTIVE_ACTIVE_COLUMNS = [
    "id",
    "name",
    "full_name",
    "age",
    "birth_date",
    "birth_country_name",
    "passport_country_names",
    "image",
    "current_team_name",
    "domestic_competition_name",
    "current_team_logo",
    "current_team_color",
    "last_club_name",
    "contract_expires",
    "market_value",
    "on_loan",
    "positions",
    "primary_position",
    "secondary_position",
    "third_position",
    "foot",
    "height",
    "weight",
    "minutes_on_field",
    "total_matches",
    "goals",
    "goals_avg",
    "non_penalty_goal",
    "non_penalty_goal_avg",
    "assists",
    "assists_avg",
    "shots",
    "shots_avg",
    "xg_shot",
    "xg_shot_avg",
    "xg_assist",
    "xg_assist_avg",
    "xg_per_shot",
    "touch_in_box_avg",
    "passes_avg",
    "accurate_passes_percent",
    "forward_passes_avg",
    "successful_forward_passes_percent",
    "passes_to_final_third_avg",
    "accurate_passes_to_final_third_percent",
    "through_passes_avg",
    "successful_through_passes_percent",
    "smart_passes_avg",
    "accurate_smart_passes_percent",
    "progressive_pass_avg",
    "successful_progressive_pass_percent",
    "dribbles_avg",
    "successful_dribbles_percent",
    "accelerations_avg",
    "progressive_run_avg",
    "duels_avg",
    "duels_won",
    "offensive_duels_avg",
    "offensive_duels_won",
    "defensive_duels_avg",
    "defensive_duels_won",
    "aerial_duels_avg",
    "aerial_duels_won",
    "successful_defensive_actions_avg",
    "tackle_avg",
    "interceptions_avg",
    "shot_block_avg",
    "fouls_avg",
    "foul_suffered_avg",
    "yellow_cards",
    "red_cards",
    "conceded_goals",
    "shots_against",
    "clean_sheets",
    "save_percent",
    "prevented_goals",
    "xg_save",
    "xg_save_avg",
    "prevented_goals_avg",
    "back_pass_to_gk_avg",
    "goalkeeper_exits_avg",
    "gk_aerial_duels_avg",
]

OBJECTIVE_VISIBLE_METRICS = [
    "minutes_on_field",
    "total_matches",
    "goals_avg",
    "assists_avg",
    "xg_shot_avg",
    "xg_assist_avg",
    "xg_per_shot",
    "shots_avg",
    "touch_in_box_avg",
    "passes_avg",
    "accurate_passes_percent",
    "progressive_pass_avg",
    "successful_progressive_pass_percent",
    "dribbles_avg",
    "successful_dribbles_percent",
    "progressive_run_avg",
    "duels_avg",
    "duels_won",
    "defensive_duels_avg",
    "defensive_duels_won",
    "aerial_duels_avg",
    "aerial_duels_won",
    "successful_defensive_actions_avg",
    "interceptions_avg",
    "shot_block_avg",
    "xg_save_avg",
    "prevented_goals_avg",
    "back_pass_to_gk_avg",
    "goalkeeper_exits_avg",
    "gk_aerial_duels_avg",
]

TEXT_COLUMNS = [
    "name",
    "full_name",
    "birth_country_name",
    "passport_country_names",
    "image",
    "current_team_name",
    "domestic_competition_name",
    "current_team_logo",
    "current_team_color",
    "last_club_name",
    "positions",
    "primary_position",
    "secondary_position",
    "third_position",
    "foot",
]

DATE_COLUMNS = ["birth_date", "contract_expires"]
BOOL_COLUMNS = ["on_loan"]

NUMERIC_COLUMNS = [
    "id",
    "age",
    "market_value",
    "height",
    "weight",
    "minutes_on_field",
    "total_matches",
    "goals",
    "goals_avg",
    "non_penalty_goal",
    "non_penalty_goal_avg",
    "assists",
    "assists_avg",
    "shots",
    "shots_avg",
    "xg_shot",
    "xg_shot_avg",
    "xg_assist",
    "xg_assist_avg",
    "xg_per_shot",
    "touch_in_box_avg",
    "passes_avg",
    "accurate_passes_percent",
    "forward_passes_avg",
    "successful_forward_passes_percent",
    "passes_to_final_third_avg",
    "accurate_passes_to_final_third_percent",
    "through_passes_avg",
    "successful_through_passes_percent",
    "smart_passes_avg",
    "accurate_smart_passes_percent",
    "progressive_pass_avg",
    "successful_progressive_pass_percent",
    "dribbles_avg",
    "successful_dribbles_percent",
    "accelerations_avg",
    "progressive_run_avg",
    "duels_avg",
    "duels_won",
    "offensive_duels_avg",
    "offensive_duels_won",
    "defensive_duels_avg",
    "defensive_duels_won",
    "aerial_duels_avg",
    "aerial_duels_won",
    "successful_defensive_actions_avg",
    "tackle_avg",
    "interceptions_avg",
    "shot_block_avg",
    "fouls_avg",
    "foul_suffered_avg",
    "yellow_cards",
    "red_cards",
    "conceded_goals",
    "shots_against",
    "clean_sheets",
    "save_percent",
    "prevented_goals",
    "xg_save",
    "xg_save_avg",
    "prevented_goals_avg",
    "back_pass_to_gk_avg",
    "goalkeeper_exits_avg",
    "gk_aerial_duels_avg",
]

POSITION_CODE_COLUMNS = ["primary_position", "secondary_position", "third_position"]

POSITION_LABELS = {
    "GK": "Portero",
    "CB": "Central",
    "RCB": "Central Derecho",
    "LCB": "Central Izquierdo",
    "RB": "Lateral Derecho",
    "LB": "Lateral Izquierdo",
    "RWB": "Carrilero Derecho",
    "LWB": "Carrilero Izquierdo",
    "DMF": "Pivote",
    "CMF": "Mediocentro",
    "RCMF": "Mediocentro",
    "LCMF": "Mediocentro",
    "AMF": "Mediapunta",
    "RAMF": "Mediapunta",
    "LAMF": "Mediapunta",
    "RW": "Extremo Derecho",
    "RWF": "Extremo Derecho",
    "LW": "Extremo Izquierdo",
    "LWF": "Extremo Izquierdo",
    "CF": "Delantero Centro",
    "SS": "Segundo punta",
}

TEAM_STOPWORDS = {
    "cf",
    "ud",
    "cd",
    "sd",
    "rc",
    "fc",
    "club",
    "real",
    "de",
    "la",
    "el",
    "los",
    "las",
}

RADAR_GROUP_BY_POSITION = {
    "Delantero Centro": "delantero",
    "Segundo punta": "delantero",
    "Extremo Derecho": "extremo_mediapunta",
    "Extremo Izquierdo": "extremo_mediapunta",
    "Mediapunta": "extremo_mediapunta",
    "Mediocentro": "mediocentro_pivote",
    "Pivote": "mediocentro_pivote",
    "Interior": "mediocentro_pivote",
    "Interior derecho": "mediocentro_pivote",
    "Interior izquierdo": "mediocentro_pivote",
    "Central": "central",
    "Central Derecho": "central",
    "Central Izquierdo": "central",
    "Central del centro": "central",
    "Lateral Derecho": "lateral_carrilero",
    "Lateral Izquierdo": "lateral_carrilero",
    "Carrilero Derecho": "lateral_carrilero",
    "Carrilero Izquierdo": "lateral_carrilero",
    "Portero": "portero",
}

POSITION_FAMILY_BY_LABEL = {
    "Portero": "Portero",
    "Central": "Defensa",
    "Central Derecho": "Defensa",
    "Central Izquierdo": "Defensa",
    "Central del centro": "Defensa",
    "Lateral Derecho": "Defensa",
    "Lateral Izquierdo": "Defensa",
    "Carrilero Derecho": "Defensa",
    "Carrilero Izquierdo": "Defensa",
    "Pivote": "Centrocampista",
    "Mediocentro": "Centrocampista",
    "Mediapunta": "Centrocampista",
    "Interior": "Centrocampista",
    "Interior derecho": "Centrocampista",
    "Interior izquierdo": "Centrocampista",
    "Delantero Centro": "Delantero",
    "Segundo punta": "Delantero",
    "Extremo Derecho": "Delantero",
    "Extremo Izquierdo": "Delantero",
}

PANEL_METRICS_BY_GROUP = {
    "delantero": [
    "minutes_on_field",
    "total_matches",
    "goals_avg",
    "non_penalty_goal_avg",
    "xg_shot_avg",
    "shots_avg",
    "assists_avg",
    "xg_assist_avg",
    "xg_per_shot",
        "touch_in_box_avg",
        "passes_avg",
        "passes_to_final_third_avg",
        "progressive_pass_avg",
        "aerial_duels_won",
    ],
    "extremo_mediapunta": [
        "minutes_on_field",
        "total_matches",
    "goals_avg",
    "xg_shot_avg",
    "assists_avg",
    "xg_assist_avg",
    "xg_per_shot",
    "shots_avg",
        "touch_in_box_avg",
        "dribbles_avg",
        "progressive_run_avg",
        "passes_avg",
        "passes_to_final_third_avg",
        "progressive_pass_avg",
    ],
    "mediocentro_pivote": [
        "minutes_on_field",
        "total_matches",
    "assists_avg",
    "xg_assist_avg",
    "xg_per_shot",
    "shots_avg",
    "touch_in_box_avg",
        "passes_avg",
        "accurate_passes_percent",
        "forward_passes_avg",
        "passes_to_final_third_avg",
        "progressive_pass_avg",
        "interceptions_avg",
        "successful_defensive_actions_avg",
    ],
    "central": [
        "minutes_on_field",
        "total_matches",
    "goals_avg",
    "non_penalty_goal_avg",
    "xg_per_shot",
    "shots_avg",
    "passes_avg",
        "accurate_passes_percent",
        "forward_passes_avg",
        "passes_to_final_third_avg",
        "progressive_pass_avg",
        "defensive_duels_won",
        "aerial_duels_won",
        "interceptions_avg",
    ],
    "lateral_carrilero": [
        "minutes_on_field",
        "total_matches",
    "goals_avg",
    "xg_shot_avg",
    "assists_avg",
    "xg_assist_avg",
    "xg_per_shot",
    "shots_avg",
        "touch_in_box_avg",
        "dribbles_avg",
        "progressive_run_avg",
        "passes_avg",
        "passes_to_final_third_avg",
        "progressive_pass_avg",
    ],
    "portero": [
        "minutes_on_field",
        "total_matches",
        "save_percent",
        "clean_sheets",
        "conceded_goals",
        "shots_against",
        "prevented_goals",
        "prevented_goals_avg",
        "xg_save_avg",
        "passes_avg",
        "accurate_passes_percent",
        "goalkeeper_exits_avg",
    ],
}


def _normalize_lookup_value(value: Any) -> str:
    if value is None or pd.isna(value):
        return ""
    text = str(value).strip().lower()
    if text in {"", "nan", "none", "no disponible"}:
        return ""
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def _similarity(left: Any, right: Any) -> float:
    normalized_left = _normalize_lookup_value(left)
    normalized_right = _normalize_lookup_value(right)
    if not normalized_left or not normalized_right:
        return 0.0
    return SequenceMatcher(None, normalized_left, normalized_right).ratio()


def _token_based_similarity(left: Any, right: Any) -> float:
    normalized_left = _normalize_lookup_value(left)
    normalized_right = _normalize_lookup_value(right)
    if not normalized_left or not normalized_right:
        return 0.0

    left_tokens = normalized_left.split()
    right_tokens = normalized_right.split()
    if not left_tokens or not right_tokens:
        return 0.0

    left_set = set(left_tokens)
    right_set = set(right_tokens)
    overlap = len(left_set & right_set)
    return overlap / max(1, min(len(left_set), len(right_set)))


def _normalize_team_value(value: Any) -> str:
    normalized = _normalize_lookup_value(value)
    if not normalized:
        return ""

    normalized = re.sub(r"[^a-z0-9\s]", " ", normalized)
    normalized = re.sub(r"\s+", " ", normalized).strip()
    tokens = [token for token in normalized.split() if token not in TEAM_STOPWORDS]
    return " ".join(tokens).strip()


def _team_similarity(left: Any, right: Any) -> float:
    normalized_left = _normalize_team_value(left)
    normalized_right = _normalize_team_value(right)
    if not normalized_left or not normalized_right:
        return 0.0
    if normalized_left == normalized_right:
        return 1.0
    if normalized_left in normalized_right or normalized_right in normalized_left:
        return 0.95
    return max(
        SequenceMatcher(None, normalized_left, normalized_right).ratio(),
        _token_based_similarity(normalized_left, normalized_right),
    )


def _name_similarity(objective_full_name: Any, objective_short_name: Any, scouting_name: Any) -> float:
    candidates = [
        _similarity(objective_full_name, scouting_name),
        _similarity(objective_short_name, scouting_name),
        _token_based_similarity(objective_full_name, scouting_name),
        _token_based_similarity(objective_short_name, scouting_name),
    ]
    return max(candidates)


def _clean_text(value: Any) -> str:
    if value is None or pd.isna(value):
        return "No disponible"
    cleaned = re.sub(r"\s+", " ", str(value).strip())
    if not cleaned or cleaned.lower() == "unknown":
        return "No disponible"
    return cleaned


def _clean_position_code(value: Any) -> str:
    cleaned = _clean_text(value)
    if cleaned == "No disponible":
        return cleaned
    return re.sub(r"\d+$", "", cleaned.upper()).strip()


def _position_label(code: Any) -> str:
    clean_code = _clean_position_code(code)
    return POSITION_LABELS.get(clean_code, clean_code.title() if clean_code != "No disponible" else clean_code)


def _clean_positions_field(value: Any) -> str:
    cleaned = _clean_text(value)
    if cleaned == "No disponible":
        return cleaned
    codes = [_clean_position_code(item) for item in cleaned.split("|") if item.strip()]
    return " | ".join(code for code in codes if code and code != "No disponible") or "No disponible"


def _drop_duplicate_suffix_columns(df: pd.DataFrame) -> tuple[pd.DataFrame, list[str]]:
    duplicate_columns: list[str] = []
    columns_to_drop: list[str] = []
    for column in df.columns:
        if column.endswith(".1") and column[:-2] in df.columns:
            duplicate_columns.append(column)
            columns_to_drop.append(column)
    if columns_to_drop:
        df = df.drop(columns=columns_to_drop)
    return df, duplicate_columns


def _drop_empty_and_zero_columns(df: pd.DataFrame) -> tuple[pd.DataFrame, list[str]]:
    dropped_columns: list[str] = []
    for column in list(df.columns):
        series = df[column]
        if column in NUMERIC_COLUMNS:
            numeric_series = pd.to_numeric(series, errors="coerce").fillna(0)
            if numeric_series.eq(0).all():
                dropped_columns.append(column)
                df = df.drop(columns=[column])
        else:
            normalized = series.map(_normalize_lookup_value)
            if normalized.eq("").all():
                dropped_columns.append(column)
                df = df.drop(columns=[column])
    return df, dropped_columns


def _resolve_local_dataset_path(dataset: str, local_path: str | Path | None) -> Path:
    if local_path is not None:
        return Path(local_path)
    if dataset not in OBJECTIVE_DATASETS:
        raise KeyError(f"Dataset objetivo no soportado: {dataset}")
    return OBJECTIVE_DATASETS[dataset]


def _get_objective_data_config() -> dict[str, str]:
    if "objective_data" not in st.secrets:
        return {}
    return {str(key): str(value) for key, value in dict(st.secrets["objective_data"]).items()}


def _resolve_objective_data_source(source: Literal["local", "drive"] | None) -> Literal["local", "drive"]:
    if source is not None:
        return source
    config = _get_objective_data_config()
    configured_source = str(config.get("source", "local")).strip().lower()
    if configured_source == "drive":
        return "drive"
    return "local"


def _resolve_drive_file_id(dataset: str) -> str:
    config = _get_objective_data_config()
    secret_key_map = {
        "1rfef_2025_26": "rfef_1_file_id",
        "2rfef_2025_26": "rfef_2_file_id",
    }
    secret_key = secret_key_map.get(dataset)
    if secret_key and config.get(secret_key):
        return config[secret_key]
    if dataset in OBJECTIVE_DRIVE_FILE_IDS:
        return OBJECTIVE_DRIVE_FILE_IDS[dataset]
    raise KeyError(f"No hay file_id configurado para el dataset objetivo {dataset}.")


def _read_drive_dataset(file_id: str) -> pd.DataFrame:
    credentials = get_google_credentials()
    credentials.refresh(Request())
    response = requests.get(
        OBJECTIVE_DRIVE_API_TEMPLATE.format(file_id=file_id),
        headers={"Authorization": f"Bearer {credentials.token}"},
        timeout=60,
    )
    response.raise_for_status()
    return pd.read_csv(BytesIO(response.content))


def read_objective_data(
    *,
    source: Literal["local", "drive"] | None = None,
    dataset: str = DEFAULT_OBJECTIVE_DATASET,
    local_path: str | Path | None = None,
) -> pd.DataFrame:
    resolved_source = _resolve_objective_data_source(source)
    if dataset == ALL_OBJECTIVE_DATASET:
        frames: list[pd.DataFrame] = []
        for dataset_key, dataset_path in OBJECTIVE_DATASETS.items():
            if resolved_source == "drive":
                dataset_df = _read_drive_dataset(_resolve_drive_file_id(dataset_key))
            else:
                dataset_df = pd.read_csv(dataset_path)
            dataset_df["_objective_dataset_key"] = dataset_key
            frames.append(dataset_df)
        return pd.concat(frames, ignore_index=True)
    if resolved_source == "drive":
        dataset_df = _read_drive_dataset(_resolve_drive_file_id(dataset))
    else:
        dataset_path = _resolve_local_dataset_path(dataset, local_path)
        dataset_df = pd.read_csv(dataset_path)
    dataset_df["_objective_dataset_key"] = dataset
    return dataset_df


def load_objective_players(
    *,
    source: Literal["local", "drive"] | None = None,
    dataset: str = DEFAULT_OBJECTIVE_DATASET,
    local_path: str | Path | None = None,
) -> pd.DataFrame:
    raw_df = read_objective_data(source=source, dataset=dataset, local_path=local_path)
    raw_columns = raw_df.columns.tolist()
    raw_df, duplicate_columns = _drop_duplicate_suffix_columns(raw_df)

    available_columns = [column for column in OBJECTIVE_ACTIVE_COLUMNS if column in raw_df.columns]
    clean_df = raw_df[available_columns].copy()

    for column in TEXT_COLUMNS:
        if column in clean_df.columns:
            cleaner = _clean_positions_field if column == "positions" else _clean_text
            clean_df[column] = clean_df[column].map(cleaner)

    for column in POSITION_CODE_COLUMNS:
        if column in clean_df.columns:
            clean_df[column] = clean_df[column].map(_clean_position_code)
            clean_df[f"{column}_label"] = clean_df[column].map(_position_label)

    for column in NUMERIC_COLUMNS:
        if column in clean_df.columns:
            clean_df[column] = pd.to_numeric(clean_df[column], errors="coerce").fillna(0)

    for column in DATE_COLUMNS:
        if column in clean_df.columns:
            clean_df[column] = pd.to_datetime(clean_df[column], errors="coerce")

    for column in BOOL_COLUMNS:
        if column in clean_df.columns:
            clean_df[column] = (
                clean_df[column]
                .astype(str)
                .str.strip()
                .str.upper()
                .map({"TRUE": True, "FALSE": False})
                .fillna(False)
            )

    if {"xg_shot", "shots"}.issubset(clean_df.columns):
        clean_df["xg_per_shot"] = clean_df["xg_shot"].div(clean_df["shots"].replace(0, pd.NA)).fillna(0)

    if "birth_date" in clean_df.columns:
        clean_df["birth_year"] = clean_df["birth_date"].dt.year.astype("Int64")

    if "_objective_dataset_key" in raw_df.columns:
        clean_df["objective_dataset"] = raw_df["_objective_dataset_key"].values
    else:
        clean_df["objective_dataset"] = dataset
    clean_df["source_type"] = _resolve_objective_data_source(source)

    for column in ["full_name", "current_team_name", "last_club_name"]:
        if column in clean_df.columns:
            clean_df[f"{column}_normalized"] = clean_df[column].map(_normalize_lookup_value)
    for column in ["current_team_name", "last_club_name"]:
        if column in clean_df.columns:
            clean_df[f"{column}_team_normalized"] = clean_df[column].map(_normalize_team_value)

    clean_df, dropped_empty_columns = _drop_empty_and_zero_columns(clean_df)
    clean_df.attrs["raw_columns"] = raw_columns
    clean_df.attrs["duplicate_columns"] = duplicate_columns
    clean_df.attrs["dropped_empty_columns"] = dropped_empty_columns
    clean_df.attrs["app_visible_metrics"] = [
        column for column in OBJECTIVE_VISIBLE_METRICS if column in clean_df.columns
    ]
    return clean_df


def get_objective_app_visible_columns(df: pd.DataFrame) -> list[str]:
    priority_columns = [
        "image",
        "current_team_logo",
        "current_team_color",
        "full_name",
        "birth_year",
        "current_team_name",
        "domestic_competition_name",
        "primary_position_label",
        "secondary_position_label",
    ]
    metric_columns = [column for column in OBJECTIVE_VISIBLE_METRICS if column in df.columns]
    return [column for column in priority_columns + metric_columns if column in df.columns]


def get_objective_metric_panel_columns(
    objective_row: pd.Series,
    *,
    limit: int = 14,
    config_path: str | Path | None = None,
) -> list[str]:
    radar_group = get_radar_group(objective_row.get("primary_position_label"))
    if not radar_group:
        return []

    preferred_metric_keys = PANEL_METRICS_BY_GROUP.get(radar_group, [])
    if preferred_metric_keys:
        return preferred_metric_keys[:limit]

    config_df = load_radar_config(config_path)
    metric_keys = (
        config_df[
            (config_df["radar_group"] == radar_group)
            & (config_df["active"] == 1)
        ]["metric_key"]
        .tolist()
    )
    unique_metric_keys: list[str] = []
    for metric_key in metric_keys:
        if metric_key not in unique_metric_keys:
            unique_metric_keys.append(metric_key)
    return unique_metric_keys[:limit]


def load_radar_config(config_path: str | Path | None = None) -> pd.DataFrame:
    path = Path(config_path) if config_path is not None else RADAR_CONFIG_PATH
    config_df = pd.read_csv(path)
    config_df["active"] = pd.to_numeric(config_df["active"], errors="coerce").fillna(0).astype(int)
    config_df["order"] = pd.to_numeric(config_df["order"], errors="coerce").fillna(999).astype(int)
    return config_df.sort_values(["radar_group", "order"])


def get_radar_group(position_label: Any) -> str | None:
    normalized_label = _clean_text(position_label)
    return RADAR_GROUP_BY_POSITION.get(normalized_label)


def get_position_family(position_label: Any) -> str | None:
    normalized_label = _clean_text(position_label)
    return POSITION_FAMILY_BY_LABEL.get(normalized_label)


def build_objective_comparison_frame(objective_df: pd.DataFrame) -> pd.DataFrame:
    comparison_df = objective_df.copy()
    if "primary_position_label" in comparison_df.columns:
        comparison_df["radar_group"] = comparison_df["primary_position_label"].map(get_radar_group)
        comparison_df["position_family"] = comparison_df["primary_position_label"].map(get_position_family)
    else:
        comparison_df["radar_group"] = None
        comparison_df["position_family"] = None
    return comparison_df


def _compute_percentile_from_sample(sample: pd.Series, value: float) -> int:
    if sample.empty:
        return 0
    lower_bound = sample.quantile(0.025)
    upper_bound = sample.quantile(0.975)
    clipped_sample = sample.clip(lower=lower_bound, upper=upper_bound)
    clipped_value = min(max(value, lower_bound), upper_bound)
    percentile = (clipped_sample.le(clipped_value).sum() / len(clipped_sample)) * 100
    return int(round(percentile))


def build_radar_dataset(
    objective_df: pd.DataFrame,
    objective_player_id: int | float | str,
    *,
    compare_mode: Literal["specific", "general"] = "specific",
    minimum_minutes: int = 500,
    config_path: str | Path | None = None,
) -> dict[str, Any] | None:
    if objective_df.empty:
        return None

    config_df = load_radar_config(config_path)
    config_df = config_df[config_df["active"] == 1].copy()

    comparison_df = build_objective_comparison_frame(objective_df)
    player_df = comparison_df[comparison_df["id"] == objective_player_id].head(1)
    if player_df.empty:
        return None

    player_row = player_df.iloc[0]
    radar_group = player_row.get("radar_group")
    if not radar_group:
        return None

    group_config = config_df[config_df["radar_group"] == radar_group].copy()
    if group_config.empty:
        return None

    competition_name = player_row.get("domestic_competition_name")
    base_sample = comparison_df[
        comparison_df["minutes_on_field"].fillna(0).ge(minimum_minutes)
        & comparison_df["domestic_competition_name"].eq(competition_name)
        & comparison_df["radar_group"].eq(radar_group)
    ].copy()

    if compare_mode == "specific":
        sample_df = base_sample[
            base_sample["primary_position_label"].eq(player_row.get("primary_position_label"))
        ].copy()
        comparison_label = player_row.get("primary_position_label") or "Posición específica"
    else:
        player_family = player_row.get("position_family")
        sample_df = base_sample[base_sample["position_family"].eq(player_family)].copy()
        comparison_label = player_family or "Grupo general"

    if sample_df.empty:
        return None

    sample_count = int(sample_df["id"].nunique())
    params: list[str] = []
    values: list[int] = []
    slice_colors: list[str] = []
    metric_details: list[dict[str, Any]] = []
    category_colors = {
        "ataque": "#1A78CF",
        "posesion": "#FF9300",
        "defensa": "#D70232",
    }

    for _, metric_row in group_config.iterrows():
        metric_key = str(metric_row["metric_key"])
        if metric_key not in sample_df.columns or metric_key not in player_row.index:
            continue

        sample_series = pd.to_numeric(sample_df[metric_key], errors="coerce").dropna()
        player_value = pd.to_numeric(pd.Series([player_row.get(metric_key)]), errors="coerce").iloc[0]
        if sample_series.empty or pd.isna(player_value):
            continue

        params.append(str(metric_row["metric_label"]))
        values.append(_compute_percentile_from_sample(sample_series, float(player_value)))
        slice_colors.append(category_colors.get(str(metric_row["category"]), "#B8B8B8"))
        metric_details.append(
            {
                "metric_key": metric_key,
                "metric_label": str(metric_row["metric_label"]),
                "category": str(metric_row["category"]),
                "player_value": float(player_value),
            }
        )

    if not params:
        return None

    return {
        "params": params,
        "values": values,
        "slice_colors": slice_colors,
        "comparison_label": comparison_label,
        "sample_count": sample_count,
        "minimum_minutes": minimum_minutes,
        "competition_name": competition_name,
        "radar_group": radar_group,
        "compare_mode": compare_mode,
        "metric_details": metric_details,
    }


def build_subjective_player_catalog(subjective_df: pd.DataFrame) -> pd.DataFrame:
    required_columns = {"nombre_jugador", "equipo"}
    if not required_columns.issubset(subjective_df.columns):
        return pd.DataFrame()

    sort_column = "marca_temporal" if "marca_temporal" in subjective_df.columns else None
    working_df = subjective_df.sort_values(sort_column, ascending=False) if sort_column else subjective_df.copy()
    catalog = (
        working_df.groupby("nombre_jugador", as_index=False)
        .agg(
            scouting_birth_year=("ano_nacimiento", "first"),
            scouting_team=("equipo", "first"),
            scouting_nationality=("nacionalidad", "first"),
        )
        .copy()
    )
    catalog["nombre_jugador_normalized"] = catalog["nombre_jugador"].map(_normalize_lookup_value)
    catalog["scouting_team_normalized"] = catalog["scouting_team"].map(_normalize_team_value)
    return catalog


def match_objective_players(
    subjective_df: pd.DataFrame,
    objective_df: pd.DataFrame,
    *,
    min_name_similarity: float = 0.86,
    min_match_score: float = 0.78,
) -> pd.DataFrame:
    subjective_catalog = build_subjective_player_catalog(subjective_df)
    if subjective_catalog.empty or objective_df.empty:
        return pd.DataFrame()

    matches: list[dict[str, Any]] = []
    for _, objective_row in objective_df.iterrows():
        objective_full_name = objective_row.get("full_name")
        objective_short_name = objective_row.get("name")
        objective_name = objective_full_name or objective_short_name
        objective_birth_year = objective_row.get("birth_year")
        objective_team = objective_row.get("current_team_name")
        objective_last_club = objective_row.get("last_club_name")

        candidates = subjective_catalog.copy()
        if pd.notna(objective_birth_year):
            same_birth_year = candidates["scouting_birth_year"].eq(objective_birth_year)
            if same_birth_year.any():
                candidates = candidates[same_birth_year]

        best_match: dict[str, Any] | None = None
        for _, subjective_row in candidates.iterrows():
            name_similarity = _name_similarity(
                objective_full_name,
                objective_short_name,
                subjective_row["nombre_jugador"],
            )
            if name_similarity < min_name_similarity:
                continue

            birth_year_component: float | None = None
            if pd.notna(objective_birth_year) and pd.notna(subjective_row["scouting_birth_year"]):
                birth_year_component = float(objective_birth_year == subjective_row["scouting_birth_year"])

            team_similarity = max(
                _team_similarity(objective_team, subjective_row["scouting_team"]),
                _team_similarity(objective_last_club, subjective_row["scouting_team"]),
            )

            weighted_components = [(name_similarity, 0.7), (team_similarity, 0.1)]
            if birth_year_component is not None:
                weighted_components.append((birth_year_component, 0.2))

            total_weight = sum(weight for _, weight in weighted_components)
            match_score = sum(value * weight for value, weight in weighted_components) / total_weight

            if best_match is None or match_score > best_match["match_score"]:
                best_match = {
                    "objective_player_id": objective_row.get("id"),
                    "objective_full_name": objective_name,
                    "objective_birth_year": objective_birth_year,
                    "objective_team": objective_team,
                    "objective_last_club": objective_last_club,
                    "objective_dataset": objective_row.get("objective_dataset"),
                    "scouting_player_name": subjective_row["nombre_jugador"],
                    "scouting_birth_year": subjective_row["scouting_birth_year"],
                    "scouting_team": subjective_row["scouting_team"],
                    "name_similarity": round(name_similarity, 4),
                    "birth_year_match": birth_year_component,
                    "team_similarity": round(team_similarity, 4),
                    "match_score": round(match_score, 4),
                }

        if best_match is None:
            matches.append(
                {
                    "objective_player_id": objective_row.get("id"),
                    "objective_full_name": objective_name,
                    "objective_birth_year": objective_birth_year,
                    "objective_team": objective_team,
                    "objective_last_club": objective_last_club,
                    "objective_dataset": objective_row.get("objective_dataset"),
                    "scouting_player_name": None,
                    "scouting_birth_year": None,
                    "scouting_team": None,
                    "name_similarity": 0.0,
                    "birth_year_match": None,
                    "team_similarity": 0.0,
                    "match_score": 0.0,
                    "match_status": "sin_match",
                }
            )
            continue

        birth_match = best_match["birth_year_match"]
        if (
            best_match["match_score"] >= 0.9
            and best_match["name_similarity"] >= 0.88
            and birth_match in {1.0, None}
        ):
            match_status = "seguro"
        elif best_match["match_score"] >= min_match_score:
            match_status = "probable"
        else:
            match_status = "dudoso"

        best_match["match_status"] = match_status
        matches.append(best_match)

    return pd.DataFrame(matches).sort_values(
        ["match_status", "match_score", "name_similarity"],
        ascending=[True, False, False],
        na_position="last",
    )
