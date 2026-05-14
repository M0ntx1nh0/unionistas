from __future__ import annotations

from collections.abc import Mapping, Sequence
from typing import Any

import pandas as pd


LATERAL_POSITION_CODES = {"RB", "LB", "RWB", "LWB"}
LATERAL_PROFILE_FAMILY = "Laterales"
CENTER_BACK_POSITION_CODES = {"CB", "LCB", "RCB"}
CENTER_BACK_PROFILE_FAMILY = "Centrales"
MIDFIELD_POSITION_CODES = {"DMF", "LDMF", "RDMF", "CMF", "LCMF", "RCMF", "AMF", "LAMF", "RAMF"}
MIDFIELD_PROFILE_FAMILY = "Centrocampistas"
STRIKER_POSITION_CODES = {"CF", "SS"}
STRIKER_PROFILE_FAMILY = "Delanteros"
WINGER_POSITION_CODES = {"LW", "RW", "LWF", "RWF"}
WINGER_PROFILE_FAMILY = "Extremos"

LATERAL_PRIMARY_ROLES = ("Attacking FB", "Inverted FB", "Defensive FB")

LATERAL_ROLE_METRICS: dict[str, dict[str, Any]] = {
    "Attacking FB": {
        "metrics": {
            "passes_to_final_third_avg": 0.12,
            "pass_to_penalty_area_avg": 0.12,
            "xg_assist_avg": 0.15,
            "assists_avg": 0.15,
            "accurate_crosses_percent": 0.12,
            "progressive_run_avg": 0.1,
            "accelerations_avg": 0.08,
            "offensive_duels_won_percent": 0.1,
            "successful_dribbles_percent": 0.06,
        },
    },
    "Inverted FB": {
        "metrics": {
            "passes_avg": 0.35,
            "smart_passes_avg": 0.075,
            "through_passes_avg": 0.1,
            "progressive_pass_avg": 0.2,
            "possession_adjusted_tackle": 0.05,
            "possession_adjusted_interceptions": 0.05,
            "short_medium_pass_avg": 0.125,
            "defensive_duels_won_percent": 0.05,
        },
    },
    "Defensive FB": {
        "metrics": {
            "defensive_duels_won_percent": 0.35,
            "aerial_duels_won_percent": 0.15,
            "possession_adjusted_tackle": 0.25,
            "possession_adjusted_interceptions": 0.25,
        },
    },
}

CENTER_BACK_PRIMARY_ROLES = ("Ball playing CB", "Defensive CB", "Fast CB")

CENTER_BACK_ROLE_METRICS: dict[str, dict[str, Any]] = {
    "Ball playing CB": {
        "metrics": {
            "successful_long_passes_percent": 0.15,
            "passes_to_final_third_avg": 0.2,
            "deep_completed_pass_avg": 0.075,
            "progressive_pass_avg": 0.15,
            "passes_avg": 0.325,
            "aerial_duels_won_percent": 0.05,
            "defensive_duels_won_percent": 0.05,
        },
    },
    "Defensive CB": {
        "metrics": {
            "defensive_duels_won_percent": 0.3,
            "aerial_duels_won_percent": 0.2,
            "possession_adjusted_tackle": 0.2,
            "possession_adjusted_interceptions": 0.2,
            "successful_defensive_actions_avg": 0.1,
        },
    },
    "Fast CB": {
        "metrics": {
            "accelerations_avg": 0.3,
            "tackle_avg": 0.15,
            "progressive_run_avg": 0.2,
            "interceptions_avg": 0.15,
            "possession_adjusted_interceptions": 0.1,
            "possession_adjusted_tackle": 0.1,
        },
    },
}

MIDFIELD_ROLE_METRICS: dict[str, dict[str, Any]] = {
    "Box Crashers": {
        "metrics": {
            "xg_shot_avg": 0.25,
            "xg_assist_avg": 0.2,
            "successful_dribbles_percent": 0.1,
            "dribbles_avg": 0.15,
            "touch_in_box_avg": 0.2,
            "progressive_run_avg": 0.1,
        },
    },
    "Creator": {
        "metrics": {
            "smart_passes_avg": 0.3,
            "xg_shot_avg": 0.25,
            "xg_assist_avg": 0.2,
            "passes_to_final_third_avg": 0.1,
            "progressive_pass_avg": 0.1,
            "long_pass_avg": 0.05,
        },
    },
    "Orchestrator": {
        "metrics": {
            "passes_avg": 0.25,
            "accurate_passes_percent": 0.2,
            "short_medium_pass_avg": 0.15,
            "possession_adjusted_interceptions": 0.15,
            "successful_defensive_actions_avg": 0.1,
            "smart_passes_avg": 0.1,
            "defensive_duels_won_percent": 0.05,
        },
    },
    "Box to Box": {
        "metrics": {
            "progressive_pass_avg": 0.25,
            "defensive_duels_won_percent": 0.2,
            "possession_adjusted_interceptions": 0.2,
            "successful_defensive_actions_avg": 0.15,
            "xg_shot_avg": 0.1,
            "received_pass_avg": 0.1,
        },
    },
    "Distributor": {
        "metrics": {
            "passes_avg": 0.25,
            "accurate_passes_percent": 0.2,
            "forward_passes_avg": 0.2,
            "successful_forward_passes_percent": 0.15,
            "passes_to_final_third_avg": 0.1,
            "long_pass_avg": 0.1,
        },
    },
    "Builder": {
        "metrics": {
            "passes_avg": 0.3,
            "accurate_passes_percent": 0.25,
            "defensive_duels_won_percent": 0.15,
            "successful_defensive_actions_avg": 0.1,
            "possession_adjusted_interceptions": 0.15,
            "progressive_pass_avg": 0.05,
        },
    },
    "Possession Enabler": {
        "metrics": {
            "short_medium_pass_avg": 0.3,
            "successful_short_medium_passes_percent": 0.25,
            "successful_forward_passes_percent": 0.15,
            "passes_avg": 0.15,
            "successful_through_passes_percent": 0.15,
        },
    },
    "Defensive Mid": {
        "metrics": {
            "defensive_duels_won_percent": 0.4,
            "aerial_duels_won_percent": 0.1,
            "possession_adjusted_tackle": 0.2,
            "possession_adjusted_interceptions": 0.2,
            "successful_defensive_actions_avg": 0.1,
        },
    },
    "Number 6": {
        "metrics": {
            "defensive_duels_won_percent": 0.3,
            "successful_short_medium_passes_percent": 0.25,
            "short_medium_pass_avg": 0.225,
            "offensive_duels_won_percent": 0.225,
        },
    },
    "Deep-Lying Playmaker": {
        "metrics": {
            "passes_to_final_third_avg": 0.125,
            "deep_completed_pass_avg": 0.125,
            "progressive_pass_avg": 0.25,
            "smart_passes_avg": 0.15,
            "xg_assist_avg": 0.05,
            "pre_assist_avg": 0.1,
            "defensive_duels_won_percent": 0.1,
            "accurate_smart_passes_percent": 0.1,
        },
    },
    "Progressive Midfielder": {
        "metrics": {
            "progressive_run_avg": 0.225,
            "progressive_pass_avg": 0.225,
            "passes_to_final_third_avg": 0.2,
            "received_pass_avg": 0.15,
            "offensive_duels_won_percent": 0.1,
            "accelerations_avg": 0.1,
        },
    },
    "Box-to-Box Midfielder": {
        "metrics": {
            "defensive_duels_won_percent": 0.275,
            "offensive_duels_won_percent": 0.275,
            "progressive_run_avg": 0.25,
            "passes_to_final_third_avg": 0.1,
            "possession_adjusted_tackle": 0.05,
            "possession_adjusted_interceptions": 0.05,
        },
    },
    "Advanced Playmaker": {
        "metrics": {
            "smart_passes_avg": 0.2,
            "accurate_smart_passes_percent": 0.15,
            "through_passes_avg": 0.15,
            "offensive_duels_won_percent": 0.15,
            "successful_dribbles_percent": 0.1,
            "xg_assist_avg": 0.1,
            "non_penalty_goal_avg": 0.1,
            "xg_shot_avg": 0.05,
        },
    },
    "Wide CAM": {
        "metrics": {
            "smart_passes_avg": 0.1,
            "xg_assist_avg": 0.1,
            "successful_dribbles_percent": 0.2,
            "crosses_avg": 0.2,
            "cross_to_goalie_box_avg": 0.2,
            "accelerations_avg": 0.15,
            "touch_in_box_avg": 0.05,
        },
    },
}

MIDFIELD_PROFILE_GROUPS: dict[str, tuple[str, ...]] = {
    "Pivot": ("Defensive Mid", "Number 6"),
    "Midfield Creator": ("Orchestrator", "Distributor", "Builder", "Possession Enabler", "Deep-Lying Playmaker"),
    "Attacking Mid Creator": ("Creator", "Advanced Playmaker", "Wide CAM"),
    "Box to Box": ("Box to Box", "Box-to-Box Midfielder", "Progressive Midfielder", "Box Crashers"),
}

MIDFIELD_PROFILE_GROUPS_BY_POSITION: dict[str, tuple[str, ...]] = {
    "DMF": ("Pivot", "Midfield Creator", "Box to Box"),
    "LDMF": ("Pivot", "Midfield Creator", "Box to Box"),
    "RDMF": ("Pivot", "Midfield Creator", "Box to Box"),
    "CMF": ("Midfield Creator", "Box to Box", "Pivot"),
    "LCMF": ("Midfield Creator", "Box to Box", "Pivot"),
    "RCMF": ("Midfield Creator", "Box to Box", "Pivot"),
    # Los mediapuntas deben salir con perfiles ofensivos visibles.
    # Aunque el modelo interno calcule más familias, en producto evitamos
    # que AMF/LAMF/RAMF caigan en organizador o pivote.
    "AMF": ("Attacking Mid Creator", "Box to Box"),
    "LAMF": ("Attacking Mid Creator", "Box to Box"),
    "RAMF": ("Attacking Mid Creator", "Box to Box"),
}

STRIKER_PRIMARY_ROLES = ("Second Striker", "Target Man", "Advanced Striker")

STRIKER_ROLE_METRICS: dict[str, dict[str, Any]] = {
    "Second Striker": {
        "metrics": {
            "xg_shot_avg": 0.2,
            "touch_in_box_avg": 0.2,
            "non_penalty_goal_avg": 0.15,
            "xg_assist_avg": 0.15,
            "goal_conversion_percent": 0.1,
            "successful_dribbles_percent": 0.1,
            "progressive_run_avg": 0.1,
        },
    },
    "Deep-Lying Striker": {
        "metrics": {
            "xg_shot_avg": 0.125,
            "non_penalty_goal_avg": 0.125,
            "deep_completed_pass_avg": 0.15,
            "received_pass_avg": 0.15,
            "assists_avg": 0.15,
            "smart_passes_avg": 0.05,
            "pre_assist_avg": 0.125,
            "pass_to_penalty_area_avg": 0.125,
        },
    },
    "Target Man": {
        "metrics": {
            "touch_in_box_avg": 0.1,
            "aerial_duels_won_percent": 0.425,
            "xg_shot_avg": 0.225,
            "shots_on_target_percent_proxy": 0.2,
            "non_penalty_goal_avg": 0.05,
        },
    },
    "Playmaking Striker": {
        "metrics": {
            "short_medium_pass_avg": 0.25,
            "received_pass_avg": 0.25,
            "smart_passes_avg": 0.1,
            "accurate_smart_passes_percent": 0.1,
            "xg_shot_avg": 0.1,
            "non_penalty_goal_avg": 0.1,
            "offensive_duels_won_percent": 0.1,
        },
    },
    "Advanced Striker": {
        "metrics": {
            "accelerations_avg": 0.2,
            "touch_in_box_avg": 0.1,
            "progressive_run_avg": 0.2,
            "goals_avg": 0.1,
            "xg_shot_avg": 0.1,
            "goal_conversion_percent": 0.1,
            "xg_assist_avg": 0.1,
            "successful_dribbles_percent": 0.1,
        },
    },
}

WINGER_ROLE_METRICS: dict[str, dict[str, Any]] = {
    "Inverted Winger": {
        "metrics": {
            "shots_avg": 0.3,
            "xg_shot_avg": 0.15,
            "touch_in_box_avg": 0.15,
            "successful_dribbles_percent": 0.15,
            "smart_passes_avg": 0.1,
            "cross_to_goalie_box_avg": 0.1,
            "successful_short_medium_passes_percent": 0.05,
        },
    },
    "Traditional Winger": {
        "metrics": {
            "smart_passes_avg": 0.2,
            "successful_dribbles_percent": 0.175,
            "cross_to_goalie_box_avg": 0.225,
            "accelerations_avg": 0.2,
            "xg_assist_avg": 0.1,
            "accurate_crosses_percent": 0.1,
        },
    },
    "Playmaking Winger": {
        "metrics": {
            "accurate_smart_passes_percent": 0.25,
            "smart_passes_avg": 0.1,
            "passes_to_final_third_avg": 0.1,
            "deep_completed_pass_avg": 0.1,
            "progressive_pass_avg": 0.15,
            "through_passes_avg": 0.2,
            "pre_assist_avg": 0.1,
        },
    },
    "Inside Forward": {
        "metrics": {
            "touch_in_box_avg": 0.2,
            "xg_shot_avg": 0.2,
            "progressive_run_avg": 0.1,
            "goals_avg": 0.15,
            "successful_dribbles_percent": 0.1,
            "goal_conversion_percent": 0.1,
            "xg_assist_avg": 0.15,
        },
    },
}

STRIKER_PROFILE_GROUPS: dict[str, tuple[str, ...]] = {
    "Second Striker": ("Second Striker", "Deep-Lying Striker", "Playmaking Striker"),
    "Target Man": ("Target Man",),
    "Advanced Striker": ("Advanced Striker",),
}

WINGER_PROFILE_GROUPS: dict[str, tuple[str, ...]] = {
    "Traditional Winger": ("Traditional Winger",),
    "Creative Winger": ("Inverted Winger", "Playmaking Winger"),
    "Inside Forward": ("Inside Forward",),
}


def _safe_percent(numerator: Any, denominator: Any) -> float:
    num = pd.to_numeric(numerator, errors="coerce")
    den = pd.to_numeric(denominator, errors="coerce")
    if pd.isna(num) or pd.isna(den) or float(den) <= 0:
        return 0.0
    return float(num) / float(den) * 100.0


def _position_codes(row: pd.Series) -> set[str]:
    return {
        str(value).strip().upper()
        for value in (
            row.get("primary_position"),
            row.get("secondary_position"),
            row.get("third_position"),
        )
        if value is not None and not pd.isna(value) and str(value).strip()
    }


def _primary_position_code(row: pd.Series) -> str:
    value = row.get("primary_position")
    if value is None or pd.isna(value):
        return ""
    return str(value).strip().upper()


def _is_lateral(row: pd.Series) -> bool:
    # Para evitar perfiles confusos en extremos o centrales que hayan jugado
    # minutos residuales como lateral, solo perfilamos LAT si la posición
    # principal del jugador en Wyscout es lateral/carrilero.
    return _primary_position_code(row) in LATERAL_POSITION_CODES


def _is_center_back(row: pd.Series) -> bool:
    # Igual que con laterales, para evitar perfiles confusos en pivotes
    # o defensas con minutos residuales como central, exigimos que la
    # posición principal en Wyscout sea de central.
    return _primary_position_code(row) in CENTER_BACK_POSITION_CODES


def _is_midfielder(row: pd.Series) -> bool:
    # Restringimos a mediocampistas puros/medias puntas para no contaminar
    # el bloque con extremos, que tendrán su familia propia más adelante.
    return _primary_position_code(row) in MIDFIELD_POSITION_CODES


def _is_striker(row: pd.Series) -> bool:
    return _primary_position_code(row) in STRIKER_POSITION_CODES


def _is_winger(row: pd.Series) -> bool:
    return _primary_position_code(row) in WINGER_POSITION_CODES


def _prepare_lateral_metrics(df: pd.DataFrame) -> pd.DataFrame:
    prepared = df.copy()
    prepared["offensive_duels_won_percent"] = prepared.apply(
        lambda row: _safe_percent(row.get("offensive_duels_won"), row.get("offensive_duels_avg")),
        axis=1,
    )
    prepared["defensive_duels_won_percent"] = prepared.apply(
        lambda row: _safe_percent(row.get("defensive_duels_won"), row.get("defensive_duels_avg")),
        axis=1,
    )
    prepared["aerial_duels_won_percent"] = prepared.apply(
        lambda row: _safe_percent(row.get("aerial_duels_won"), row.get("aerial_duels_avg")),
        axis=1,
    )
    return prepared


def _prepare_center_back_metrics(df: pd.DataFrame) -> pd.DataFrame:
    prepared = df.copy()
    prepared["defensive_duels_won_percent"] = prepared.apply(
        lambda row: _safe_percent(row.get("defensive_duels_won"), row.get("defensive_duels_avg")),
        axis=1,
    )
    prepared["aerial_duels_won_percent"] = prepared.apply(
        lambda row: _safe_percent(row.get("aerial_duels_won"), row.get("aerial_duels_avg")),
        axis=1,
    )
    # Nombres puente para reutilizar los pesos del notebook.
    prepared["successful_short_medium_passes_percent"] = pd.to_numeric(
        prepared.get("accurate_passes_percent"),
        errors="coerce",
    ).fillna(0.0)
    prepared["long_pass_avg"] = pd.to_numeric(
        prepared.get("forward_passes_avg"),
        errors="coerce",
    ).fillna(0.0)
    prepared["successful_long_passes_percent"] = pd.to_numeric(
        prepared.get("successful_progressive_pass_percent"),
        errors="coerce",
    ).fillna(0.0)
    return prepared


def _prepare_midfield_metrics(df: pd.DataFrame) -> pd.DataFrame:
    prepared = df.copy()
    prepared["offensive_duels_won_percent"] = prepared.apply(
        lambda row: _safe_percent(row.get("offensive_duels_won"), row.get("offensive_duels_avg")),
        axis=1,
    )
    prepared["defensive_duels_won_percent"] = prepared.apply(
        lambda row: _safe_percent(row.get("defensive_duels_won"), row.get("defensive_duels_avg")),
        axis=1,
    )
    prepared["aerial_duels_won_percent"] = prepared.apply(
        lambda row: _safe_percent(row.get("aerial_duels_won"), row.get("aerial_duels_avg")),
        axis=1,
    )
    prepared["successful_short_medium_passes_percent"] = pd.to_numeric(
        prepared.get("accurate_passes_percent"),
        errors="coerce",
    ).fillna(0.0)
    prepared["long_pass_avg"] = pd.to_numeric(
        prepared.get("forward_passes_avg"),
        errors="coerce",
    ).fillna(0.0)
    return prepared


def _prepare_striker_metrics(df: pd.DataFrame) -> pd.DataFrame:
    prepared = df.copy()
    prepared["offensive_duels_won_percent"] = prepared.apply(
        lambda row: _safe_percent(row.get("offensive_duels_won"), row.get("offensive_duels_avg")),
        axis=1,
    )
    prepared["aerial_duels_won_percent"] = prepared.apply(
        lambda row: _safe_percent(row.get("aerial_duels_won"), row.get("aerial_duels_avg")),
        axis=1,
    )
    prepared["goal_conversion_percent"] = prepared.apply(
        lambda row: _safe_percent(row.get("non_penalty_goal"), row.get("shots")),
        axis=1,
    )
    prepared["shots_on_target_percent_proxy"] = pd.to_numeric(
        prepared.get("xg_per_shot"),
        errors="coerce",
    ).fillna(0.0) * 100.0
    return prepared


def _prepare_winger_metrics(df: pd.DataFrame) -> pd.DataFrame:
    prepared = df.copy()
    prepared["goal_conversion_percent"] = prepared.apply(
        lambda row: _safe_percent(row.get("non_penalty_goal"), row.get("shots")),
        axis=1,
    )
    prepared["successful_short_medium_passes_percent"] = pd.to_numeric(
        prepared.get("accurate_passes_percent"),
        errors="coerce",
    ).fillna(0.0)
    return prepared


def _normalize_metrics(df: pd.DataFrame, metric_names: Sequence[str]) -> pd.DataFrame:
    normalized = pd.DataFrame(index=df.index)
    for metric_name in metric_names:
        if metric_name not in df.columns:
            normalized[metric_name] = 0.0
            continue
        values = pd.to_numeric(df[metric_name], errors="coerce").fillna(0.0).astype(float)
        min_value = float(values.min())
        max_value = float(values.max())
        if max_value > min_value:
            normalized[metric_name] = (values - min_value) / (max_value - min_value) * 100.0
        else:
            normalized[metric_name] = 0.0
    return normalized


def _score_roles(normalized_metrics: pd.DataFrame, roles_config: Mapping[str, Mapping[str, Any]]) -> pd.DataFrame:
    scores = pd.DataFrame(index=normalized_metrics.index)
    for role_name, role_config in roles_config.items():
        weights = role_config["metrics"]
        role_score = pd.Series(0.0, index=normalized_metrics.index, dtype=float)
        for metric_name, weight in weights.items():
            role_score = role_score.add(normalized_metrics.get(metric_name, 0.0) * float(weight), fill_value=0.0)
        min_value = float(role_score.min())
        max_value = float(role_score.max())
        if max_value > min_value:
            scores[role_name] = (role_score - min_value) / (max_value - min_value) * 100.0
        else:
            scores[role_name] = 0.0
    return scores


def _best_role(row: pd.Series, role_names: Sequence[str]) -> str | None:
    available = {role_name: float(row.get(role_name, 0.0)) for role_name in role_names}
    if not available:
        return None
    return max(available, key=available.get)


def _second_best_role(row: pd.Series, role_names: Sequence[str], exclude: str | None = None) -> str | None:
    available = {
        role_name: float(row.get(role_name, 0.0))
        for role_name in role_names
        if role_name != exclude
    }
    if not available:
        return None
    return max(available, key=available.get)


def _score_map(row: pd.Series, role_names: Sequence[str]) -> dict[str, float]:
    return {role_name: round(float(row.get(role_name, 0.0)), 2) for role_name in role_names}


def _aggregate_role_groups(row: pd.Series, role_groups: Mapping[str, Sequence[str]]) -> dict[str, float]:
    aggregated: dict[str, float] = {}
    for group_name, role_names in role_groups.items():
        values = [float(row.get(role_name, 0.0)) for role_name in role_names]
        aggregated[group_name] = round(max(values) if values else 0.0, 2)
    return aggregated


def _best_group(score_map: Mapping[str, float], exclude: str | None = None) -> str | None:
    filtered = {key: value for key, value in score_map.items() if key != exclude}
    if not filtered:
        return None
    return max(filtered, key=filtered.get)


def _best_midfield_group(row: pd.Series, exclude: str | None = None) -> str | None:
    score_map = row.get("profile_score_map") or {}
    primary_code = _primary_position_code(row)
    allowed_groups = MIDFIELD_PROFILE_GROUPS_BY_POSITION.get(primary_code, tuple(MIDFIELD_PROFILE_GROUPS.keys()))
    filtered = {
        key: float(score_map.get(key, 0.0))
        for key in allowed_groups
        if key != exclude
    }
    if not filtered:
        return None
    return max(filtered, key=filtered.get)


def apply_objective_profiles(df: pd.DataFrame) -> pd.DataFrame:
    enriched = df.copy()
    enriched["primary_profile"] = None
    enriched["secondary_profile"] = None
    enriched["profile_family"] = None
    enriched["profile_score_map"] = [{} for _ in range(len(enriched))]

    lateral_mask = enriched.apply(_is_lateral, axis=1)
    if lateral_mask.any():
        lateral_df = _prepare_lateral_metrics(enriched.loc[lateral_mask].copy())
        metric_names = sorted(
            {
                metric_name
                for role_config in LATERAL_ROLE_METRICS.values()
                for metric_name in role_config["metrics"].keys()
            }
        )
        normalized_metrics = _normalize_metrics(lateral_df, metric_names)
        role_scores = _score_roles(normalized_metrics, LATERAL_ROLE_METRICS)

        all_role_names = list(LATERAL_PRIMARY_ROLES)
        lateral_df = lateral_df.join(role_scores)
        lateral_df["primary_profile"] = lateral_df.apply(
            lambda row: _best_role(row, LATERAL_PRIMARY_ROLES),
            axis=1,
        )
        lateral_df["secondary_profile"] = None
        lateral_df["profile_family"] = LATERAL_PROFILE_FAMILY
        lateral_df["profile_score_map"] = lateral_df.apply(
            lambda row: _score_map(row, all_role_names),
            axis=1,
        )

        enriched.loc[lateral_mask, "primary_profile"] = lateral_df["primary_profile"]
        enriched.loc[lateral_mask, "secondary_profile"] = lateral_df["secondary_profile"]
        enriched.loc[lateral_mask, "profile_family"] = lateral_df["profile_family"]
        enriched.loc[lateral_mask, "profile_score_map"] = lateral_df["profile_score_map"]

    center_back_mask = enriched.apply(_is_center_back, axis=1)
    if center_back_mask.any():
        center_back_df = _prepare_center_back_metrics(enriched.loc[center_back_mask].copy())
        metric_names = sorted(
            {
                metric_name
                for role_config in CENTER_BACK_ROLE_METRICS.values()
                for metric_name in role_config["metrics"].keys()
            }
        )
        normalized_metrics = _normalize_metrics(center_back_df, metric_names)
        role_scores = _score_roles(normalized_metrics, CENTER_BACK_ROLE_METRICS)

        all_role_names = list(CENTER_BACK_PRIMARY_ROLES)
        center_back_df = center_back_df.join(role_scores)
        center_back_df["primary_profile"] = center_back_df.apply(
            lambda row: _best_role(row, CENTER_BACK_PRIMARY_ROLES),
            axis=1,
        )
        center_back_df["secondary_profile"] = None
        center_back_df["profile_family"] = CENTER_BACK_PROFILE_FAMILY
        center_back_df["profile_score_map"] = center_back_df.apply(
            lambda row: _score_map(row, all_role_names),
            axis=1,
        )

        enriched.loc[center_back_mask, "primary_profile"] = center_back_df["primary_profile"]
        enriched.loc[center_back_mask, "secondary_profile"] = center_back_df["secondary_profile"]
        enriched.loc[center_back_mask, "profile_family"] = center_back_df["profile_family"]
        enriched.loc[center_back_mask, "profile_score_map"] = center_back_df["profile_score_map"]

    midfield_mask = enriched.apply(_is_midfielder, axis=1)
    if midfield_mask.any():
        midfield_df = _prepare_midfield_metrics(enriched.loc[midfield_mask].copy())
        metric_names = sorted(
            {
                metric_name
                for role_config in MIDFIELD_ROLE_METRICS.values()
                for metric_name in role_config["metrics"].keys()
            }
        )
        normalized_metrics = _normalize_metrics(midfield_df, metric_names)
        role_scores = _score_roles(normalized_metrics, MIDFIELD_ROLE_METRICS)
        midfield_df = midfield_df.join(role_scores)
        midfield_df["profile_score_map"] = midfield_df.apply(
            lambda row: _aggregate_role_groups(row, MIDFIELD_PROFILE_GROUPS),
            axis=1,
        )
        midfield_df["primary_profile"] = midfield_df.apply(
            lambda row: _best_midfield_group(row),
            axis=1,
        )
        midfield_df["secondary_profile"] = None
        midfield_df["profile_family"] = MIDFIELD_PROFILE_FAMILY

        enriched.loc[midfield_mask, "primary_profile"] = midfield_df["primary_profile"]
        enriched.loc[midfield_mask, "secondary_profile"] = midfield_df["secondary_profile"]
        enriched.loc[midfield_mask, "profile_family"] = midfield_df["profile_family"]
        enriched.loc[midfield_mask, "profile_score_map"] = midfield_df["profile_score_map"]

    striker_mask = enriched.apply(_is_striker, axis=1)
    if striker_mask.any():
        striker_df = _prepare_striker_metrics(enriched.loc[striker_mask].copy())
        metric_names = sorted(
            {
                metric_name
                for role_config in STRIKER_ROLE_METRICS.values()
                for metric_name in role_config["metrics"].keys()
            }
        )
        normalized_metrics = _normalize_metrics(striker_df, metric_names)
        role_scores = _score_roles(normalized_metrics, STRIKER_ROLE_METRICS)

        striker_df = striker_df.join(role_scores)
        striker_df["profile_score_map"] = striker_df.apply(
            lambda row: _aggregate_role_groups(row, STRIKER_PROFILE_GROUPS),
            axis=1,
        )
        striker_df["primary_profile"] = striker_df.apply(
            lambda row: _best_group(row.get("profile_score_map") or {}),
            axis=1,
        )
        striker_df["secondary_profile"] = None
        striker_df["profile_family"] = STRIKER_PROFILE_FAMILY

        enriched.loc[striker_mask, "primary_profile"] = striker_df["primary_profile"]
        enriched.loc[striker_mask, "secondary_profile"] = striker_df["secondary_profile"]
        enriched.loc[striker_mask, "profile_family"] = striker_df["profile_family"]
        enriched.loc[striker_mask, "profile_score_map"] = striker_df["profile_score_map"]

    winger_mask = enriched.apply(_is_winger, axis=1)
    if winger_mask.any():
        winger_df = _prepare_winger_metrics(enriched.loc[winger_mask].copy())
        metric_names = sorted(
            {
                metric_name
                for role_config in WINGER_ROLE_METRICS.values()
                for metric_name in role_config["metrics"].keys()
            }
        )
        normalized_metrics = _normalize_metrics(winger_df, metric_names)
        role_scores = _score_roles(normalized_metrics, WINGER_ROLE_METRICS)

        winger_df = winger_df.join(role_scores)
        winger_df["profile_score_map"] = winger_df.apply(
            lambda row: _aggregate_role_groups(row, WINGER_PROFILE_GROUPS),
            axis=1,
        )
        winger_df["primary_profile"] = winger_df.apply(
            lambda row: _best_group(row.get("profile_score_map") or {}),
            axis=1,
        )
        winger_df["secondary_profile"] = None
        winger_df["profile_family"] = WINGER_PROFILE_FAMILY

        enriched.loc[winger_mask, "primary_profile"] = winger_df["primary_profile"]
        enriched.loc[winger_mask, "secondary_profile"] = winger_df["secondary_profile"]
        enriched.loc[winger_mask, "profile_family"] = winger_df["profile_family"]
        enriched.loc[winger_mask, "profile_score_map"] = winger_df["profile_score_map"]

    return enriched


def _clean_profile_value(value: Any) -> str | None:
    if value is None or pd.isna(value):
        return None
    text = str(value).strip()
    return text or None
