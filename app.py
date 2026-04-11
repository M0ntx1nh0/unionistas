from __future__ import annotations

from datetime import datetime
from io import BytesIO
from pathlib import Path

import altair as alt
import pandas as pd
import requests
import streamlit as st
from PIL import Image, ImageDraw, ImageOps

from src.scouting_app.auth import render_login
from src.scouting_app.calendar_data import (
    build_calendar_interest,
    competition_family,
    resolve_team_key,
    load_calendar_matches,
    load_team_name_map,
    refresh_calendar_matches,
)
from src.scouting_app.calendar_pdf import CalendarPdfSection, build_calendar_pdf
from src.scouting_app.campogram_data import (
    CampogramDataset,
    get_campogram_ordered_names,
    get_category_style,
    get_consensus_style,
    get_position_blocks,
    build_campogram_dataset,
    summarize_campogram,
)
from src.scouting_app.data_processing import (
    build_player_summary,
    filter_reports,
    load_scouting_reports,
    summarize_repeated_capabilities,
)
from src.scouting_app.google_sheets import get_service_account_email
from src.scouting_app.objective_data import (
    build_radar_dataset,
    get_objective_app_visible_columns,
    get_objective_metric_panel_columns,
    load_objective_players,
    match_objective_players,
)


st.set_page_config(
    page_title="Unionistas Scouting Lab",
    page_icon="⚽",
    layout="wide",
)


LOGO_PATH = Path("assets/escudo/unionistar.png")
COLOR_BLACK = "#0A0A0A"
COLOR_WHITE = "#F5F5F5"
COLOR_GRAY = "#B8B8B8"
COLOR_DARK_GRAY = "#4A4A4A"
COLOR_GOLD = "#E7D21A"
VIEWS = ["Dashboard", "Jugador", "Informes", "Calendario", "Campogramas"]


@st.cache_data(ttl=300, show_spinner=False)
def get_data() -> pd.DataFrame:
    return load_scouting_reports()


@st.cache_data(ttl=300, show_spinner=False)
def get_objective_data() -> pd.DataFrame:
    return load_objective_players()


@st.cache_data(ttl=300, show_spinner=False)
def get_objective_matches() -> pd.DataFrame:
    subjective_df = get_data()
    objective_df = get_objective_data()
    return match_objective_players(subjective_df, objective_df)


@st.cache_data(ttl=300, show_spinner=False)
def get_calendar_matches() -> pd.DataFrame:
    return load_calendar_matches()


@st.cache_data(ttl=300, show_spinner=False)
def get_team_name_map() -> pd.DataFrame:
    return load_team_name_map()


@st.cache_data(ttl=300, show_spinner=False)
def get_calendar_team_logos() -> dict[tuple[str, str], str]:
    try:
        objective_df = get_objective_data()
    except Exception:
        return {}
    if objective_df is None or objective_df.empty:
        return {}

    logo_map: dict[tuple[str, str], str] = {}
    team_map_df = get_team_name_map()
    for _, row in objective_df.iterrows():
        logo = str(row.get("current_team_logo") or "").strip()
        if not logo or logo == "No disponible":
            continue

        competition_key = competition_family(row.get("domestic_competition_name"))
        for team_name in [row.get("current_team_name"), row.get("last_club_name")]:
            normalized_name = resolve_team_key(team_name, row.get("domestic_competition_name"), team_map_df)
            if not normalized_name:
                continue
            logo_map.setdefault((competition_key, normalized_name), logo)
    return logo_map


@st.cache_data(ttl=300, show_spinner=False)
def get_campogram_dataset() -> CampogramDataset:
    return build_campogram_dataset()


def objective_dataset_label(dataset_key: str | None) -> str:
    labels = {
        "1rfef_2025_26": "1RFEF",
        "2rfef_2025_26": "2RFEF",
    }
    return labels.get(str(dataset_key), "RFEF")


def _normalize_match_team(value: object) -> str:
    text = str(value or "").strip().lower()
    replacements = {
        " cf": "",
        " fc": "",
        " cd": "",
        " ud": "",
        " sd": "",
        " rc": "",
    }
    for source, target in replacements.items():
        text = text.replace(source, target)
    return " ".join(text.split()).strip()


def _competition_family(value: object) -> str:
    text = str(value or "").strip().lower()
    normalized = " ".join(text.split())
    if "1ª rfef" in normalized or "primera division rfef" in normalized:
        return "1rfef"
    if "2ª rfef" in normalized or "segunda division rfef" in normalized:
        return "2rfef"
    return normalized


def format_birth_year_with_age(value: object) -> str:
    try:
        birth_year = int(float(value))
    except (TypeError, ValueError):
        return "No disponible"

    natural_age = max(0, datetime.now().year - birth_year)
    age_label = "año" if natural_age == 1 else "años"
    return f"{birth_year} / {natural_age} {age_label}"


def apply_custom_theme() -> None:
    st.markdown(
        f"""
        <style>
            .stApp {{
                background:
                    radial-gradient(circle at top right, rgba(231, 210, 26, 0.16), transparent 22%),
                    linear-gradient(180deg, #f2f2f2 0%, #e7e7e7 100%);
                color: {COLOR_BLACK};
            }}
            [data-testid="stSidebar"] {{
                background: linear-gradient(180deg, #111111 0%, #1b1b1b 100%);
                border-right: 4px solid {COLOR_GOLD};
            }}
            [data-testid="stSidebar"] * {{
                color: {COLOR_WHITE};
            }}
            [data-testid="stSidebar"] .stCaption,
            [data-testid="stSidebar"] p,
            [data-testid="stSidebar"] label {{
                color: rgba(245, 245, 245, 0.9) !important;
            }}
            [data-testid="stSidebar"] [data-baseweb="select"] *,
            [data-testid="stSidebar"] [data-baseweb="input"] *,
            [data-testid="stSidebar"] input,
            [data-testid="stSidebar"] textarea {{
                color: #222222 !important;
            }}
            [data-testid="stSidebar"] [data-baseweb="select"] > div,
            [data-testid="stSidebar"] [data-baseweb="input"] > div {{
                background: rgba(255, 255, 255, 0.96) !important;
            }}
            [data-testid="stSidebar"] button {{
                color: #111111 !important;
                background: rgba(255, 255, 255, 0.96) !important;
                border: 1px solid rgba(0, 0, 0, 0.12) !important;
            }}
            [data-testid="stSidebar"] button p,
            [data-testid="stSidebar"] button span {{
                color: #111111 !important;
            }}
            [data-testid="stSidebar"] button:hover,
            [data-testid="stSidebar"] button:active,
            [data-testid="stSidebar"] button:focus {{
                color: #666666 !important;
                background: rgba(245, 245, 245, 0.96) !important;
            }}
            [data-testid="stSidebar"] button:hover p,
            [data-testid="stSidebar"] button:hover span,
            [data-testid="stSidebar"] button:active p,
            [data-testid="stSidebar"] button:active span,
            [data-testid="stSidebar"] button:focus p,
            [data-testid="stSidebar"] button:focus span {{
                color: #666666 !important;
            }}
            div[data-testid="stMetric"] {{
                background: rgba(255, 255, 255, 0.86);
                border: 1px solid rgba(255, 255, 255, 0.55);
                border-left: 6px solid {COLOR_GOLD};
                padding: 16px 18px;
                border-radius: 20px;
                box-shadow: 0 12px 28px rgba(10, 10, 10, 0.06);
                backdrop-filter: blur(8px);
            }}
            div[data-testid="stMetricLabel"] {{
                color: {COLOR_DARK_GRAY};
                font-weight: 700;
                letter-spacing: 0.02em;
            }}
            div[data-testid="stMetricValue"] {{
                color: {COLOR_BLACK};
            }}
            .block-container {{
                padding-top: 2.9rem;
            }}
            .unionistas-hero {{
                background: linear-gradient(135deg, rgba(10,10,10,0.96), rgba(48,48,48,0.94));
                border: 1px solid rgba(231, 210, 26, 0.35);
                border-radius: 22px;
                padding: 24px 28px;
                margin-bottom: 1.5rem;
                color: {COLOR_WHITE};
                box-shadow: 0 18px 40px rgba(10, 10, 10, 0.16);
            }}
            .unionistas-kicker {{
                color: {COLOR_GOLD};
                font-size: 0.85rem;
                font-weight: 800;
                letter-spacing: 0.16em;
                text-transform: uppercase;
                margin-bottom: 0.35rem;
            }}
            .unionistas-title {{
                font-size: 2.2rem;
                font-weight: 800;
                line-height: 1.05;
                margin: 0;
            }}
            .unionistas-copy {{
                color: rgba(245, 245, 245, 0.82);
                margin-top: 0.7rem;
                max-width: 48rem;
            }}
            .unionistas-section {{
                color: {COLOR_BLACK};
                font-weight: 800;
                letter-spacing: 0.01em;
                margin: 0.3rem 0 0.8rem 0;
            }}
            .unionistas-section-inverse {{
                width: 100%;
                background: linear-gradient(135deg, rgba(10,10,10,0.97), rgba(38,38,38,0.96));
                color: #f5f5f5;
                font-weight: 800;
                font-size: 1.22rem;
                letter-spacing: 0.01em;
                margin: 0.55rem 0 0.95rem 0;
                padding: 0.72rem 1rem;
                border-radius: 18px;
                border: 1px solid rgba(231, 210, 26, 0.28);
                box-shadow: 0 10px 24px rgba(10,10,10,0.12);
            }}
            .unionistas-panel {{
                background: rgba(255, 255, 255, 0.42);
                border: 1px solid rgba(255, 255, 255, 0.55);
                border-radius: 26px;
                padding: 1.1rem 1.15rem 0.85rem 1.15rem;
                box-shadow: inset 0 1px 0 rgba(255,255,255,0.42), 0 10px 30px rgba(10,10,10,0.04);
                backdrop-filter: blur(10px);
            }}
            .unionistas-panel + .unionistas-panel {{
                margin-top: 1rem;
            }}
            .report-card {{
                background: rgba(255, 255, 255, 0.74);
                border: 1px solid rgba(255, 255, 255, 0.75);
                border-left: 8px solid #b8b8b8;
                border-radius: 18px;
                padding: 1rem 1rem 0.95rem 1rem;
                margin-bottom: 0.9rem;
                box-shadow: 0 10px 24px rgba(10, 10, 10, 0.04);
            }}
            .report-card[data-verdict="A+"] {{
                border-left-color: #0f8a3b;
                background: rgba(232, 248, 236, 0.9);
            }}
            .report-card[data-verdict="A"] {{
                border-left-color: #55a630;
                background: rgba(239, 248, 227, 0.9);
            }}
            .report-card[data-verdict="B"] {{
                border-left-color: #d4b000;
                background: rgba(255, 247, 214, 0.92);
            }}
            .report-card[data-verdict="C"] {{
                border-left-color: #f08c00;
                background: rgba(255, 238, 214, 0.92);
            }}
            .report-card[data-verdict="D"] {{
                border-left-color: #d9480f;
                background: rgba(255, 228, 220, 0.92);
            }}
            .report-card[data-verdict="E"] {{
                border-left-color: #c1121f;
                background: rgba(255, 220, 225, 0.92);
            }}
            .report-card[data-verdict="Seguir Valorando"] {{
                border-left-color: #f08c00;
                background: rgba(255, 239, 213, 0.92);
            }}
            .report-card[data-verdict="Filial/Juvenil DH"] {{
                border-left-color: #7b2cbf;
                background: rgba(241, 232, 251, 0.92);
            }}
            .objective-mini-metric {{
                background: rgba(255, 255, 255, 0.88);
                border: 1px solid rgba(255, 255, 255, 0.72);
                border-left: 5px solid #e7d21a;
                border-radius: 18px;
                padding: 0.85rem 0.95rem;
                min-height: 96px;
                box-shadow: 0 8px 20px rgba(10, 10, 10, 0.05);
            }}
            .objective-mini-metric-label {{
                color: #4a4a4a;
                font-size: 0.84rem;
                font-weight: 700;
                margin-bottom: 0.35rem;
            }}
            .objective-mini-metric-value {{
                color: #111111;
                font-size: 1.48rem;
                font-weight: 800;
                line-height: 1.05;
            }}
            .subjective-metric-card {{
                background: rgba(255, 255, 255, 0.88);
                border: 1px solid rgba(255, 255, 255, 0.72);
                border-left: 5px solid #e7d21a;
                border-radius: 18px;
                padding: 0.9rem 1rem;
                min-height: 118px;
                display: flex;
                flex-direction: column;
                justify-content: space-between;
                box-shadow: 0 8px 20px rgba(10, 10, 10, 0.05);
            }}
            .capability-title-box {{
                display:inline-block;
                background: rgba(255,255,255,0.92);
                border: 2px solid rgba(231, 210, 26, 0.72);
                border-radius: 14px;
                padding: 0.5rem 0.85rem;
                color: #111111;
                font-weight: 800;
                margin-bottom: 1.15rem;
                box-shadow: 0 6px 16px rgba(10,10,10,0.04);
            }}
            .subjective-chart-panel {{
                background: transparent;
                border: none;
                border-radius: 0;
                padding: 0;
                box-shadow: none;
            }}
            .subjective-chart-title {{
                display:inline-block;
                background: rgba(255,255,255,0.92);
                color: #111111;
                border: 2px solid rgba(231, 210, 26, 0.72);
                border-radius: 14px;
                padding: 0.45rem 0.8rem;
                font-weight: 800;
                margin-bottom: 0.65rem;
                box-shadow: 0 6px 16px rgba(10,10,10,0.04);
            }}
            .report-card-header {{
                display: flex;
                justify-content: space-between;
                align-items: center;
                gap: 1rem;
                margin-bottom: 0.7rem;
            }}
            .report-card-title {{
                font-weight: 800;
                color: #111111;
            }}
            .report-card-subtitle {{
                color: #4a4a4a;
                font-size: 0.92rem;
            }}
            .report-card-badge {{
                border-radius: 999px;
                padding: 0.28rem 0.75rem;
                font-size: 0.85rem;
                font-weight: 800;
                color: #111111;
                background: rgba(255,255,255,0.8);
                border: 1px solid rgba(0,0,0,0.08);
                white-space: nowrap;
            }}
            .report-card-grid {{
                display: grid;
                grid-template-columns: repeat(4, minmax(0, 1fr));
                gap: 0.5rem 0.8rem;
                margin-bottom: 0.8rem;
            }}
            .report-card-label {{
                color: #666666;
                font-size: 0.8rem;
                font-weight: 700;
                text-transform: uppercase;
                letter-spacing: 0.04em;
            }}
            .report-card-value {{
                color: #111111;
                font-weight: 600;
            }}
            .report-card-block {{
                margin-top: 0.55rem;
            }}
            .report-card-block strong {{
                color: #111111;
            }}
            .campogram-position-card {{
                background: rgba(255,255,255,0.78);
                border: 1px solid rgba(255,255,255,0.78);
                border-radius: 22px;
                padding: 0.9rem 1rem 1rem 1rem;
                box-shadow: 0 12px 26px rgba(10,10,10,0.05);
                backdrop-filter: blur(10px);
                height: 100%;
            }}
            .campogram-position-title {{
                display: inline-block;
                background: rgba(255,255,255,0.95);
                border: 2px solid rgba(231, 210, 26, 0.72);
                border-radius: 14px;
                padding: 0.38rem 0.72rem;
                color: #111111;
                font-weight: 900;
                margin-bottom: 0.7rem;
                box-shadow: 0 6px 16px rgba(10,10,10,0.04);
            }}
            .campogram-player-card {{
                border-radius: 16px;
                padding: 0.58rem 0.7rem;
                margin-bottom: 0.4rem;
                border-left: 6px solid #b8b8b8;
                box-shadow: 0 8px 18px rgba(10,10,10,0.04);
            }}
            .campogram-player-top {{
                display:flex;
                justify-content:space-between;
                align-items:flex-start;
                gap:0.55rem;
                margin-bottom:0.18rem;
            }}
            .campogram-player-name {{
                color:#111111;
                font-weight:900;
                font-size:0.98rem;
                line-height:1.05;
                margin-bottom:0.08rem;
            }}
            .campogram-player-meta {{
                color:#4a4a4a;
                font-size:0.82rem;
                line-height:1.2;
            }}
            .campogram-player-submeta {{
                color:#666666;
                font-size:0.76rem;
                margin-top:0.18rem;
            }}
            .campogram-badge {{
                display:inline-block;
                border-radius:999px;
                padding:0.22rem 0.62rem;
                font-size:0.76rem;
                font-weight:800;
                border:1px solid rgba(0,0,0,0.08);
                white-space:nowrap;
            }}
            .campogram-field {{
                background:
                    radial-gradient(circle at center, rgba(255,255,255,0.06), transparent 45%),
                    linear-gradient(180deg, rgba(34,139,34,0.16), rgba(12,93,36,0.18));
                border: 1px solid rgba(255,255,255,0.55);
                border-radius: 28px;
                padding: 1rem 1rem 1.15rem 1rem;
                box-shadow: inset 0 0 0 1px rgba(255,255,255,0.18), 0 14px 28px rgba(10,10,10,0.05);
                position: relative;
                overflow: hidden;
            }}
            .campogram-field:before {{
                content: "";
                position: absolute;
                inset: 0.9rem;
                border: 2px solid rgba(255,255,255,0.45);
                border-radius: 24px;
                pointer-events: none;
            }}
            .campogram-field-row {{
                position: relative;
                z-index: 1;
            }}
            .stTabs [data-baseweb="tab-list"] {{
                gap: 0.5rem;
            }}
            .stTabs [data-baseweb="tab"] {{
                background: rgba(255,255,255,0.64);
                border-radius: 999px;
                padding: 0.5rem 1rem;
            }}
            .stTabs [aria-selected="true"] {{
                background: {COLOR_BLACK} !important;
                color: {COLOR_WHITE} !important;
            }}
        </style>
        """,
        unsafe_allow_html=True,
    )


def render_header() -> None:
    st.markdown("<div style='height: 0.4rem;'></div>", unsafe_allow_html=True)
    col1, col2 = st.columns([1, 5])
    with col1:
        if LOGO_PATH.exists():
            st.image(str(LOGO_PATH), use_container_width=True)
    with col2:
        st.markdown(
            """
            <div class="unionistas-hero">
                <div class="unionistas-kicker">Unionistas de Salamanca CF</div>
                <h1 class="unionistas-title">Unionistas Scouting Lab</h1>
                <div class="unionistas-copy">
                    Seguimiento centralizado de informes, veredictos y actividad del equipo de Scouting
                </div>
            </div>
            """,
            unsafe_allow_html=True,
        )


def render_section_title(title: str) -> None:
    st.markdown(
        f'<div class="unionistas-section">{title}</div>',
        unsafe_allow_html=True,
    )


def render_section_title_inverse(title: str) -> None:
    st.markdown(
        f'<div class="unionistas-section-inverse">{title}</div>',
        unsafe_allow_html=True,
    )


def panel_start() -> None:
    st.markdown('<div class="unionistas-panel">', unsafe_allow_html=True)


def panel_end() -> None:
    st.markdown("</div>", unsafe_allow_html=True)


def verdict_token(verdict: object) -> str:
    return str(verdict or "Sin veredicto")


def render_report_card(report: pd.Series) -> None:
    report_date = (
        report["marca_temporal"].strftime("%d/%m/%Y %H:%M")
        if pd.notna(report.get("marca_temporal"))
        else "-"
    )
    verdict = verdict_token(report.get("veredicto"))
    st.markdown(
        f"""
        <div class="report-card" data-verdict="{verdict}">
            <div class="report-card-header">
                <div>
                    <div class="report-card-title">{report.get('ojeador') or 'Sin ojeador'}</div>
                    <div class="report-card-subtitle">{report_date}</div>
                </div>
                <div class="report-card-badge">{verdict}</div>
            </div>
            <div class="report-card-grid">
                <div>
                    <div class="report-card-label">Partido</div>
                    <div class="report-card-value">{report.get('partido_visionado') or '-'}</div>
                </div>
                <div>
                    <div class="report-card-label">Competición</div>
                    <div class="report-card-value">{report.get('competicion') or '-'}</div>
                </div>
                <div>
                    <div class="report-card-label">Visualización</div>
                    <div class="report-card-value">{report.get('visualizacion') or '-'}</div>
                </div>
                <div>
                    <div class="report-card-label">Equipo</div>
                    <div class="report-card-value">{report.get('equipo') or '-'}</div>
                </div>
            </div>
            <div class="report-card-block"><strong>Aspectos positivos:</strong> {report.get('aspectos_positivos') or '-'}</div>
            <div class="report-card-block"><strong>Aspectos negativos:</strong> {report.get('aspectos_negativos') or '-'}</div>
            <div class="report-card-block"><strong>Capacidades técnicas:</strong> {report.get('capacidades_tecnicas') or '-'}</div>
            <div class="report-card-block"><strong>Capacidades tácticas - psicológicas:</strong> {report.get('capacidades_tacticas_psicologicas') or '-'}</div>
            <div class="report-card-block"><strong>Capacidades físicas:</strong> {report.get('capacidades_fisicas') or '-'}</div>
        </div>
        """,
        unsafe_allow_html=True,
    )


def render_capability_summary_card(title: str, items: list[tuple[str, int]]) -> None:
    st.markdown(
        f'<div class="capability-title-box">{title}</div>',
        unsafe_allow_html=True,
    )
    if not items:
        st.caption("Sin patrones repetidos")
    else:
        chips = " ".join(
            f'<span style="display:inline-block; margin:0.2rem 0.35rem 0.2rem 0; '
            f'padding:0.32rem 0.7rem; border-radius:999px; background:rgba(255,255,255,0.9); '
            f'border:1px solid rgba(0,0,0,0.08); font-weight:700; color:#111111;">'
            f'{label} ({count})</span>'
            for label, count in items
        )
        st.markdown(chips, unsafe_allow_html=True)


@st.cache_data(ttl=3600, show_spinner=False)
def load_remote_image(url: str) -> Image.Image | None:
    if not url or url == "No disponible":
        return None
    try:
        response = requests.get(url, timeout=10)
        response.raise_for_status()
        return Image.open(BytesIO(response.content)).convert("RGBA")
    except Exception:
        return None


def make_circular_image(image: Image.Image, size: int, background_color: str = "#f3f1ea") -> Image.Image:
    fitted = ImageOps.fit(image, (size, size), method=Image.Resampling.LANCZOS)
    mask = Image.new("L", (size, size), 0)
    draw = ImageDraw.Draw(mask)
    draw.ellipse((0, 0, size, size), fill=255)
    base = Image.new("RGBA", (size, size), background_color)
    base.putalpha(mask)
    result = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    result.paste(base, (0, 0), mask)
    result.paste(fitted, (0, 0), mask)
    return result


def wrap_radar_label(label: str, width: int = 10) -> str:
    words = str(label).split()
    if not words:
        return str(label)

    lines: list[str] = []
    current = words[0]
    for word in words[1:]:
        candidate = f"{current} {word}"
        if len(candidate) <= width:
            current = candidate
        else:
            lines.append(current)
            current = word
    lines.append(current)
    return "\n".join(lines)


def render_objective_radar(
    objective_row: pd.Series,
    objective_df: pd.DataFrame,
) -> None:
    compare_mode_label = st.segmented_control(
        "Modo comparativa radar",
        options=["Posición específica", "Grupo general"],
        default="Posición específica",
        key=f"radar_compare_mode_{objective_row.get('id')}",
        label_visibility="collapsed",
    )
    compare_mode = "specific" if compare_mode_label == "Posición específica" else "general"

    try:
        radar_data = build_radar_dataset(
            objective_df,
            objective_row.get("id"),
            compare_mode=compare_mode,
        )
    except FileNotFoundError:
        st.info("Falta la configuración del radar.")
        return

    if not radar_data:
        st.info("No hay datos suficientes para construir el radar de este jugador.")
        return

    sample_count = radar_data["sample_count"]
    subtitle = (
        f"Percentiles vs {radar_data['comparison_label']} de {radar_data['competition_name']} | "
        f"mínimo {radar_data['minimum_minutes']} minutos | muestra: {sample_count} jugadores"
    )

    try:
        import matplotlib.pyplot as plt
        from mplsoccer import PyPizza
    except ImportError:
        st.info(
            "Para visualizar el radar instala las dependencias nuevas de la app: "
            "`pip install -r requirements.txt`."
        )
        return

    baker = PyPizza(
        params=[wrap_radar_label(label) for label in radar_data["params"]],
        background_color="#f8f7f2",
        straight_line_color="#ddd7c8",
        straight_line_lw=1,
        last_circle_color="#d1c8b2",
        last_circle_lw=1,
        other_circle_lw=0,
        inner_circle_size=18,
    )
    value_text_colors = ["#111111"] * len(radar_data["values"])
    fig, ax = baker.make_pizza(
        radar_data["values"],
        figsize=(3.0, 3.1),
        color_blank_space="same",
        slice_colors=radar_data["slice_colors"],
        value_colors=value_text_colors,
        value_bck_colors=radar_data["slice_colors"],
        blank_alpha=0.38,
        kwargs_slices=dict(edgecolor="#ddd7c8", zorder=2, linewidth=1),
        kwargs_params=dict(color="#222222", fontsize=4.1, va="center"),
        kwargs_values=dict(
            color="#111111",
            fontsize=4.5,
            zorder=3,
            bbox=dict(
                edgecolor="#ddd7c8",
                facecolor="#fcfbf7",
                boxstyle="round,pad=0.2",
                lw=1,
            ),
        ),
    )
    fig.patch.set_facecolor("#f8f7f2")
    fig.text(
        0.5,
        0.972,
        f"{objective_row.get('full_name', '-')}",
        size=6.8,
        ha="center",
        color="#111111",
        weight="bold",
    )
    fig.text(
        0.5,
        0.946,
        subtitle,
        size=4.8,
        ha="center",
        color="#5f5a4d",
    )
    fig.text(
        0.5,
        0.919,
        "Ataque        Posesión / Progresión        Defensa",
        size=5.0,
        ha="center",
        color="#111111",
        weight="bold",
    )
    fig.patches.extend(
        [
            plt.Rectangle((0.292, 0.912), 0.014, 0.012, fill=True, color="#1A78CF", transform=fig.transFigure, figure=fig),
            plt.Rectangle((0.455, 0.912), 0.014, 0.012, fill=True, color="#FF9300", transform=fig.transFigure, figure=fig),
            plt.Rectangle((0.676, 0.912), 0.014, 0.012, fill=True, color="#D70232", transform=fig.transFigure, figure=fig),
        ]
    )
    player_image = load_remote_image(str(objective_row.get("image", "")))
    if player_image is not None:
        portrait_ax = fig.add_axes([0.453, 0.436, 0.114, 0.114], zorder=5)
        portrait_ax.imshow(make_circular_image(player_image, 190, background_color="#f8f7f2"))
        portrait_ax.set_facecolor("#f8f7f2")
        portrait_ax.set_axis_off()
    fig.set_dpi(190)
    fig.text(
        0.985,
        0.02,
        "Creado por Ramón Codesido | Data: Wyscout",
        size=6.2,
        ha="right",
        color="#111111",
    )
    st.pyplot(fig, use_container_width=True)
    plt.close(fig)

    if sample_count < 10:
        st.warning(
            "Muestra muy reducida: este radar puede resultar engañoso. "
            "Interprétalo con mucha cautela."
        )
    elif sample_count < 15:
        st.caption("Muestra reducida: interpreta estos percentiles con cautela.")


def format_objective_value(value: object, *, percentage: bool = False, integer: bool = False) -> str:
    if pd.isna(value):
        return "-"
    try:
        numeric_value = float(value)
    except (TypeError, ValueError):
        return str(value)
    if integer:
        return str(int(round(numeric_value)))
    if percentage:
        return f"{numeric_value:.2f}%"
    if numeric_value.is_integer():
        return str(int(numeric_value))
    return f"{numeric_value:.2f}"


def render_objective_metric_card(label: str, value: str) -> None:
    st.markdown(
        f"""
        <div class="objective-mini-metric">
            <div class="objective-mini-metric-label">{label}</div>
            <div class="objective-mini-metric-value">{value}</div>
        </div>
        """,
        unsafe_allow_html=True,
    )


def render_subjective_metric_card(label: str, value: str, detail: str | None = None) -> None:
    detail_html = (
        f'<div style="color:#666666; font-size:0.8rem; font-weight:600; margin-top:0.45rem;">{detail}</div>'
        if detail
        else ""
    )
    st.markdown(
        f"""
        <div class="subjective-metric-card">
            <div class="objective-mini-metric-label">{label}</div>
            <div class="objective-mini-metric-value">{value}</div>
            {detail_html}
        </div>
        """,
        unsafe_allow_html=True,
    )


def _scout_initials(name: object) -> str:
    tokens = [token for token in str(name or "").strip().split() if token]
    if not tokens:
        return ""
    return "".join(token[0].upper() for token in tokens[:3])


def render_scout_activity_panel(player_df: pd.DataFrame, mode: str) -> None:
    if player_df.empty or "marca_temporal" not in player_df.columns or "ojeador" not in player_df.columns:
        st.info("No hay datos suficientes para este bloque.")
        return

    panel_df = player_df.dropna(subset=["marca_temporal", "ojeador"]).copy()
    if panel_df.empty:
        st.info("No hay datos suficientes para este bloque.")
        return

    if mode == "verdict":
        panel_df = panel_df.dropna(subset=["veredicto"]).copy()
        title = "Valoraciones por scout y fecha"
        value_column = "veredicto"
        y_order = ["A+", "A", "B", "C", "D", "E", "Seguir Valorando", "Filial/Juvenil DH"]
        color_scale = alt.Scale(
            domain=y_order,
            range=["#0f8a3b", "#55a630", "#d4b000", "#f08c00", "#d9480f", "#c1121f", "#f08c00", "#7b2cbf"],
        )
    else:
        panel_df = panel_df.dropna(subset=["demarcacion_principal"]).copy()
        title = "Posición principal por scout y fecha"
        value_column = "demarcacion_principal"
        short_labels = {
            "Portero": "POR",
            "Central": "CEN",
            "Central Derecho": "CD",
            "Central Izquierdo": "CI",
            "Central del centro": "CC",
            "Lateral Derecho": "LD",
            "Lateral Izquierdo": "LI",
            "Carrilero Derecho": "CAD",
            "Carrilero Izquierdo": "CAI",
            "Pivote": "PIV",
            "Mediocentro": "MC",
            "Mediapunta": "MP",
            "Interior": "INT",
            "Interior derecho": "ID",
            "Interior izquierdo": "II",
            "Extremo Derecho": "ED",
            "Extremo Izquierdo": "EI",
            "Delantero Centro": "DC",
            "Segundo punta": "SP",
        }
        y_order = panel_df["demarcacion_principal"].dropna().astype(str).drop_duplicates().tolist()
        color_scale = alt.Scale(scheme="set2")

    if panel_df.empty:
        st.info("No hay datos suficientes para este bloque.")
        return

    panel_df = panel_df.sort_values(["marca_temporal", "ojeador"]).copy()
    panel_df["fecha_label"] = panel_df["marca_temporal"].dt.strftime("%d/%m/%y")
    panel_df["ojeador"] = panel_df["ojeador"].astype(str).str.strip()
    panel_df["scout_initials"] = panel_df["ojeador"].map(_scout_initials)
    panel_df["cell_display"] = panel_df["ojeador"]

    duplicate_counts = (
        panel_df.groupby(["fecha_label", value_column])["ojeador"]
        .transform("size")
    )
    panel_df.loc[duplicate_counts > 1, "cell_display"] = (
        panel_df.loc[duplicate_counts > 1]
        .groupby(["fecha_label", value_column])["scout_initials"]
        .transform(lambda values: " / ".join(values))
    )
    panel_df["tooltip_scouts"] = (
        panel_df.groupby(["fecha_label", value_column])["ojeador"]
        .transform(lambda values: " | ".join(values))
    )

    chart_df = (
        panel_df.groupby(["fecha_label", "marca_temporal", value_column], as_index=False)
        .agg(
            cell_display=("cell_display", "first"),
            tooltip_scouts=("tooltip_scouts", "first"),
        )
        .sort_values("marca_temporal")
    )

    x_order = chart_df["fecha_label"].drop_duplicates().tolist()

    base = alt.Chart(chart_df)
    marks = base.mark_rect(cornerRadius=6, opacity=0.95, width=86, height=30).encode(
        x=alt.X(
            "fecha_label:N",
            sort=x_order,
            title=None,
            axis=alt.Axis(labelAngle=-35, labelFontSize=10, labelLimit=90),
        ),
        y=alt.Y(
            f"{value_column}:N",
            sort=y_order,
            title=None,
            axis=alt.Axis(labelFontSize=11, labelLimit=150),
        ),
        color=alt.Color(f"{value_column}:N", scale=color_scale, legend=None),
        tooltip=[
            alt.Tooltip("tooltip_scouts:N", title="Scout"),
            alt.Tooltip("marca_temporal:T", title="Fecha"),
            alt.Tooltip(f"{value_column}:N", title=("Veredicto" if mode == "verdict" else "Demarcación")),
        ],
    )
    text = base.mark_text(
        color="#111111",
        fontSize=8,
        fontWeight="bold",
    ).encode(
        x=alt.X("fecha_label:N", sort=x_order),
        y=alt.Y(f"{value_column}:N", sort=y_order),
        text=alt.Text("cell_display:N"),
    )
    row_height = 46 if mode == "verdict" else 52
    min_height = 145 if mode == "verdict" else 165
    chart_height = max(min_height, len(y_order) * row_height)
    chart = (
        (marks + text)
        .properties(height=chart_height)
        .configure(background="#f8f7f2")
        .configure_view(strokeOpacity=0)
        .configure_axis(
            labelColor=COLOR_DARK_GRAY,
            titleColor=COLOR_DARK_GRAY,
            gridColor="#E3DED0",
            tickColor="#D9D9D9",
            domainColor="#D9D9D9",
        )
    )
    st.markdown('<div class="subjective-chart-panel">', unsafe_allow_html=True)
    st.markdown(
        f'<div class="subjective-chart-title">{title}</div>',
        unsafe_allow_html=True,
    )
    chart_col_left, chart_col_center, chart_col_right = st.columns([0.01, 0.98, 0.01])
    with chart_col_center:
        st.altair_chart(chart, use_container_width=True)
    st.markdown("</div>", unsafe_allow_html=True)


def render_objective_player_section(
    selected_player: str,
    player_summary: dict[str, str | int],
    objective_df: pd.DataFrame | None,
    matches_df: pd.DataFrame | None,
) -> None:
    if objective_df is None or matches_df is None or objective_df.empty or matches_df.empty:
        render_section_title_inverse("Datos objetivos RFEF")
        st.info("La capa objetiva aun no esta disponible en este entorno.")
        return

    player_matches = matches_df[
        (matches_df["scouting_player_name"] == selected_player)
        & (matches_df["match_status"] != "sin_match")
    ].copy()
    if player_matches.empty:
        render_section_title_inverse("Datos objetivos RFEF")
        st.info("Este jugador aun no tiene datos objetivos vinculados.")
        return

    candidate_rows = player_matches.merge(
        objective_df[
            [
                "id",
                "full_name",
                "current_team_name",
                "domestic_competition_name",
                "last_club_name",
                "minutes_on_field",
                "objective_dataset",
            ]
        ],
        left_on="objective_player_id",
        right_on="id",
        how="left",
        suffixes=("", "_objective"),
    ).copy()

    scouting_team = _normalize_match_team(player_summary.get("team"))
    status_rank = {"seguro": 0, "probable": 1, "dudoso": 2, "sin_match": 3}
    candidate_rows["status_rank"] = candidate_rows["match_status"].map(status_rank).fillna(9)
    candidate_rows["preferred_team_match"] = (
        candidate_rows["objective_team"].map(_normalize_match_team).eq(scouting_team)
        | candidate_rows["objective_last_club"].map(_normalize_match_team).eq(scouting_team)
        | candidate_rows["current_team_name"].map(_normalize_match_team).eq(scouting_team)
        | candidate_rows["last_club_name"].map(_normalize_match_team).eq(scouting_team)
    ).astype(int)
    scouting_competition_family = _competition_family(player_summary.get("competition"))
    candidate_rows["preferred_competition_match"] = (
        candidate_rows["objective_dataset"].map(objective_dataset_label).map(_competition_family).eq(scouting_competition_family)
        | candidate_rows["domestic_competition_name"].map(_competition_family).eq(scouting_competition_family)
    ).astype(int)
    candidate_rows["minutes_on_field"] = (
        pd.to_numeric(candidate_rows["minutes_on_field"], errors="coerce").fillna(0)
    )
    candidate_rows = candidate_rows.sort_values(
        [
            "status_rank",
            "preferred_competition_match",
            "match_score",
            "preferred_team_match",
            "minutes_on_field",
            "name_similarity",
        ],
        ascending=[True, False, False, False, False, False],
    ).reset_index(drop=True)

    selected_match_row = candidate_rows.iloc[0]
    if len(candidate_rows) > 1:
        st.warning("Este jugador tiene mas de un match objetivo posible.")
        selector_labels: dict[int, str] = {}
        for idx, row in candidate_rows.iterrows():
            dataset_label = objective_dataset_label(row.get("objective_dataset"))
            team_label = row.get("current_team_name") or row.get("objective_team") or "Equipo desconocido"
            score_label = format_objective_value(row.get("match_score", 0) * 100, percentage=True)
            selector_labels[idx] = (
                f"{team_label} | {dataset_label} | "
                f"{row.get('match_status', '').title()} | score {score_label}"
            )

        selected_index = st.selectbox(
            "Equipo / registro objetivo a usar",
            options=list(selector_labels.keys()),
            index=0,
            key=f"objective_match_selector_{selected_player}",
            format_func=lambda idx: selector_labels[idx],
        )
        selected_match_row = candidate_rows.iloc[selected_index]

    objective_player = objective_df[
        objective_df["id"] == selected_match_row["objective_player_id"]
    ].head(1)
    if objective_player.empty:
        render_section_title_inverse("Datos objetivos RFEF")
        st.info("Se encontro el match, pero no la fila objetiva asociada.")
        return

    match_row = selected_match_row
    objective_row = objective_player.iloc[0]
    dataset_label = objective_dataset_label(objective_row.get("objective_dataset"))
    render_section_title_inverse(f"Datos objetivos {dataset_label}")

    status_colors = {
        "seguro": ("#0f8a3b", "rgba(232, 248, 236, 0.92)"),
        "probable": ("#d4b000", "rgba(255, 247, 214, 0.92)"),
        "dudoso": ("#f08c00", "rgba(255, 239, 213, 0.92)"),
        "sin_match": ("#b8b8b8", "rgba(242, 242, 242, 0.92)"),
    }
    border_color, badge_background = status_colors.get(
        str(match_row.get("match_status", "")),
        ("#b8b8b8", "rgba(242, 242, 242, 0.92)"),
    )

    identity_col, summary_col = st.columns([1.2, 2.8])
    with identity_col:
        player_image = objective_row.get("image")
        team_logo = objective_row.get("current_team_logo")
        if player_image and player_image != "No disponible":
            logo_html = ""
            if team_logo and team_logo != "No disponible":
                logo_html = (
                    f'<img src="{team_logo}" alt="Escudo" '
                    f'style="position:absolute; right:10px; bottom:4px; width:70px; height:70px; '
                    f'background:rgba(255,255,255,0.95); border-radius:999px; padding:7px; '
                    f'box-shadow:0 8px 20px rgba(10,10,10,0.14); border:1px solid rgba(0,0,0,0.06);" />'
                )
            st.markdown(
                f"""
                <div style="position:relative; width:230px; height:230px; margin:0 auto 0.6rem auto;">
                    <img src="{player_image}" alt="Jugador"
                         style="width:190px; height:190px; object-fit:cover; border-radius:999px;
                                display:block; margin:0 auto; border:6px solid rgba(255,255,255,0.92);
                                box-shadow:0 14px 34px rgba(10,10,10,0.12);" />
                    {logo_html}
                </div>
                """,
                unsafe_allow_html=True,
            )
    with summary_col:
        st.markdown(
            f"""
            <div style="background:rgba(255,255,255,0.86); border:1px solid rgba(255,255,255,0.72);
                        border-left:6px solid {border_color}; border-radius:20px; padding:1rem 1.1rem; margin-bottom:0.8rem;">
                <div style="display:flex; justify-content:space-between; gap:1rem; align-items:flex-start; flex-wrap:wrap;">
                    <div>
                        <div style="font-size:1.15rem; font-weight:800; color:#111111;">{objective_row.get('full_name', '-')}</div>
                        <div style="color:#4a4a4a; margin-top:0.2rem;">{objective_row.get('current_team_name', '-')} | {objective_row.get('domestic_competition_name', '-')}</div>
                    </div>
                    <div style="padding:0.28rem 0.75rem; border-radius:999px; font-weight:800; color:#111111; background:{badge_background}; border:1px solid rgba(0,0,0,0.08);">
                        Match {str(match_row.get('match_status', '')).title()}
                    </div>
                </div>
                <div style="display:grid; grid-template-columns:repeat(4, minmax(0, 1fr)); gap:0.8rem; margin-top:0.85rem;">
                    <div><div class="report-card-label">Nacimiento</div><div class="report-card-value">{format_objective_value(objective_row.get('birth_year'), integer=True)}</div></div>
                    <div><div class="report-card-label">Posición principal</div><div class="report-card-value">{objective_row.get('primary_position_label', '-')}</div></div>
                    <div><div class="report-card-label">Posición secundaria</div><div class="report-card-value">{objective_row.get('secondary_position_label', '-')}</div></div>
                    <div><div class="report-card-label">Pie</div><div class="report-card-value">{objective_row.get('foot', '-')}</div></div>
                </div>
            </div>
            """,
            unsafe_allow_html=True,
        )
        st.caption(
            "Matching: "
            f"nombre {format_objective_value(match_row.get('name_similarity') * 100, percentage=True)} | "
            f"equipo {format_objective_value(match_row.get('team_similarity') * 100, percentage=True)} | "
            f"score {format_objective_value(match_row.get('match_score') * 100, percentage=True)}"
        )

    metric_labels = {
        "minutes_on_field": "Minutos",
        "total_matches": "Partidos",
        "goals": "Goles",
        "goals_avg": "Goles/90",
        "non_penalty_goal_avg": "Goles s/penalti/90",
        "assists": "Asistencias",
        "assists_avg": "Asistencias/90",
        "xg_shot": "xG total",
        "xg_shot_avg": "xG/90",
        "xg_assist": "xA total",
        "xg_assist_avg": "xA/90",
        "xg_per_shot": "xG/tiro",
        "shots": "Tiros totales",
        "shots_avg": "Tiros/90",
        "touch_in_box_avg": "Toques area/90",
        "passes_avg": "Pases/90",
        "passes_to_final_third_avg": "Pases ult. tercio/90",
        "accurate_passes_percent": "% pase",
        "progressive_pass_avg": "Pases prog./90",
        "successful_progressive_pass_percent": "% pases prog.",
        "dribbles_avg": "Regates/90",
        "successful_dribbles_percent": "% regate",
        "progressive_run_avg": "Conducciones prog./90",
        "duels_avg": "Duelos/90",
        "duels_won": "% duelos",
        "defensive_duels_avg": "Duelos def./90",
        "defensive_duels_won": "% duelo def.",
        "aerial_duels_avg": "Aereos/90",
        "aerial_duels_won": "% aereos",
        "successful_defensive_actions_avg": "Acciones def./90",
        "interceptions_avg": "Intercepciones/90",
        "shot_block_avg": "Bloqueos/90",
        "save_percent": "% paradas",
        "clean_sheets": "Porterías a cero",
        "prevented_goals": "Goles evitados",
        "prevented_goals_avg": "Goles evitados/90",
        "xg_save_avg": "xG save/90",
        "back_pass_to_gk_avg": "Cesiones/90",
        "shots_against": "Tiros recibidos",
        "conceded_goals": "Goles encajados",
        "goalkeeper_exits_avg": "Salidas/90",
        "gk_aerial_duels_avg": "Aéreos port./90",
    }
    percentage_metrics = {
        "accurate_passes_percent",
        "successful_progressive_pass_percent",
        "successful_dribbles_percent",
        "duels_won",
        "defensive_duels_won",
        "aerial_duels_won",
        "save_percent",
    }
    integer_metrics = {
        "minutes_on_field",
        "total_matches",
        "goals",
        "assists",
        "shots",
        "clean_sheets",
        "shots_against",
        "conceded_goals",
    }
    preferred_metric_columns = get_objective_metric_panel_columns(objective_row, limit=14)
    fallback_metric_columns = [
        column
        for column in get_objective_app_visible_columns(objective_df)
        if column in metric_labels
    ]
    visible_columns = [
        column for column in preferred_metric_columns if column in metric_labels and column in objective_row.index
    ] or fallback_metric_columns[:14]

    radar_col, metrics_col = st.columns([1.02, 0.98], gap="large")
    with radar_col:
        render_section_title(f"Radar percentil {dataset_label}")
        render_objective_radar(objective_row, objective_df)

    with metrics_col:
        render_section_title("Métricas clave")
        visible_metric_columns = visible_columns[:14]
        for row_start in range(0, len(visible_metric_columns), 2):
            row_columns = st.columns(2)
            for offset, column in enumerate(visible_metric_columns[row_start:row_start + 2]):
                with row_columns[offset]:
                    render_objective_metric_card(
                        metric_labels[column],
                        format_objective_value(
                            objective_row.get(column),
                            percentage=column in percentage_metrics,
                            integer=column in integer_metrics,
                        ),
                    )

    with st.expander("Ver detalle objetivo completo", expanded=False):
        detail_columns = [
            column
            for column in get_objective_app_visible_columns(objective_df)
            if column in objective_row.index
        ]
        detail_df = pd.DataFrame(
            {
                "Campo": detail_columns,
                "Valor": [
                    format_objective_value(
                        objective_row.get(column),
                        percentage=column in percentage_metrics,
                        integer=column in integer_metrics or column == "birth_year",
                    )
                    for column in detail_columns
                ],
            }
        )
        st.dataframe(detail_df, use_container_width=True, hide_index=True)


def render_objective_matching_section(
    matches_df: pd.DataFrame | None,
    *,
    dataset_key: str,
    title: str,
) -> None:
    if matches_df is None or matches_df.empty:
        st.info("No se ha podido generar la tabla de matching objetivo en este entorno.")
        return

    dataset_matches = matches_df[matches_df["objective_dataset"] == dataset_key].copy()
    if dataset_matches.empty:
        return

    render_section_title(title)

    status_counts = dataset_matches["match_status"].value_counts()
    col1, col2, col3, col4 = st.columns(4)
    col1.metric("Matches seguros", int(status_counts.get("seguro", 0)))
    col2.metric("Matches probables", int(status_counts.get("probable", 0)))
    col3.metric("Matches dudosos", int(status_counts.get("dudoso", 0)))
    col4.metric("Sin match", int(status_counts.get("sin_match", 0)))

    review_df = dataset_matches[
        [
            "objective_full_name",
            "objective_birth_year",
            "objective_team",
            "scouting_player_name",
            "scouting_birth_year",
            "scouting_team",
            "match_status",
            "match_score",
            "name_similarity",
            "team_similarity",
        ]
    ].copy()
    review_df = review_df.rename(
        columns={
            "objective_full_name": "Jugador objetivo",
            "objective_birth_year": "Año objetivo",
            "objective_team": "Equipo objetivo",
            "scouting_player_name": "Jugador scouting",
            "scouting_birth_year": "Año scouting",
            "scouting_team": "Equipo scouting",
            "match_status": "Estado",
            "match_score": "Score",
            "name_similarity": "Sim. nombre",
            "team_similarity": "Sim. equipo",
        }
    )
    for column in ["Score", "Sim. nombre", "Sim. equipo"]:
        review_df[column] = review_df[column].map(lambda value: f"{float(value) * 100:.1f}%" if pd.notna(value) else "-")

    with st.expander(f"Revisar tabla de matching {objective_dataset_label(dataset_key)}", expanded=False):
        st.dataframe(review_df, use_container_width=True, hide_index=True, height=520)


def render_scouting_matching_section(
    full_df: pd.DataFrame,
    matches_df: pd.DataFrame | None,
    *,
    competition_prefix: str,
    title: str,
) -> None:
    if matches_df is None or matches_df.empty:
        return

    scouting_filtered = full_df[
        full_df["competicion"].fillna("").astype(str).str.startswith(competition_prefix, na=False)
    ].copy()
    if scouting_filtered.empty:
        return

    scouting_players = (
        scouting_filtered.groupby("nombre_jugador", as_index=False)
        .agg(
            ano_nacimiento=("ano_nacimiento", "first"),
            equipo=("equipo", "first"),
            num_informes=("nombre_jugador", "size"),
        )
        .sort_values(["num_informes", "nombre_jugador"], ascending=[False, True])
    )

    best_matches = (
        matches_df.dropna(subset=["scouting_player_name"])
        .sort_values(["match_score", "name_similarity", "team_similarity"], ascending=False)
        .drop_duplicates(subset=["scouting_player_name"])
        .copy()
    )
    scouting_review = scouting_players.merge(
        best_matches,
        left_on="nombre_jugador",
        right_on="scouting_player_name",
        how="left",
    )
    scouting_review["estado_revision"] = scouting_review["match_status"].fillna("sin_match")

    status_counts = scouting_review["estado_revision"].value_counts()
    total_players = int(len(scouting_review))
    matched_players = int(total_players - status_counts.get("sin_match", 0))
    coverage = (matched_players / total_players * 100) if total_players else 0

    render_section_title(title)
    col1, col2, col3, col4 = st.columns(4)
    col1.metric("Jugadores scouting", total_players)
    col2.metric("Con match", matched_players)
    col3.metric("Sin match", int(status_counts.get("sin_match", 0)))
    col4.metric("Cobertura", f"{coverage:.1f}%")

    scouting_display = scouting_review[
        [
            "nombre_jugador",
            "ano_nacimiento",
            "equipo",
            "num_informes",
            "objective_full_name",
            "objective_team",
            "estado_revision",
            "match_score",
            "name_similarity",
            "team_similarity",
        ]
    ].copy()
    scouting_display = scouting_display.rename(
        columns={
            "nombre_jugador": "Jugador scouting",
            "ano_nacimiento": "Año scouting",
            "equipo": "Equipo scouting",
            "num_informes": "Nº informes",
            "objective_full_name": "Jugador objetivo",
            "objective_team": "Equipo objetivo",
            "estado_revision": "Estado",
            "match_score": "Score",
            "name_similarity": "Sim. nombre",
            "team_similarity": "Sim. equipo",
        }
    )
    for column in ["Score", "Sim. nombre", "Sim. equipo"]:
        scouting_display[column] = scouting_display[column].map(
            lambda value: f"{float(value) * 100:.1f}%" if pd.notna(value) else "-"
        )
    scouting_display["Año scouting"] = scouting_display["Año scouting"].map(
        lambda value: str(int(float(value))) if pd.notna(value) else "-"
    )

    with st.expander(f"Revisar jugadores scouting y su match objetivo ({competition_prefix})", expanded=False):
        st.dataframe(
            scouting_display,
            use_container_width=True,
            hide_index=True,
            height=520,
        )


def render_labeled_bar_chart(
    data: pd.DataFrame,
    category_column: str,
    value_column: str,
    title: str,
    horizontal: bool = False,
    x_label_angle: int = 0,
    value_axis_title: str = "Informes",
) -> None:
    if data.empty:
        st.info("No hay datos para este gráfico.")
        return

    base = alt.Chart(data)
    chart_height = max(420, len(data) * 32) if horizontal else 420
    if horizontal:
        bars = base.mark_bar(
            color=COLOR_BLACK,
            cornerRadiusTopRight=6,
            cornerRadiusBottomRight=6,
        ).encode(
            x=alt.X(f"{value_column}:Q", title=value_axis_title),
            y=alt.Y(
                f"{category_column}:N",
                sort="-x",
                title=None,
                axis=alt.Axis(labelLimit=280, labelFontSize=14),
            ),
            tooltip=[category_column, value_column],
            opacity=alt.value(1),
        )
        labels = base.mark_text(
            align="left",
            baseline="middle",
            dx=6,
            color=COLOR_BLACK,
            fontSize=13,
            fontWeight="bold",
        ).encode(
            x=alt.X(f"{value_column}:Q"),
            y=alt.Y(f"{category_column}:N", sort="-x"),
            text=alt.Text(f"{value_column}:Q", format=".0f"),
        )
    else:
        bars = base.mark_bar(
            color=COLOR_GOLD,
            cornerRadiusTopLeft=6,
            cornerRadiusTopRight=6,
        ).encode(
            x=alt.X(
                f"{category_column}:N",
                sort="-y",
                title=None,
                axis=alt.Axis(
                    labelAngle=x_label_angle,
                    labelLimit=180,
                    labelFontSize=14,
                ),
            ),
            y=alt.Y(f"{value_column}:Q", title=value_axis_title),
            tooltip=[category_column, value_column],
            opacity=alt.value(1),
        )
        labels = base.mark_text(
            dy=-10,
            color=COLOR_BLACK,
            fontSize=13,
            fontWeight="bold",
        ).encode(
            x=alt.X(f"{category_column}:N", sort="-y"),
            y=alt.Y(f"{value_column}:Q"),
            text=alt.Text(f"{value_column}:Q", format=".0f"),
        )

    chart = (
        (bars + labels)
        .properties(
            title=title,
            height=chart_height,
            padding={"top": 24, "left": 8, "right": 8, "bottom": 8},
        )
        .configure_view(strokeOpacity=0)
        .configure_title(
            color=COLOR_BLACK,
            fontSize=18,
            fontWeight="bold",
            anchor="middle",
            offset=18,
        )
        .configure_axis(
            labelColor=COLOR_DARK_GRAY,
            titleColor=COLOR_DARK_GRAY,
            gridColor="#D9D9D9",
            tickColor="#D9D9D9",
        )
    )
    st.altair_chart(chart, use_container_width=True)


def render_position_competition_heatmap(df: pd.DataFrame) -> None:
    required_columns = {"competicion", "demarcacion_principal", "nombre_jugador"}
    if not required_columns.issubset(df.columns):
        return

    heatmap_df = (
        df.dropna(subset=["competicion", "demarcacion_principal", "nombre_jugador"])
        .groupby(["demarcacion_principal", "competicion"], as_index=False)["nombre_jugador"]
        .nunique()
        .rename(columns={"nombre_jugador": "jugadores"})
    )

    if heatmap_df.empty:
        st.info("No hay datos suficientes para el heatmap con los filtros actuales.")
        return

    competition_order = (
        heatmap_df.groupby("competicion", as_index=False)["jugadores"]
        .sum()
        .sort_values("jugadores", ascending=False)["competicion"]
        .tolist()
    )
    position_order = (
        heatmap_df.groupby("demarcacion_principal", as_index=False)["jugadores"]
        .sum()
        .sort_values("jugadores", ascending=False)["demarcacion_principal"]
        .tolist()
    )

    full_competition_order = competition_order + ["Total"]

    full_index = pd.MultiIndex.from_product(
        [position_order, competition_order],
        names=["demarcacion_principal", "competicion"],
    )
    complete_heatmap = (
        heatmap_df.set_index(["demarcacion_principal", "competicion"])
        .reindex(full_index, fill_value=0)
        .reset_index()
    )

    totals_column = (
        complete_heatmap.groupby("demarcacion_principal", as_index=False)["jugadores"]
        .sum()
        .assign(competicion="Total")
    )
    totals_row = (
        complete_heatmap.groupby("competicion", as_index=False)["jugadores"]
        .sum()
        .assign(demarcacion_principal="Total")
    )
    grand_total = int(df["nombre_jugador"].dropna().nunique())
    total_corner = pd.DataFrame(
        [{"demarcacion_principal": "Total", "competicion": "Total", "jugadores": grand_total}]
    )
    chart_data = pd.concat(
        [complete_heatmap, totals_column, totals_row, total_corner],
        ignore_index=True,
    )
    y_order = position_order + ["Total"]
    chart_data["competicion"] = pd.Categorical(
        chart_data["competicion"],
        categories=full_competition_order,
        ordered=True,
    )
    chart_data["demarcacion_principal"] = pd.Categorical(
        chart_data["demarcacion_principal"],
        categories=y_order,
        ordered=True,
    )

    normal_cells = chart_data[
        (chart_data["competicion"] != "Total")
        & (chart_data["demarcacion_principal"] != "Total")
    ].copy()
    total_cells = chart_data[
        (chart_data["competicion"] == "Total")
        | (chart_data["demarcacion_principal"] == "Total")
    ].copy()

    normal_base = alt.Chart(normal_cells)
    total_base = alt.Chart(total_cells)
    rect_normal = normal_base.mark_rect(cornerRadius=6).encode(
        x=alt.X(
            "competicion:N",
            sort=full_competition_order,
            title=None,
            axis=alt.Axis(
                orient="top",
                labelAngle=-90,
                labelLimit=400,
                labelFontSize=12,
                labelPadding=10,
                ticks=False,
            ),
        ),
        y=alt.Y(
            "demarcacion_principal:N",
            sort=y_order,
            title=None,
            axis=alt.Axis(labelFontSize=13, ticks=False, domain=False),
        ),
        color=alt.Color(
            "jugadores:Q",
            title="Jugadores únicos",
            scale=alt.Scale(
                type="sqrt",
                domain=[0, max(1, int(normal_cells["jugadores"].max()))],
                range=["#fffaf0", "#f8df95", "#efc14f", "#d9a404", "#9c6b00"],
            ),
        ),
        tooltip=[
            alt.Tooltip("competicion:N", title="Competición"),
            alt.Tooltip("demarcacion_principal:N", title="Demarcación principal"),
            alt.Tooltip("jugadores:Q", title="Jugadores"),
        ],
    )
    rect_total = total_base.mark_rect(cornerRadius=6).encode(
        x=alt.X("competicion:N", sort=full_competition_order, title=None),
        y=alt.Y("demarcacion_principal:N", sort=y_order, title=None),
        color=alt.Color(
            "jugadores:Q",
            title="Jugadores únicos",
            scale=alt.Scale(
                type="sqrt",
                domain=[0, max(1, int(total_cells["jugadores"].max()))],
                range=["#f8efc8", "#edd26a", "#d5af16", "#a77c00"],
            ),
        ),
        tooltip=[
            alt.Tooltip("competicion:N", title="Competición"),
            alt.Tooltip("demarcacion_principal:N", title="Demarcación principal"),
            alt.Tooltip("jugadores:Q", title="Jugadores"),
        ],
    )

    text = alt.Chart(chart_data).mark_text(
        fontSize=12,
        color=COLOR_BLACK,
        fontWeight="bold",
    ).encode(
        x=alt.X("competicion:N", sort=full_competition_order),
        y=alt.Y("demarcacion_principal:N", sort=y_order),
        text=alt.Text("jugadores:Q", format=".0f"),
    )

    chart_height = max(320, 42 * len(y_order))
    heatmap = (
        (rect_normal + rect_total + text)
        .properties(
            title="Heatmap de jugadores por competición y demarcación principal",
            height=chart_height,
            padding={"top": 22, "left": 8, "right": 8, "bottom": 8},
        )
        .configure_view(stroke="#8D8D8D", strokeWidth=1.2)
        .configure_title(
            color=COLOR_BLACK,
            fontSize=18,
            fontWeight="bold",
            anchor="middle",
            offset=18,
        )
        .configure_axis(
            labelColor=COLOR_DARK_GRAY,
            titleColor=COLOR_DARK_GRAY,
            grid=False,
            tickColor="#D9D9D9",
            domainColor="#8D8D8D",
            domainWidth=1.2,
        )
        .configure_legend(
            titleColor=COLOR_DARK_GRAY,
            labelColor=COLOR_DARK_GRAY,
            orient="bottom",
            gradientLength=220,
        )
    )
    st.altair_chart(heatmap, use_container_width=True)
    st.caption(
        "La esquina inferior derecha muestra jugadores únicos globales del conjunto filtrado. "
        "Las filas y columnas pueden sumar más porque un mismo jugador puede aparecer en varias competiciones o demarcaciones."
    )


def build_top_counts(
    df: pd.DataFrame,
    group_column: str,
    label: str,
    top_n: int = 10,
) -> pd.DataFrame:
    if group_column not in df.columns:
        return pd.DataFrame(columns=[label, "informes"])
    return (
        df[group_column]
        .fillna(f"Sin {label.lower()}")
        .astype(str)
        .str.strip()
        .value_counts()
        .head(top_n)
        .rename_axis(label)
        .reset_index(name="informes")
    )


def render_rankings_section(full_df: pd.DataFrame) -> None:
    render_section_title("Rankings")
    st.caption("Top 20 global de seguimiento, no afectado por filtros.")

    players_ranking = build_top_counts(full_df, "nombre_jugador", "Jugador", top_n=20)
    teams_ranking = build_top_counts(full_df, "equipo", "Equipo", top_n=20)

    col1, col2 = st.columns(2)
    with col1:
        render_labeled_bar_chart(
            players_ranking,
            category_column="Jugador",
            value_column="informes",
            title="Top 20 jugadores más vistos",
            horizontal=True,
        )
    with col2:
        render_labeled_bar_chart(
            teams_ranking,
            category_column="Equipo",
            value_column="informes",
            title="Top 20 equipos más vistos",
            horizontal=True,
        )


def initialize_state() -> None:
    defaults = {
        "active_view": "Dashboard",
        "dashboard_section": "Resumen",
        "filter_player": "Todos",
        "filter_scouts": [],
        "filter_primary_positions": [],
        "filter_secondary_positions": [],
        "filter_teams": [],
        "filter_competitions": [],
        "filter_verdicts": [],
        "competition_chart_filter": [],
        "pending_filter_key": None,
        "pending_filter_value": None,
    }
    for key, value in defaults.items():
        if key not in st.session_state:
            st.session_state[key] = value


def reset_filters() -> None:
    st.session_state["filter_player"] = "Todos"
    st.session_state["filter_scouts"] = []
    st.session_state["filter_primary_positions"] = []
    st.session_state["filter_secondary_positions"] = []
    st.session_state["filter_teams"] = []
    st.session_state["filter_competitions"] = []
    st.session_state["filter_verdicts"] = []


def queue_single_filter(filter_key: str, value: str, view: str = "Informes") -> None:
    st.session_state["pending_filter_key"] = filter_key
    st.session_state["pending_filter_value"] = value
    st.session_state["active_view"] = view
    for quick_key, default_value in {
        "quick_verdict_select": "Selecciona un veredicto",
        "quick_scout_select": "Selecciona un ojeador",
    }.items():
        if quick_key in st.session_state:
            st.session_state[quick_key] = default_value
    st.rerun()


def apply_pending_filter() -> None:
    filter_key = st.session_state.get("pending_filter_key")
    filter_value = st.session_state.get("pending_filter_value")
    if not filter_key or not filter_value:
        return

    reset_filters()
    if filter_key == "filter_player":
        st.session_state[filter_key] = filter_value
    else:
        st.session_state[filter_key] = [filter_value]
    st.session_state["pending_filter_key"] = None
    st.session_state["pending_filter_value"] = None


def render_sidebar_filters(df: pd.DataFrame) -> dict[str, list[str] | str]:
    st.sidebar.header("Filtros")

    def options(column: str) -> list[str]:
        if column not in df.columns:
            return []
        values = df[column].dropna().astype(str).str.strip()
        return sorted(value for value in values.unique().tolist() if value)

    player_options = ["Todos"] + options("nombre_jugador")
    if st.session_state["filter_player"] not in player_options:
        st.session_state["filter_player"] = "Todos"

    scout_options = options("ojeador")
    st.session_state["filter_scouts"] = [
        item for item in st.session_state["filter_scouts"] if item in scout_options
    ]
    primary_position_options = options("demarcacion_principal")
    st.session_state["filter_primary_positions"] = [
        item
        for item in st.session_state["filter_primary_positions"]
        if item in primary_position_options
    ]

    selected_primary_for_secondary = st.session_state["filter_primary_positions"]
    if selected_primary_for_secondary and "demarcacion_principal" in df.columns:
        secondary_source = df[
            df["demarcacion_principal"].isin(selected_primary_for_secondary)
        ].copy()
    else:
        secondary_source = df

    secondary_position_options: list[str] = []
    if "demarcacion_secundaria_lista" in secondary_source.columns:
        for positions in secondary_source["demarcacion_secundaria_lista"].tolist():
            if positions:
                secondary_position_options.extend(
                    item.strip() for item in positions if item and item.strip()
                )
        if secondary_source["demarcacion_secundaria_lista"].apply(lambda value: not (value or [])).any():
            secondary_position_options.append("Ninguna")
    secondary_position_options = sorted(set(secondary_position_options))
    st.session_state["filter_secondary_positions"] = [
        item
        for item in st.session_state["filter_secondary_positions"]
        if item in secondary_position_options
    ]
    team_options = options("equipo")
    st.session_state["filter_teams"] = [
        item for item in st.session_state["filter_teams"] if item in team_options
    ]
    competition_options = options("competicion")
    st.session_state["filter_competitions"] = [
        item
        for item in st.session_state["filter_competitions"]
        if item in competition_options
    ]
    verdict_options = options("veredicto")
    st.session_state["filter_verdicts"] = [
        item for item in st.session_state["filter_verdicts"] if item in verdict_options
    ]

    selected_player = st.sidebar.selectbox(
        "Jugador",
        options=player_options,
        key="filter_player",
    )
    selected_scouts = st.sidebar.multiselect(
        "Ojeador",
        scout_options,
        key="filter_scouts",
    )
    selected_primary_positions = st.sidebar.multiselect(
        "Demarcación principal",
        primary_position_options,
        key="filter_primary_positions",
    )
    selected_secondary_positions = st.sidebar.multiselect(
        "Demarcación secundaria",
        secondary_position_options,
        key="filter_secondary_positions",
    )
    selected_teams = st.sidebar.multiselect(
        "Equipo",
        team_options,
        key="filter_teams",
    )
    selected_competitions = st.sidebar.multiselect(
        "Competición",
        competition_options,
        key="filter_competitions",
    )
    selected_verdicts = st.sidebar.multiselect(
        "Veredicto",
        verdict_options,
        key="filter_verdicts",
    )

    if st.sidebar.button("Limpiar filtros", use_container_width=True):
        reset_filters()
        st.rerun()

    st.sidebar.markdown(
        """
        <div style="margin-top:1rem; padding-top:0.75rem; border-top:1px solid rgba(255,255,255,0.12);">
            <div style="color:#ffffff; font-weight:800; font-size:0.95rem; margin-bottom:0.35rem;">
                Unionistas de Salamanca CF
            </div>
            <div style="color:#d9d9d9; font-size:0.85rem; line-height:1.35;">
                💻 App desarrollado por: Ramón Codesido
            </div>
        </div>
        """,
        unsafe_allow_html=True,
    )

    return {
        "player": selected_player,
        "scouts": selected_scouts,
        "primary_positions": selected_primary_positions,
        "secondary_positions": selected_secondary_positions,
        "teams": selected_teams,
        "competitions": selected_competitions,
        "verdicts": selected_verdicts,
    }


def render_metrics(df: pd.DataFrame) -> None:
    total_reports = len(df)
    total_players = df["nombre_jugador"].nunique()
    total_scouts = df["ojeador"].nunique()
    average_reports = round(total_reports / total_players, 2) if total_players else 0

    col1, col2, col3, col4 = st.columns(4)
    col1.metric("Informes", total_reports)
    col2.metric("Jugadores", total_players)
    col3.metric("Ojeadores", total_scouts)
    col4.metric("Informes / jugador", average_reports)


def render_overview(
    df: pd.DataFrame,
    full_df: pd.DataFrame,
    matches_df: pd.DataFrame | None,
) -> None:
    render_section_title("Resumen")
    render_metrics(df)
    st.caption("Usa los accesos directos debajo de cada gráfico para abrir la vista filtrada de informes.")

    dashboard_section = st.segmented_control(
        "Bloques del dashboard",
        ["Resumen", "Competiciones", "Matching", "Rankings"],
        key="dashboard_section",
        label_visibility="collapsed",
    )

    if dashboard_section == "Resumen":
        col1, col2 = st.columns(2)

        with col1:
            by_verdict = (
                df["veredicto"]
                .fillna("Sin veredicto")
                .value_counts()
                .rename_axis("veredicto")
                .reset_index(name="informes")
            )
            render_labeled_bar_chart(
                by_verdict,
                category_column="veredicto",
                value_column="informes",
                title="Distribución por veredicto",
            )
            quick_verdict = st.selectbox(
                "Abrir informes por veredicto",
                options=["Selecciona un veredicto"] + by_verdict["veredicto"].tolist(),
                index=0,
                key="quick_verdict_select",
                label_visibility="collapsed",
            )
            if quick_verdict != "Selecciona un veredicto":
                queue_single_filter("filter_verdicts", quick_verdict)

        with col2:
            by_scout = (
                df["ojeador"]
                .fillna("Sin ojeador")
                .value_counts()
                .rename_axis("ojeador")
                .reset_index(name="informes")
            )
            render_labeled_bar_chart(
                by_scout,
                category_column="ojeador",
                value_column="informes",
                title="Informes por ojeador",
                horizontal=True,
            )
            quick_scout = st.selectbox(
                "Abrir informes por ojeador",
                options=["Selecciona un ojeador"] + by_scout["ojeador"].tolist(),
                index=0,
                key="quick_scout_select",
                label_visibility="collapsed",
            )
            if quick_scout != "Selecciona un ojeador":
                queue_single_filter("filter_scouts", quick_scout)

    elif dashboard_section == "Competiciones":
        if {"competicion", "nombre_jugador"}.issubset(df.columns):
            by_competition = (
                df.dropna(subset=["competicion", "nombre_jugador"])
                .groupby("competicion", as_index=False)["nombre_jugador"]
                .nunique()
                .rename(columns={"nombre_jugador": "jugadores"})
                .sort_values("jugadores", ascending=False)
            )

            competition_options = by_competition["competicion"].tolist()
            st.session_state["competition_chart_filter"] = [
                item
                for item in st.session_state["competition_chart_filter"]
                if item in competition_options
            ]
            selected_competitions_for_chart = st.multiselect(
                "Competiciones visibles en el gráfico",
                options=competition_options,
                key="competition_chart_filter",
            )
            if selected_competitions_for_chart:
                by_competition = by_competition[
                    by_competition["competicion"].isin(selected_competitions_for_chart)
                ]

            render_labeled_bar_chart(
                by_competition,
                category_column="competicion",
                value_column="jugadores",
                title="Jugadores unicos por competicion",
                x_label_angle=-90,
                value_axis_title="Jugadores únicos",
            )
            render_position_competition_heatmap(df)

    elif dashboard_section == "Matching":
        render_scouting_matching_section(
            full_df,
            matches_df,
            competition_prefix="1ª RFEF",
            title="Cobertura scouting 1RFEF",
        )
        render_objective_matching_section(
            matches_df,
            dataset_key="1rfef_2025_26",
            title="Matching 1RFEF",
        )
        render_scouting_matching_section(
            full_df,
            matches_df,
            competition_prefix="2ª RFEF",
            title="Cobertura scouting 2RFEF",
        )
        render_objective_matching_section(
            matches_df,
            dataset_key="2rfef_2025_26",
            title="Matching 2RFEF",
        )

    else:
        render_rankings_section(full_df)



def render_player_tab(
    df: pd.DataFrame,
    objective_df: pd.DataFrame | None,
    matches_df: pd.DataFrame | None,
) -> None:
    render_section_title("Ficha de jugador")
    if "nombre_jugador" not in df.columns:
        st.warning("La hoja no contiene la columna 'Nombre del Jugador'.")
        return

    players = sorted(df["nombre_jugador"].dropna().unique().tolist())

    if not players:
        st.info("No hay jugadores disponibles con los filtros actuales.")
        return

    selected_player = st.selectbox("Selecciona un jugador", options=players)
    player_df = df[df["nombre_jugador"] == selected_player].copy()

    summary = build_player_summary(player_df)
    capability_summary = summarize_repeated_capabilities(player_df)

    render_section_title_inverse("Resumen subjetivo")
    row1 = st.columns(4, gap="medium")
    with row1[0]:
        render_subjective_metric_card("Demarcación", str(summary["position"]))
    with row1[1]:
        render_subjective_metric_card("Nº informes", str(summary["times_seen"]))
    with row1[2]:
        render_subjective_metric_card("Último informe", str(summary["last_seen"]))
    with row1[3]:
        render_subjective_metric_card(
            "Consenso histórico",
            str(summary["consensus_label"]),
            summary["consensus_detail"],
        )
    st.markdown("<div style='height:0.45rem;'></div>", unsafe_allow_html=True)
    row2 = st.columns(4, gap="medium")
    with row2[0]:
        render_subjective_metric_card("Equipo", str(summary["team"]))
    with row2[1]:
        render_subjective_metric_card("Año nac.", format_birth_year_with_age(summary["birth_year"]))
    with row2[2]:
        render_subjective_metric_card("Lateralidad", str(summary["foot"]))
    with row2[3]:
        render_subjective_metric_card("Nacionalidad", str(summary["nationality"]))

    st.markdown("<div style='height:0.8rem;'></div>", unsafe_allow_html=True)
    chart_col1, chart_col2 = st.columns(2, gap="large")
    with chart_col1:
        render_scout_activity_panel(player_df, mode="verdict")
    with chart_col2:
        render_scout_activity_panel(player_df, mode="position")

    st.markdown("<div style='height:1.15rem;'></div>", unsafe_allow_html=True)

    capability_col1, capability_col2, capability_col3 = st.columns(3)
    with capability_col1:
        render_capability_summary_card(
            "Capacidades técnicas",
            capability_summary["tecnicas"],
        )
    with capability_col2:
        render_capability_summary_card(
            "Capacidades tácticas - psicológicas",
            capability_summary["tacticas_psicologicas"],
        )
    with capability_col3:
        render_capability_summary_card(
            "Capacidades físicas",
            capability_summary["fisicas"],
        )

    render_objective_player_section(selected_player, summary, objective_df, matches_df)

    panel_start()
    render_section_title_inverse("Historial de informes")
    reports_sorted = player_df.sort_values("marca_temporal", ascending=False).copy()
    for _, report in reports_sorted.iterrows():
        render_report_card(report)
    panel_end()

    panel_start()
    render_section_title_inverse("Detalle completo")
    st.markdown("**Tabla resumen de informes**")
    history_columns = [
        "marca_temporal",
        "ojeador",
        "equipo",
        "competicion",
        "jornada_numero",
        "partido_visionado",
        "visualizacion",
        "veredicto",
    ]
    st.dataframe(
        player_df.sort_values("marca_temporal", ascending=False)[history_columns],
        use_container_width=True,
        hide_index=True,
    )
    panel_end()


def birth_year_style(value: object) -> str:
    if pd.isna(value):
        return ""

    try:
        year = int(float(value))
    except (TypeError, ValueError):
        return ""

    if year == 2003:
        return "background-color: #00ff00; color: #111111;"
    if 2004 <= year <= 2006:
        return "background-color: #d9b1a7; color: #111111;"
    if year >= 2007:
        return "background-color: #b7c7e3; color: #111111;"
    return ""


def repeated_player_style(value: object, repeated_players: set[str]) -> str:
    if isinstance(value, str) and value in repeated_players:
        return "background-color: #fff4b8; color: #111111; font-weight: 600;"
    return ""


def report_count_style(value: object, max_reports: int) -> str:
    if pd.isna(value):
        return ""

    try:
        report_count = int(float(value))
    except (TypeError, ValueError):
        return ""

    max_reports = max(max_reports, 1)
    intensity = (report_count - 1) / (max_reports - 1) if max_reports > 1 else 0

    start = (255, 251, 240)
    end = (201, 151, 0)
    red = int(start[0] + (end[0] - start[0]) * intensity)
    green = int(start[1] + (end[1] - start[1]) * intensity)
    blue = int(start[2] + (end[2] - start[2]) * intensity)
    return f"background-color: rgb({red}, {green}, {blue}); color: #111111; font-weight: 700;"


def format_reports_dataframe(df: pd.DataFrame) -> pd.io.formats.style.Styler:
    report_counts = (
        df["nombre_jugador"].value_counts().rename("num_informes")
        if "nombre_jugador" in df.columns
        else pd.Series(dtype="int64", name="num_informes")
    )
    display_columns = [
        "nombre_jugador",
        "num_informes",
        "ano_nacimiento",
        "demarcacion_principal",
        "demarcacion_secundaria",
        "equipo",
        "competicion",
        "ojeador",
        "veredicto",
        "marca_temporal",
    ]
    display_df = df.copy()
    if "nombre_jugador" in display_df.columns:
        display_df["num_informes"] = display_df["nombre_jugador"].map(report_counts).fillna(1)
    available_columns = [column for column in display_columns if column in display_df.columns]
    display_df = display_df[available_columns].copy()

    rename_map = {
        "nombre_jugador": "Jugador",
        "num_informes": "Nº informes",
        "ano_nacimiento": "Año",
        "demarcacion_principal": "Demarcación principal",
        "demarcacion_secundaria": "Demarcación secundaria",
        "equipo": "Equipo",
        "competicion": "Competición",
        "ojeador": "Ojeador",
        "veredicto": "Veredicto",
        "marca_temporal": "Fecha informe",
    }
    display_df = display_df.rename(columns=rename_map)

    repeated_players = set(
        df["nombre_jugador"].value_counts()[lambda counts: counts > 1].index.tolist()
    ) if "nombre_jugador" in df.columns else set()

    styler = display_df.style
    if "Año" in display_df.columns:
        styler = styler.map(birth_year_style, subset=["Año"])
        styler = styler.format(
            {
                "Año": lambda value: (
                    str(int(float(value))) if pd.notna(value) and value != "" else ""
                )
            }
        )
    if "Jugador" in display_df.columns:
        styler = styler.map(
            lambda value: repeated_player_style(value, repeated_players),
            subset=["Jugador"],
        )
    if "Nº informes" in display_df.columns:
        max_reports = int(display_df["Nº informes"].max()) if not display_df.empty else 1
        styler = styler.map(
            lambda value: report_count_style(value, max_reports),
            subset=["Nº informes"],
        )
        styler = styler.format({"Nº informes": "{:.0f}"})
    if "Fecha informe" in display_df.columns:
        styler = styler.format(
            {
                "Fecha informe": lambda value: (
                    value.strftime("%d/%m/%Y %H:%M") if pd.notna(value) else ""
                )
            }
        )

    return styler


def render_reports_legend() -> None:
    st.markdown(
        """
        <div style="display:flex; gap:18px; flex-wrap:wrap; align-items:center; margin: 0.25rem 0 0.75rem 0;">
            <div style="display:flex; align-items:center; gap:8px;">
                <span style="display:inline-block; width:14px; height:14px; border-radius:4px; background:#00ff00; border:1px solid rgba(0,0,0,0.12);"></span>
                <span>2003</span>
            </div>
            <div style="display:flex; align-items:center; gap:8px;">
                <span style="display:inline-block; width:14px; height:14px; border-radius:4px; background:#d9b1a7; border:1px solid rgba(0,0,0,0.12);"></span>
                <span>2004-2006</span>
            </div>
            <div style="display:flex; align-items:center; gap:8px;">
                <span style="display:inline-block; width:14px; height:14px; border-radius:4px; background:#b7c7e3; border:1px solid rgba(0,0,0,0.12);"></span>
                <span>2007 o superior</span>
            </div>
            <div style="display:flex; align-items:center; gap:8px;">
                <span style="display:inline-block; width:14px; height:14px; border-radius:4px; background:#fff4b8; border:1px solid rgba(0,0,0,0.12);"></span>
                <span>Jugador con más de un informe</span>
            </div>
        </div>
        """,
        unsafe_allow_html=True,
    )


def render_reports_table(df: pd.DataFrame) -> None:
    render_section_title("Base de informes")
    panel_start()
    render_reports_legend()
    st.dataframe(
        format_reports_dataframe(df),
        use_container_width=True,
        hide_index=True,
        height=1800,
    )
    panel_end()


def _campogram_metric(label: str, value: object) -> None:
    st.metric(label, value)


CAMPOGRAM_POSITION_ORDER = [
    "POR 1",
    "LTD 2",
    "DFC 4",
    "DFC 5",
    "LTI 3",
    "MC 8",
    "MC 6",
    "ED 7",
    "DC/MP 10",
    "EI 11",
    "DC 9",
]

CAMPOGRAM_CONSENSUS_DOMAIN = [
    "Fichar",
    "Duda",
    "Seguir viendo",
    "Descartar",
    "Sin consenso",
    "Sin informes",
]

CAMPOGRAM_CONSENSUS_COLORS = [
    "#0f8a3b",
    "#d4b000",
    "#3b82f6",
    "#d9480f",
    "#7b2cbf",
    "#8f8f8f",
]


def _campogram_consensus_chart(
    scoped_players: pd.DataFrame,
    *,
    title: str | None = None,
    height: int = 230,
    compact: bool = False,
) -> alt.Chart | None:
    if scoped_players.empty:
        return None

    chart_df = (
        scoped_players.groupby(["posicion_canonica", "consensus_label"], as_index=False)
        .size()
        .rename(columns={"size": "jugadores"})
    )
    if chart_df.empty:
        return None

    dynamic_positions = [
        position for position in scoped_players["posicion_canonica"].dropna().unique().tolist()
        if position not in CAMPOGRAM_POSITION_ORDER
    ]
    full_order = CAMPOGRAM_POSITION_ORDER + sorted(dynamic_positions)
    totals_df = (
        chart_df.groupby("posicion_canonica", as_index=False)["jugadores"]
        .sum()
        .rename(columns={"jugadores": "total_jugadores"})
    )
    totals_df["label"] = totals_df["total_jugadores"].apply(
        lambda value: f"{int(value)} jugadores" if int(value) != 1 else "1 jugador"
    )

    bars = (
        alt.Chart(chart_df)
        .mark_bar(cornerRadiusTopLeft=8, cornerRadiusTopRight=8)
        .encode(
            x=alt.X(
                "posicion_canonica:N",
                title="Posición",
                sort=full_order,
                axis=alt.Axis(labelAngle=0, labelLimit=150),
            ),
            y=alt.Y(
                "jugadores:Q",
                title=None,
                axis=alt.Axis(labels=False, ticks=False, grid=False, domain=False),
                stack=True,
            ),
            color=alt.Color(
                "consensus_label:N",
                title="Valoración",
                scale=alt.Scale(domain=CAMPOGRAM_CONSENSUS_DOMAIN, range=CAMPOGRAM_CONSENSUS_COLORS),
            ),
            tooltip=[
                alt.Tooltip("posicion_canonica:N", title="Posición"),
                alt.Tooltip("consensus_label:N", title="Valoración"),
                alt.Tooltip("jugadores:Q", title="Jugadores"),
            ],
            order=alt.Order("consensus_label:N", sort="ascending"),
        )
    )
    labels = (
        alt.Chart(totals_df)
        .mark_text(
            dy=-10,
            fontSize=11,
            fontWeight="bold",
            color="#4A4A4A",
        )
        .encode(
            x=alt.X("posicion_canonica:N", sort=full_order),
            y=alt.Y("total_jugadores:Q"),
            text="label:N",
        )
    )

    chart = (bars + labels).properties(height=height)
    if title:
        chart = chart.properties(title=title)

    chart = chart.configure_view(strokeOpacity=0).configure_axis(
        grid=False,
        domain=False,
        tickColor="transparent",
    ).configure_legend(
        orient="bottom",
        direction="horizontal",
        titleFontWeight="bold",
        labelFontSize=11,
    )
    if compact:
        chart = chart.configure_title(
            fontSize=13,
            fontWeight="bold",
            anchor="start",
            color="#111111",
        ).configure_legend(
            orient="bottom",
            direction="horizontal",
            titleFontSize=10,
            labelFontSize=9,
            symbolSize=80,
        )
    return chart


def _campogram_overview_chart(scoped_players: pd.DataFrame) -> alt.Chart | None:
    if scoped_players.empty:
        return None

    chart_df = (
        scoped_players.groupby(["posicion_canonica", "consensus_label"], as_index=False)
        .size()
        .rename(columns={"size": "jugadores"})
    )
    if chart_df.empty:
        return None

    dynamic_positions = [
        position for position in scoped_players["posicion_canonica"].dropna().unique().tolist()
        if position not in CAMPOGRAM_POSITION_ORDER
    ]
    full_order = CAMPOGRAM_POSITION_ORDER + sorted(dynamic_positions)

    totals_df = (
        chart_df.groupby("posicion_canonica", as_index=False)["jugadores"]
        .sum()
        .rename(columns={"jugadores": "total_jugadores"})
    )
    totals_lookup = totals_df.set_index("posicion_canonica")["total_jugadores"].to_dict()
    chart_df["position_axis_label"] = chart_df["posicion_canonica"].map(
        lambda position: f"{position} · {int(totals_lookup.get(position, 0))}J"
    )
    ordered_axis_labels = [
        f"{position} · {int(totals_lookup.get(position, 0))}J"
        for position in full_order
        if position in totals_lookup
    ]
    bars = alt.Chart(chart_df).mark_bar(
        cornerRadiusTopLeft=4,
        cornerRadiusTopRight=4,
        size=9,
    ).encode(
        x=alt.X(
            "position_axis_label:N",
            sort=ordered_axis_labels,
            title=None,
            axis=alt.Axis(labelAngle=0, labelLimit=85, labelFontSize=9, ticks=False, domain=False),
        ),
        xOffset=alt.XOffset("consensus_label:N", sort=CAMPOGRAM_CONSENSUS_DOMAIN),
        y=alt.Y(
            "jugadores:Q",
            title=None,
            axis=alt.Axis(labels=False, ticks=False, grid=False, domain=False),
        ),
        color=alt.Color(
            "consensus_label:N",
            title="Valoración",
            scale=alt.Scale(domain=CAMPOGRAM_CONSENSUS_DOMAIN, range=CAMPOGRAM_CONSENSUS_COLORS),
            legend=None,
        ),
        tooltip=[
            alt.Tooltip("posicion_canonica:N", title="Posición"),
            alt.Tooltip("consensus_label:N", title="Valoración"),
            alt.Tooltip("jugadores:Q", title="Jugadores"),
        ],
    )
    labels_df = chart_df[chart_df["jugadores"] > 0].copy()
    labels = alt.Chart(labels_df).mark_text(
        dy=-6,
        fontSize=9,
        fontWeight="bold",
        color="#111111",
    ).encode(
        x=alt.X("position_axis_label:N", sort=ordered_axis_labels),
        xOffset=alt.XOffset("consensus_label:N", sort=CAMPOGRAM_CONSENSUS_DOMAIN),
        y=alt.Y("jugadores:Q"),
        text=alt.Text("jugadores:Q", format=".0f"),
    )

    return (
        (bars + labels)
        .properties(height=118)
        .configure_view(strokeOpacity=0)
        .configure_axis(grid=False, domain=False, tickColor="transparent")
    )


def render_campogram_overview_legend() -> None:
    legend_df = pd.DataFrame(
        {
            "valoracion": CAMPOGRAM_CONSENSUS_DOMAIN,
            "orden": list(range(len(CAMPOGRAM_CONSENSUS_DOMAIN))),
        }
    )
    legend = (
        alt.Chart(legend_df)
        .mark_square(size=150)
        .encode(
            x=alt.X("orden:O", axis=None),
            y=alt.value(34),
            color=alt.Color(
                "valoracion:N",
                scale=alt.Scale(domain=CAMPOGRAM_CONSENSUS_DOMAIN, range=CAMPOGRAM_CONSENSUS_COLORS),
                legend=None,
            ),
        )
    )
    labels = (
        alt.Chart(legend_df)
        .mark_text(align="left", dx=12, fontSize=12, fontWeight="bold", color=COLOR_DARK_GRAY)
        .encode(
            x=alt.X("orden:O", axis=None),
            y=alt.value(34),
            text="valoracion:N",
        )
    )
    st.markdown(
        "<div style='background:#ffffff; color:#111111; font-weight:900; text-align:center; border-radius:14px; padding:0.55rem 0.8rem; margin:0.95rem 0 0.35rem 0; box-shadow:0 8px 18px rgba(10,10,10,0.04);'>Leyenda General de los Minigráficos</div>",
        unsafe_allow_html=True,
    )
    spacer_left, legend_col, spacer_right = st.columns([0.7, 3.8, 0.7], gap="small")
    with legend_col:
        st.altair_chart(
            (legend + labels)
            .properties(height=68)
            .configure_view(strokeOpacity=0),
            use_container_width=True,
        )


def _campogram_player_card_html(player_row: pd.Series) -> str:
    category_style = get_category_style(str(player_row.get("categoria_familia") or "OTRA"))
    consensus_style = get_consensus_style(str(player_row.get("consensus_label") or "Sin informes"))

    team_label = str(player_row.get("equipo_actual") or "Sin equipo")
    birth_year = (
        str(int(float(player_row.get("ano_nacimiento"))))
        if pd.notna(player_row.get("ano_nacimiento"))
        else "-"
    )
    category_label = str(player_row.get("categoria") or "-")
    report_count = int(player_row.get("report_count") or 0)
    consensus_label = str(player_row.get("consensus_label") or "Sin informes")

    return f"""
    <div class="campogram-player-card" style="
        background:{category_style['background']};
        border-left-color:{consensus_style['border']};
        border-top:1px solid rgba(0,0,0,0.05);
        border-right:1px solid rgba(0,0,0,0.05);
        border-bottom:1px solid rgba(0,0,0,0.05);
    ">
        <div class="campogram-player-top">
            <div>
                <div class="campogram-player-name">{player_row.get('jugador') or 'Sin nombre'}</div>
                <div class="campogram-player-meta">{team_label}</div>
            </div>
            <div style="display:flex; flex-direction:column; gap:0.18rem; align-items:flex-end;">
                <span class="campogram-badge" style="
                    background:{consensus_style['background']};
                    color:{consensus_style['text']};
                    border-color:{consensus_style['border']};
                ">{consensus_label}</span>
                <span class="campogram-badge" style="
                    background:{category_style['background']};
                    color:#111111;
                    border-color:{category_style['border']};
                ">{category_label}</span>
            </div>
        </div>
        <div class="campogram-player-submeta">
            Año nac. {birth_year} · {player_row.get('posicion_canonica') or '-'} · Informes {report_count}
        </div>
    </div>
    """


def _render_field_row(
    row_definition: list[str | None],
    position_blocks: dict[str, pd.DataFrame],
    reports_df: pd.DataFrame,
) -> None:
    width_map = {
        3: [1.25, 1.6, 1.25],
        5: [0.95, 1.05, 1.05, 1.05, 1.15],
        4: [1, 1, 1, 1],
    }
    row_widths = width_map.get(len(row_definition), [1] * len(row_definition))
    columns = st.columns(row_widths, gap="medium")
    for column, position in zip(columns, row_definition):
        with column:
            if not position:
                st.markdown("<div style='height:1px;'></div>", unsafe_allow_html=True)
                continue
            _render_campogram_position_panel(
                position,
                position_blocks.get(position, pd.DataFrame()),
                reports_df,
            )


def _render_campogram_summary_column(
    title: str,
    positions: list[str],
    position_blocks: dict[str, pd.DataFrame],
    reports_df: pd.DataFrame,
) -> None:
    st.markdown(
        f"""
        <div class="unionistas-panel" style="padding:0.85rem 0.95rem 0.7rem 0.95rem;">
            <div style="font-weight:900; color:#111111; margin-bottom:0.6rem;">{title}</div>
        </div>
        """,
        unsafe_allow_html=True,
    )
    for position in positions:
        _render_campogram_position_panel(
            position,
            position_blocks.get(position, pd.DataFrame()),
            reports_df,
        )


def _render_campogram_player_detail(player_row: pd.Series, reports_df: pd.DataFrame) -> None:
    detail_col1, detail_col2, detail_col3 = st.columns(3, gap="small")
    with detail_col1:
        st.caption("Equipo actual")
        st.markdown(f"**{player_row.get('equipo_actual') or '-'}**")
        st.caption("Campograma")
        st.markdown(f"**{player_row.get('campograma_canonico') or '-'}**")
    with detail_col2:
        st.caption("Año nac.")
        birth_year = (
            str(int(float(player_row.get("ano_nacimiento"))))
            if pd.notna(player_row.get("ano_nacimiento"))
            else "-"
        )
        st.markdown(f"**{birth_year}**")
        st.caption("Posición base")
        st.markdown(f"**{player_row.get('posicion_canonica') or '-'}**")
    with detail_col3:
        st.caption("Agente")
        st.markdown(f"**{player_row.get('agente') or '-'}**")
        st.caption("Consenso")
        st.markdown(f"**{player_row.get('consensus_label') or 'Sin informes'}**")

    extra_col1, extra_col2, extra_col3 = st.columns(3, gap="small")
    with extra_col1:
        st.caption("Cedión")
        st.markdown(f"**{player_row.get('cedido') or '-'}**")
        st.caption("Propietario")
        st.markdown(f"**{player_row.get('equipo_propietario') or '-'}**")
    with extra_col2:
        st.caption("Posiciones en informes")
        st.markdown(f"**{player_row.get('report_positions') or '-'}**")
        st.caption("Chequeo posición")
        st.markdown(f"**{player_row.get('position_check') or '-'}**")
    with extra_col3:
        st.caption("Scouts")
        st.markdown(f"**{player_row.get('scouts_list') or '-'}**")
        st.caption("Último scout")
        st.markdown(f"**{player_row.get('latest_scout') or '-'}**")

    if pd.notna(player_row.get("latest_report_at")):
        st.caption(
            f"Último informe: {player_row['latest_report_at'].strftime('%d/%m/%Y %H:%M')}"
        )

    if reports_df.empty:
        st.info("Sin informes asociados todavía.")
        return

    st.markdown("**Informes**")
    for _, report in reports_df.sort_values("marca_temporal", ascending=False).iterrows():
        report_date = (
            report["marca_temporal"].strftime("%d/%m/%Y %H:%M")
            if pd.notna(report.get("marca_temporal"))
            else "-"
        )
        verdict = report.get("valoracion_canonica") or report.get("valoracion") or "-"
        st.markdown(
            f"""
            <div class="unionistas-panel" style="padding:0.85rem 0.95rem; margin-bottom:0.6rem;">
                <div style="display:flex; justify-content:space-between; align-items:center; gap:0.8rem; margin-bottom:0.5rem;">
                    <div>
                        <div style="font-weight:800; color:#111111;">{report.get('scout') or 'Sin scout'}</div>
                        <div style="color:#666666; font-size:0.88rem;">{report_date}</div>
                    </div>
                    <div style="padding:0.24rem 0.68rem; border-radius:999px; font-weight:800; background:rgba(255,255,255,0.9); border:1px solid rgba(0,0,0,0.08);">
                        {verdict}
                    </div>
                </div>
                <div style="color:#4a4a4a; margin-bottom:0.35rem;"><strong>Técnico/táctico:</strong> {report.get('comentario_tecnico') or '-'}</div>
                <div style="color:#4a4a4a; margin-bottom:0.35rem;"><strong>Físico/condicional:</strong> {report.get('comentario_fisico') or '-'}</div>
                <div style="color:#4a4a4a;"><strong>Psicológico/actitudinal:</strong> {report.get('comentario_psicologico') or '-'}</div>
            </div>
            """,
            unsafe_allow_html=True,
        )


def _render_campogram_position_panel(
    position_label: str,
    position_df: pd.DataFrame,
    reports_df: pd.DataFrame,
) -> None:
    st.markdown(
        f'<div class="campogram-position-title">{position_label}</div>',
        unsafe_allow_html=True,
    )
    if position_df.empty:
        st.caption("Sin jugadores")
        return

    for _, player_row in position_df.iterrows():
        st.markdown(_campogram_player_card_html(player_row), unsafe_allow_html=True)
        player_reports = (
            reports_df[reports_df["player_row_id"].astype(str) == str(player_row["player_row_id"])]
            if not reports_df.empty and "player_row_id" in reports_df.columns
            else pd.DataFrame()
        )
        if hasattr(st, "popover"):
            with st.popover(f"Detalle | {player_row.get('jugador') or 'Jugador'}", use_container_width=True):
                _render_campogram_player_detail(player_row, player_reports)
        else:
            with st.expander(f"Detalle | {player_row.get('jugador') or 'Jugador'}", expanded=False):
                _render_campogram_player_detail(player_row, player_reports)


def render_campograms_tab() -> None:
    render_section_title_inverse("Campogramas")
    st.caption(
        "Visualización estructurada de campogramas, jugadores incluidos y valoraciones recibidas desde formulario."
    )

    try:
        dataset = get_campogram_dataset()
    except Exception as exc:
        st.error("No se pudo cargar la hoja de campogramas.")
        st.exception(exc)
        return

    players_df = dataset.players.copy()
    reports_df = dataset.reports.copy()

    if players_df.empty:
        st.info("La pestaña `Base Datos` no contiene jugadores para construir campogramas.")
        return

    campogram_names = get_campogram_ordered_names(players_df)
    if not campogram_names:
        st.info("No se han detectado campogramas válidos en `Base Datos`.")
        return
    global_unexpected_positions = sorted(
        position for position in players_df["posicion_canonica"].dropna().unique().tolist()
        if position not in CAMPOGRAM_POSITION_ORDER
    )
    if global_unexpected_positions:
        st.warning(
            "Posiciones no estándar detectadas en `Base Datos`: "
            + ", ".join(global_unexpected_positions)
            + ". Conviene revisarlas para que no creen columnas fuera del campograma."
        )

    selected_campogram = st.session_state.get("campogram_selected_name", campogram_names[0])
    if selected_campogram not in campogram_names:
        selected_campogram = campogram_names[0]

    global_metric_cols = st.columns(3, gap="medium")
    with global_metric_cols[0]:
        _campogram_metric("Jugadores", len(players_df))
    with global_metric_cols[1]:
        _campogram_metric("Jugadores con informe", int((players_df["report_count"] > 0).sum()))
    with global_metric_cols[2]:
        _campogram_metric("Jugadores sin informe", int((players_df["report_count"] == 0).sum()))

    render_section_title_inverse("Panorama Campogramas")
    chart_pairs = [campogram_names[index:index + 2] for index in range(0, len(campogram_names), 2)]
    for pair in chart_pairs:
        chart_cols = st.columns(2, gap="medium")
        for column, campogram_name in zip(chart_cols, pair):
            with column:
                chart_df = players_df[players_df["campograma_canonico"] == campogram_name].copy()
                st.markdown(
                    f"<div style='font-weight:900; color:#111111; margin:0.15rem 0 0.25rem 0;'>{campogram_name}</div>",
                    unsafe_allow_html=True,
                )
                mini_chart = _campogram_overview_chart(chart_df)
                if mini_chart is not None:
                    st.altair_chart(mini_chart, use_container_width=True)
        if len(pair) < 2:
            with chart_cols[1]:
                st.markdown("<div style='height:1px;'></div>", unsafe_allow_html=True)
    render_campogram_overview_legend()

    render_section_title_inverse("Seleccionar Campograma")
    selected_campogram = st.selectbox(
        "Campograma",
        options=campogram_names,
        index=campogram_names.index(selected_campogram),
        key="campogram_selected_name",
    )

    summary = summarize_campogram(players_df, selected_campogram, reports_df)
    metric_cols = st.columns(4, gap="medium")
    with metric_cols[0]:
        _campogram_metric("Jugadores", summary["players"])
    with metric_cols[1]:
        _campogram_metric("Con informes", summary["players_with_reports"])
    with metric_cols[2]:
        _campogram_metric("Sin informes", summary["sin_informes"])
    with metric_cols[3]:
        _campogram_metric("Sin consenso", summary["sin_consenso"])

    scoped_players = players_df[players_df["campograma_canonico"] == selected_campogram].copy()
    position_blocks = get_position_blocks(players_df, selected_campogram)
    unexpected_positions = sorted(
        position for position in scoped_players["posicion_canonica"].dropna().unique().tolist()
        if position not in CAMPOGRAM_POSITION_ORDER
    )
    if unexpected_positions:
        st.warning(
            "Revisar posiciones no estándar en este campograma: "
            + ", ".join(unexpected_positions)
            + ". Las muestro aparte para no mezclarlas con el 1-4-2-3-1."
        )

    chart = _campogram_consensus_chart(scoped_players)
    if chart is not None:
        render_section_title_inverse("Valoración por posición")
        st.altair_chart(chart, use_container_width=True)

    render_section_title_inverse(selected_campogram)
    st.markdown('<div class="campogram-field">', unsafe_allow_html=True)
    st.markdown('<div class="campogram-field-row">', unsafe_allow_html=True)
    _render_field_row([None, None, "POR 1", None, None], position_blocks, reports_df)
    st.markdown("</div>", unsafe_allow_html=True)
    st.markdown('<div class="campogram-field-row">', unsafe_allow_html=True)
    _render_field_row(["LTD 2", "DFC 4", None, "DFC 5", "LTI 3"], position_blocks, reports_df)
    st.markdown("</div>", unsafe_allow_html=True)
    st.markdown('<div class="campogram-field-row">', unsafe_allow_html=True)
    _render_field_row([None, "MC 8", None, "MC 6", None], position_blocks, reports_df)
    st.markdown("</div>", unsafe_allow_html=True)
    st.markdown('<div class="campogram-field-row">', unsafe_allow_html=True)
    _render_field_row(["ED 7", None, "DC/MP 10", None, "EI 11"], position_blocks, reports_df)
    st.markdown("</div>", unsafe_allow_html=True)
    st.markdown('<div class="campogram-field-row">', unsafe_allow_html=True)
    _render_field_row([None, None, "DC 9", None, None], position_blocks, reports_df)
    st.markdown("</div>", unsafe_allow_html=True)
    st.markdown("</div>", unsafe_allow_html=True)

    extra_positions = [
        position for position in position_blocks.keys()
        if position not in CAMPOGRAM_POSITION_ORDER
    ]
    if extra_positions:
        render_section_title_inverse("Otras posiciones")
        extra_cols = st.columns(min(3, len(extra_positions)), gap="medium")
        for index, position in enumerate(extra_positions):
            with extra_cols[index % len(extra_cols)]:
                _render_campogram_position_panel(position, position_blocks[position], reports_df)

    render_section_title_inverse("Base campograma")
    base_display = scoped_players[
        [
            "jugador",
            "equipo_actual",
            "categoria",
            "ano_nacimiento",
            "posicion_canonica",
            "campograma_canonico",
            "consensus_label",
            "report_count",
            "latest_scout",
        ]
    ].rename(
        columns={
            "jugador": "Jugador",
            "equipo_actual": "Equipo actual",
            "categoria": "Categoría",
            "ano_nacimiento": "Año nac.",
            "posicion_canonica": "Posición",
            "campograma_canonico": "Campograma",
            "consensus_label": "Consenso",
            "report_count": "Informes",
            "latest_scout": "Último scout",
        }
    )
    st.dataframe(base_display, use_container_width=True, hide_index=True, height=420)


def _calendar_default_matchday(planning_df: pd.DataFrame) -> int | None:
    if planning_df.empty or "matchday" not in planning_df.columns:
        return None

    working_df = planning_df.copy()
    working_df["date"] = pd.to_datetime(working_df["date"], errors="coerce")
    working_df["matchday"] = pd.to_numeric(working_df["matchday"], errors="coerce")
    today = pd.Timestamp.now().normalize()

    upcoming_df = working_df[
        working_df["matchday"].notna()
        & working_df["date"].notna()
        & (working_df["date"] >= today)
        & (working_df["status"].fillna("").astype(str).str.lower() != "finished")
    ].copy()

    if not upcoming_df.empty:
        grouped_upcoming = (
            upcoming_df.groupby("matchday", as_index=False)
            .agg(
                min_date=("date", "min"),
                match_count=("event_id", "count"),
            )
            .sort_values(
                by=["match_count", "min_date", "matchday"],
                ascending=[False, True, True],
            )
        )
        return int(grouped_upcoming.iloc[0]["matchday"])

    future_df = working_df[
        working_df["matchday"].notna()
        & working_df["date"].notna()
        & (working_df["date"] >= today)
    ].copy()
    if not future_df.empty:
        grouped_future = (
            future_df.groupby("matchday", as_index=False)
            .agg(
                min_date=("date", "min"),
                match_count=("event_id", "count"),
            )
            .sort_values(
                by=["match_count", "min_date", "matchday"],
                ascending=[False, True, True],
            )
        )
        return int(grouped_future.iloc[0]["matchday"])

    historic_df = working_df[working_df["matchday"].notna()].sort_values(
        ["date", "matchday"],
        ascending=[False, False],
        na_position="last",
    )
    if not historic_df.empty:
        return int(historic_df.iloc[0]["matchday"])
    return None


def _default_matchday_for_competition(competition_df: pd.DataFrame) -> int | None:
    return _calendar_default_matchday(competition_df)


def _competition_matchday_sequence(competition_df: pd.DataFrame) -> list[int]:
    return sorted(
        pd.to_numeric(competition_df["matchday"], errors="coerce")
        .dropna()
        .astype(int)
        .unique()
        .tolist()
    )


def _competition_matchday_state(
    competition_df: pd.DataFrame,
    competition_label: str,
) -> tuple[list[int], int, bool, bool]:
    sequence = _competition_matchday_sequence(competition_df)
    if not sequence:
        return [], 0, False, False

    default_matchday = _default_matchday_for_competition(competition_df)
    if default_matchday not in sequence:
        default_matchday = sequence[0]

    state_key = f"calendar_selected_matchday_{competition_label}"
    if st.session_state.get(state_key) not in sequence:
        st.session_state[state_key] = default_matchday

    selected_matchday = int(st.session_state[state_key])
    current_index = sequence.index(selected_matchday)
    can_go_previous = current_index > 0
    can_go_next = current_index < len(sequence) - 1
    return sequence, selected_matchday, can_go_previous, can_go_next


def _calendar_interest_badge(players_in_db: int) -> tuple[str, str, str]:
    if players_in_db > 10:
        return "+ de 10 jugadores", "#0f8a3b", "#e8f8ec"
    if 7 <= players_in_db <= 10:
        return "7-10 jugadores", "#55a630", "#eef8e2"
    if 4 <= players_in_db <= 6:
        return "4-6 jugadores", "#d4b000", "#fff7d6"
    return "Menos de 4", "#8f8f8f", "#f0f0f0"


def _calendar_interest_label(players_in_db: int) -> str:
    return _calendar_interest_badge(players_in_db)[0]


CALENDAR_INTEREST_ORDER = ["+ de 10 jugadores", "7-10 jugadores", "4-6 jugadores", "Menos de 4"]
CALENDAR_INTEREST_COLORS = {
    "+ de 10 jugadores": "#0f8a3b",
    "7-10 jugadores": "#8CCF5F",
    "4-6 jugadores": "#d4b000",
    "Menos de 4": "#8f8f8f",
}
WEEKDAY_SHORT_ES = {
    0: "Lun",
    1: "Mar",
    2: "Mie",
    3: "Jue",
    4: "Vie",
    5: "Sab",
    6: "Dom",
}


def _calendar_group_short_label(value: object) -> str:
    text = str(value or "").strip()
    replacements = {
        "Group 1": "Gr 1",
        "Group 2": "Gr 2",
        "Group I": "Gr I",
        "Group II": "Gr II",
        "Group III": "Gr III",
        "Group IV": "Gr IV",
        "Group V": "Gr V",
    }
    return replacements.get(text, text)


def render_calendar_match_card(match_row: pd.Series) -> None:
    team_logo_map = get_calendar_team_logos()
    badge_label, badge_border, badge_background = _calendar_interest_badge(
        int(match_row.get("players_in_db") or 0)
    )
    date_value = pd.to_datetime(match_row.get("date"), errors="coerce")
    if pd.notna(date_value):
        weekday_label = WEEKDAY_SHORT_ES.get(int(date_value.dayofweek), "")
        date_label = f"{weekday_label} {date_value.strftime('%d/%m/%Y')}".strip()
    else:
        date_label = "Fecha pendiente"
    kickoff_label = str(match_row.get("kickoff_time") or "").strip() or "Horario pendiente"
    competition_key = competition_family(match_row.get("competition"))
    home_logo = team_logo_map.get(
        (competition_key, resolve_team_key(match_row.get("home_team"), match_row.get("competition"), get_team_name_map()))
    )
    away_logo = team_logo_map.get(
        (competition_key, resolve_team_key(match_row.get("away_team"), match_row.get("competition"), get_team_name_map()))
    )
    home_logo_html = (
        f'<img src="{home_logo}" alt="{match_row.get("home_team", "")}" '
        'style="width:28px; height:28px; object-fit:contain; margin-right:0.55rem; vertical-align:middle;" />'
        if home_logo
        else ""
    )
    away_logo_html = (
        f'<img src="{away_logo}" alt="{match_row.get("away_team", "")}" '
        'style="width:28px; height:28px; object-fit:contain; margin-right:0.55rem; vertical-align:middle;" />'
        if away_logo
        else ""
    )
    home_players = str(match_row.get("home_players_detected") or "").strip()
    away_players = str(match_row.get("away_players_detected") or "").strip()
    home_players_display = home_players if home_players else "Sin jugadores detectados"
    away_players_display = away_players if away_players else "Sin jugadores detectados"

    st.markdown(
        f"""
        <div style="
            background: rgba(255,255,255,0.82);
            border: 1px solid rgba(255,255,255,0.86);
            border-left: 6px solid {COLOR_GOLD};
            border-radius: 22px;
            padding: 1rem 1.1rem;
            margin-bottom: 0.9rem;
            box-shadow: 0 12px 26px rgba(10,10,10,0.05);
        ">
            <div style="display:flex; justify-content:space-between; gap:1rem; align-items:flex-start;">
                <div style="flex:1 1 52%;">
                    <div style="font-size:0.84rem; font-weight:800; color:#666666; letter-spacing:0.02em;">
                        {match_row.get("competition", "")} | {match_row.get("group", "")} | Jornada {int(float(match_row.get("matchday") or 0))}
                    </div>
                    <div style="margin-top:0.35rem; font-size:1.18rem; font-weight:800; color:#111111;">
                        <span style="display:inline-flex; align-items:center;">{home_logo_html}<span>{match_row.get("home_team", "")}</span></span>
                        <span style="color:#6a6a6a; margin:0 0.45rem;">vs</span>
                        <span style="display:inline-flex; align-items:center;">{away_logo_html}<span>{match_row.get("away_team", "")}</span></span>
                    </div>
                    <div style="margin-top:0.35rem; color:#4a4a4a; font-weight:600;">
                        {date_label} | {kickoff_label}
                    </div>
                </div>
                <div style="flex:1 1 48%;">
                    <div style="
                        display:inline-block;
                        margin-bottom:0.6rem;
                        padding:0.3rem 0.7rem;
                        border-radius:999px;
                        font-weight:800;
                        border:1px solid {badge_border};
                        background:{badge_background};
                        color:#111111;
                    ">
                        {badge_label}
                    </div>
                    <div style="display:grid; grid-template-columns: 1fr auto; gap:0.4rem 0.8rem; align-items:start;">
                        <div style="font-weight:800; color:#111111; display:inline-flex; align-items:center;">{home_logo_html}<span>{match_row.get("home_team", "")}</span></div>
                        <div style="font-weight:800; color:#111111;">{int(match_row.get("home_players_in_db") or 0)}</div>
                        <div style="color:#4a4a4a;">{home_players_display}</div>
                        <div></div>
                        <div style="font-weight:800; color:#111111; display:inline-flex; align-items:center;">{away_logo_html}<span>{match_row.get("away_team", "")}</span></div>
                        <div style="font-weight:800; color:#111111;">{int(match_row.get("away_players_in_db") or 0)}</div>
                        <div style="color:#4a4a4a;">{away_players_display}</div>
                        <div></div>
                    </div>
                    <div style="margin-top:0.65rem; color:#111111; font-weight:800;">
                        Total BD: {int(match_row.get("players_in_db") or 0)}
                    </div>
                </div>
            </div>
        </div>
        """,
        unsafe_allow_html=True,
    )


def build_calendar_player_source(
    general_df: pd.DataFrame,
    source_label: str,
) -> pd.DataFrame:
    if source_label == "Base general":
        return general_df.copy()

    dataset = get_campogram_dataset()
    players_df = dataset.players.copy()
    if players_df.empty:
        return pd.DataFrame(columns=["nombre_jugador", "equipo", "competicion", "veredicto"])

    players_df = players_df[players_df["categoria_familia"].isin(["1RFEF", "2RFEF"])].copy()
    if players_df.empty:
        return pd.DataFrame(columns=["nombre_jugador", "equipo", "competicion", "veredicto"])

    source_df = pd.DataFrame(
        {
            "nombre_jugador": players_df["jugador"],
            "equipo": players_df["equipo_actual"],
            "competicion": players_df["categoria"],
            "veredicto": players_df["consensus_label"].replace({"Sin informes": "NC", "Sin consenso": "NC"}),
        }
    )
    return source_df.dropna(subset=["nombre_jugador", "equipo", "competicion"])


def _get_competition_selected_groups(
    competition_label: str,
    competition_df: pd.DataFrame,
) -> list[str]:
    group_options = sorted(
        [option for option in competition_df["group"].dropna().unique().tolist() if option]
    )
    group_key = f"calendar_filter_groups_{competition_label}"
    if group_key not in st.session_state:
        st.session_state[group_key] = group_options
    st.session_state[group_key] = [
        value for value in st.session_state[group_key] if value in group_options
    ] or group_options
    return list(st.session_state[group_key])


def _get_competition_active_matches(
    competition_label: str,
    competition_df: pd.DataFrame,
    selected_groups: list[str] | None = None,
    order_mode: str = "Por jugadores BD",
) -> tuple[int | None, pd.DataFrame]:
    if competition_df.empty:
        return None, competition_df.copy()

    if selected_groups:
        working_df = competition_df[competition_df["group"].isin(selected_groups)].copy()
    else:
        working_df = competition_df.copy()

    sequence, selected_matchday, _, _ = _competition_matchday_state(
        working_df,
        competition_label,
    )
    if not sequence:
        return None, working_df.iloc[0:0].copy()

    filtered_df = working_df[
        pd.to_numeric(working_df["matchday"], errors="coerce") == int(selected_matchday)
    ].copy()
    if order_mode == "Por horario":
        filtered_df = filtered_df.sort_values(
            by=["group", "date", "kickoff_time", "players_in_db"],
            ascending=[True, True, True, False],
            na_position="last",
        )
    else:
        filtered_df = filtered_df.sort_values(
            by=["group", "players_in_db", "date", "kickoff_time"],
            ascending=[True, False, True, True],
            na_position="last",
        )
    return int(selected_matchday), filtered_df


def render_competition_calendar_section(
    competition_label: str,
    competition_df: pd.DataFrame,
) -> None:
    if competition_df.empty:
        return

    selected_groups = _get_competition_selected_groups(competition_label, competition_df)
    group_options = sorted(
        [option for option in competition_df["group"].dropna().unique().tolist() if option]
    )

    render_section_title_inverse(competition_label)
    filter_col1, filter_col2, filter_col3 = st.columns([2, 2, 1], gap="medium")
    with filter_col1:
        selected_groups = st.multiselect(
            "Grupo",
            options=group_options,
            default=selected_groups,
            key=f"calendar_filter_groups_{competition_label}",
        )
    with filter_col2:
        state_key = f"calendar_selected_matchday_{competition_label}"
        widget_key = f"calendar_matchday_select_{competition_label}"
        sequence, selected_matchday, _, _ = _competition_matchday_state(
            competition_df[competition_df["group"].isin(selected_groups)].copy()
            if selected_groups else competition_df.copy(),
            competition_label,
        )
        if not sequence:
            st.warning(f"No hay jornadas disponibles en {competition_label} con los filtros actuales.")
            return

        if st.session_state.get(widget_key) not in sequence:
            st.session_state[widget_key] = selected_matchday
        elif st.session_state.get(widget_key) != selected_matchday:
            st.session_state[widget_key] = selected_matchday

        st.markdown(
            f"""
            <div style="
                display:inline-block;
                background:rgba(255,255,255,0.92);
                border:1px solid rgba(255,255,255,0.95);
                border-radius:14px;
                padding:0.38rem 0.8rem;
                margin-bottom:0.35rem;
                box-shadow:0 8px 18px rgba(10,10,10,0.04);
                color:{COLOR_BLACK};
                font-weight:900;
                font-size:1rem;
            ">
                Jornada {selected_matchday}
            </div>
            """,
            unsafe_allow_html=True,
        )
        selected_matchday = st.selectbox(
            "Jornada",
            options=sequence,
            key=widget_key,
        )
        st.session_state[state_key] = int(selected_matchday)
        selected_matchday = int(st.session_state[state_key])
        current_index = sequence.index(selected_matchday)
        can_go_previous = current_index > 0
        can_go_next = current_index < len(sequence) - 1
    with filter_col3:
        st.markdown("<div style='height:1.65rem;'></div>", unsafe_allow_html=True)
        nav_col1, nav_col2 = st.columns(2, gap="small")
        with nav_col1:
            if st.button(
                "←",
                key=f"calendar_prev_{competition_label}",
                use_container_width=True,
                type="primary",
                disabled=not can_go_previous,
            ):
                st.session_state[state_key] = sequence[current_index - 1]
                st.rerun()
        with nav_col2:
            if st.button(
                "→",
                key=f"calendar_next_{competition_label}",
                use_container_width=True,
                type="primary",
                disabled=not can_go_next,
            ):
                st.session_state[state_key] = sequence[current_index + 1]
                st.rerun()

    _, filtered_competition = _get_competition_active_matches(
        competition_label=competition_label,
        competition_df=competition_df,
        selected_groups=selected_groups,
        order_mode="Por jugadores BD",
    )

    total_matches = len(filtered_competition)
    total_players_detected = int(filtered_competition["players_in_db"].sum())

    summary_col1, summary_col2 = st.columns([1, 1.6], gap="large")
    with summary_col1:
        st.metric("Partidos de la jornada", total_matches)
        st.markdown("<div style='height:0.8rem;'></div>", unsafe_allow_html=True)
        st.metric("Jugadores detectados", total_players_detected)

    with summary_col2:
        if filtered_competition.empty:
            st.metric("Distribución", "-")
        else:
            chart_df = filtered_competition.copy()
            chart_df["interest_label"] = chart_df["players_in_db"].apply(
                lambda value: _calendar_interest_label(int(value or 0))
            )
            grouped_chart_df = (
                chart_df.groupby(["interest_label", "group"], as_index=False)
                .size()
                .rename(columns={"size": "partidos"})
            )
            grouped_chart_df["group_label"] = grouped_chart_df["group"].astype(str)
            grouped_chart_df["group_short"] = grouped_chart_df["group_label"].map(
                _calendar_group_short_label
            )

            color_domain = CALENDAR_INTEREST_ORDER
            color_range = [CALENDAR_INTEREST_COLORS[label] for label in color_domain]
            bar_chart = alt.Chart(grouped_chart_df).mark_bar(
                cornerRadiusTopLeft=8,
                cornerRadiusTopRight=8,
                size=34,
            ).encode(
                x=alt.X(
                    "interest_label:N",
                    sort=CALENDAR_INTEREST_ORDER,
                    title=None,
                    axis=alt.Axis(labelAngle=0, labelLimit=180, ticks=False, domain=False),
                ),
                xOffset=alt.XOffset("group_label:N", sort="ascending"),
                y=alt.Y(
                    "partidos:Q",
                    title="Partidos",
                    axis=alt.Axis(grid=False, domain=False, tickCount=5),
                ),
                color=alt.Color(
                    "interest_label:N",
                    scale=alt.Scale(domain=color_domain, range=color_range),
                    legend=None,
                ),
                tooltip=[
                    alt.Tooltip("group:N", title="Grupo"),
                    alt.Tooltip("interest_label:N", title="Categoría"),
                    alt.Tooltip("partidos:Q", title="Partidos"),
                ],
            )
            count_labels = alt.Chart(grouped_chart_df).mark_text(
                dy=-6,
                fontSize=12,
                fontWeight="bold",
                color=COLOR_BLACK,
            ).encode(
                x=alt.X("interest_label:N", sort=CALENDAR_INTEREST_ORDER),
                xOffset=alt.XOffset("group_label:N", sort="ascending"),
                y=alt.Y("partidos:Q"),
                text=alt.Text("partidos:Q"),
            )
            group_labels = alt.Chart(grouped_chart_df).mark_text(
                dy=-20,
                fontSize=10,
                fontWeight="bold",
                color=COLOR_DARK_GRAY,
            ).encode(
                x=alt.X("interest_label:N", sort=CALENDAR_INTEREST_ORDER),
                xOffset=alt.XOffset("group_label:N", sort="ascending"),
                y=alt.Y("partidos:Q"),
                text=alt.Text("group_short:N"),
            )
            distribution_chart = (
                (bar_chart + count_labels + group_labels)
                .properties(height=210)
                .configure_view(strokeOpacity=0)
                .configure_axis(
                    labelColor=COLOR_DARK_GRAY,
                    titleColor=COLOR_DARK_GRAY,
                )
            )
            st.markdown("**Distribución por interés y grupo**")
            st.altair_chart(distribution_chart, use_container_width=True)

    st.markdown(
        f"""
        <div style="margin:0.2rem 0 0.8rem 0; color:#5a5a5a; font-weight:700;">
            Jornada activa: {competition_label} J{int(selected_matchday)}
        </div>
        """,
        unsafe_allow_html=True,
    )

    if filtered_competition.empty:
        st.info(f"No hay partidos en {competition_label} para esta jornada con los filtros actuales.")
        return

    for _, match_row in filtered_competition.iterrows():
        render_calendar_match_card(match_row)


def render_calendar_tab(df: pd.DataFrame) -> None:
    render_section_title("Planificación de partidos")
    st.caption(
        "Cruce entre calendario 1RFEF / 2RFEF y los jugadores presentes en la base actual."
    )

    control_col1, control_col2 = st.columns([1, 3], gap="medium")
    with control_col1:
        full_refresh = st.toggle(
            "Recarga completa",
            value=False,
            help=(
                "Si está desactivado, solo actualiza jornadas próximas, partidos sin hora "
                "o estados aún abiertos. Si la hoja está vacía, hace la carga inicial completa."
            ),
        )
        if st.button("Actualizar calendario", use_container_width=True):
            with st.spinner("Actualizando calendario..."):
                refreshed_df = refresh_calendar_matches(full_refresh=full_refresh)
            get_calendar_matches.clear()
            get_team_name_map.clear()
            st.success(
                f"Calendario actualizado: {len(refreshed_df)} partidos guardados en Google Sheets."
            )
            st.rerun()

    with control_col2:
        st.markdown(
            """
            <div class="unionistas-panel" style="height:100%;">
                <div style="font-weight:800; color:#111111; margin-bottom:0.35rem;">
                    Lógica de actualización
                </div>
                <div style="color:#4a4a4a; line-height:1.45;">
                    La carga inicial guarda el calendario base completo. Después, el botón revisa
                    sobre todo jornadas próximas, partidos pendientes de horario y estados no cerrados,
                    para evitar consultas innecesarias.
                </div>
            </div>
            """,
            unsafe_allow_html=True,
        )

    try:
        calendar_df = get_calendar_matches()
        team_map_df = get_team_name_map()
    except Exception as exc:
        st.error("No se pudo cargar la hoja de calendario.")
        st.exception(exc)
        return

    if calendar_df.empty:
        st.info(
            "La hoja `calendar_matches` todavía está vacía. Usa `Actualizar calendario` para "
            "hacer la carga inicial."
        )
        return

    source_col1, source_col2 = st.columns([1.15, 3], gap="medium")
    with source_col1:
        player_source = st.selectbox(
            "Fuente de jugadores",
            options=["Base general", "Campogramas"],
            key="calendar_player_source",
        )
    with source_col2:
        st.caption(
            "Base general usa la hoja subjetiva principal. Campogramas usa solo jugadores 1RFEF/2RFEF incluidos en los campogramas."
        )

    try:
        calendar_source_df = build_calendar_player_source(df, player_source)
    except Exception as exc:
        st.error("No se pudieron cargar los jugadores de campogramas para el calendario.")
        st.exception(exc)
        return

    planning_df = build_calendar_interest(calendar_source_df, calendar_df, team_map_df)
    planning_df["date"] = pd.to_datetime(planning_df["date"], errors="coerce")
    planning_df["display_date"] = planning_df["date"].dt.strftime("%d/%m/%Y").fillna("")

    filter_col1 = st.columns(1, gap="medium")[0]
    with filter_col1:
        interesting_only = st.toggle(
            "Solo partidos con jugadores",
            value=False,
            key="calendar_filter_interesting_only",
        )

    filtered_planning = planning_df.copy()
    if interesting_only:
        filtered_planning = filtered_planning[filtered_planning["players_in_db"] > 0]

    if filtered_planning.empty:
        st.warning("No hay partidos disponibles con los filtros actuales.")
        return

    st.markdown("<div style='height:0.3rem;'></div>", unsafe_allow_html=True)
    export_col1, export_col2, export_col3, export_col4, export_col5 = st.columns(
        [1.15, 1.2, 1.8, 2.6, 1.15],
        gap="medium",
    )
    with export_col1:
        st.markdown(
            f"""
            <div style="
                display:inline-block;
                background:#FFFFFF;
                color:{COLOR_BLACK};
                font-weight:900;
                border-radius:14px;
                border:1px solid rgba(0,0,0,0.08);
                padding:0.45rem 0.85rem;
                margin-bottom:0.55rem;
            ">
                Imprimir Calendario
            </div>
            """,
            unsafe_allow_html=True,
        )
        export_scope = st.selectbox(
            "Ámbito",
            options=["Todo", "1RFEF", "2RFEF"],
            key="calendar_pdf_scope",
        )
    with export_col2:
        export_order = st.selectbox(
            "Orden",
            options=["Por jugadores BD", "Por horario"],
            key="calendar_pdf_order",
        )
    export_groups: list[str] | None = None
    with export_col3:
        if export_scope in {"1RFEF", "2RFEF"}:
            export_groups = st.multiselect(
                "Grupos PDF",
                options=sorted(
                    filtered_planning.loc[
                        filtered_planning["competition"] == export_scope, "group"
                    ]
                    .dropna()
                    .unique()
                    .tolist()
                ),
                default=sorted(
                    filtered_planning.loc[
                        filtered_planning["competition"] == export_scope, "group"
                    ]
                    .dropna()
                    .unique()
                    .tolist()
                ),
                key="calendar_pdf_groups",
            )
        else:
            st.markdown("<div style='height:2.35rem;'></div>", unsafe_allow_html=True)
    with export_col4:
        st.markdown("**Categorías PDF**")
        checkbox_cols = st.columns(4, gap="small")
        export_category_flags = {}
        for column, label in zip(checkbox_cols, CALENDAR_INTEREST_ORDER):
            with column:
                export_category_flags[label] = st.checkbox(
                    label,
                    value=True,
                    key=f"calendar_pdf_category_{label}",
                )
        export_categories = [
            label for label, is_enabled in export_category_flags.items() if is_enabled
        ]
    sections: list[CalendarPdfSection] = []
    competition_targets = ["1RFEF", "2RFEF"] if export_scope == "Todo" else [export_scope]
    team_map_df = get_team_name_map()
    logo_map = get_calendar_team_logos()
    for competition_label in competition_targets:
        competition_df = filtered_planning[
            filtered_planning["competition"] == competition_label
        ].copy()
        active_groups = export_groups if export_scope == competition_label else _get_competition_selected_groups(
            competition_label,
            competition_df,
        )
        matchday, export_df = _get_competition_active_matches(
            competition_label=competition_label,
            competition_df=competition_df,
            selected_groups=active_groups,
            order_mode=export_order,
        )
        if matchday is None or export_df.empty:
            continue
        export_df = export_df.copy()
        export_df["interest_label"] = export_df["players_in_db"].apply(
            lambda value: _calendar_interest_label(int(value or 0))
        )
        if export_categories:
            export_df = export_df[export_df["interest_label"].isin(export_categories)].copy()
        if export_df.empty:
            continue
        export_df["resolved_home_team_key"] = export_df.apply(
            lambda row: resolve_team_key(row.get("home_team"), row.get("competition"), team_map_df),
            axis=1,
        )
        export_df["resolved_away_team_key"] = export_df.apply(
            lambda row: resolve_team_key(row.get("away_team"), row.get("competition"), team_map_df),
            axis=1,
        )
        sections.append(
            CalendarPdfSection(
                competition=competition_label,
                matchday=matchday,
                order_label=export_order,
                matches=export_df,
            )
        )

    pdf_bytes = b""
    if sections:
        pdf_bytes = build_calendar_pdf(
            sections=sections,
            unionistas_logo_path=LOGO_PATH,
            logo_map=logo_map,
            printed_at=datetime.now(),
        )
    with export_col5:
        st.markdown("<div style='height:1.75rem;'></div>", unsafe_allow_html=True)
        st.download_button(
            "Imprimir Calendario",
            data=pdf_bytes,
            file_name=f"Calendario_ScoutUnion_{datetime.now().strftime('%y%m%d')}.pdf",
            mime="application/pdf",
            use_container_width=True,
            disabled=not bool(pdf_bytes),
        )

    for competition_label in ["1RFEF", "2RFEF"]:
        competition_df = filtered_planning[
            filtered_planning["competition"] == competition_label
        ].copy()
        render_competition_calendar_section(competition_label, competition_df)

    render_section_title_inverse("Tabla completa")
    display_columns = [
        "display_date",
        "kickoff_time",
        "competition",
        "group",
        "matchday",
        "home_team",
        "away_team",
        "home_players_in_db",
        "home_players_detected",
        "away_players_in_db",
        "away_players_detected",
        "players_in_db",
        "players_detected",
        "status",
        "venue",
        "city",
        "updated_at",
    ]
    display_df = filtered_planning[display_columns].rename(
        columns={
            "display_date": "Fecha",
            "kickoff_time": "Hora",
            "competition": "Competición",
            "group": "Grupo",
            "matchday": "Jornada",
            "home_team": "Local",
            "away_team": "Visitante",
            "home_players_in_db": "Jug. local",
            "home_players_detected": "Detectados local",
            "away_players_in_db": "Jug. visitante",
            "away_players_detected": "Detectados visitante",
            "players_in_db": "Jugadores BD",
            "players_detected": "Jugadores detectados",
            "status": "Estado",
            "venue": "Estadio",
            "city": "Ciudad",
            "updated_at": "Actualizado",
        }
    )
    st.dataframe(
        display_df,
        use_container_width=True,
        hide_index=True,
        height=700,
    )


def main() -> None:
    initialize_state()
    apply_pending_filter()
    apply_custom_theme()

    if not render_login():
        st.stop()

    render_header()

    try:
        df = get_data()
    except PermissionError:
        service_account_email = get_service_account_email()
        st.error("Google Sheets ha rechazado el acceso a esta hoja.")
        st.markdown("**Comprueba estos 3 puntos:**")
        st.markdown(
            f"1. La hoja está compartida con `{service_account_email}`."
        )
        st.markdown(
            "2. El `spreadsheet_id` corresponde exactamente a la URL de esa hoja."
        )
        st.markdown(
            "3. Las APIs `Google Sheets API` y `Google Drive API` están activadas en Google Cloud."
        )
        st.stop()
    except Exception as exc:
        st.error("No se pudo cargar la hoja de Google Sheets.")
        st.exception(exc)
        st.stop()

    filters = render_sidebar_filters(df)
    filtered_df = filter_reports(df, filters)

    if filtered_df.empty:
        st.warning("No hay datos con los filtros seleccionados.")
        st.stop()

    selected_view = st.segmented_control(
        "Navegacion",
        VIEWS,
        key="active_view",
        label_visibility="collapsed",
    )

    objective_df: pd.DataFrame | None = None
    objective_matches_df: pd.DataFrame | None = None
    if selected_view in {"Dashboard", "Jugador"}:
        try:
            objective_df = get_objective_data()
            objective_matches_df = get_objective_matches()
        except FileNotFoundError:
            objective_df = None
            objective_matches_df = None
        except Exception as exc:
            st.warning(f"No se pudieron cargar los datos objetivos 1RFEF: {exc}")
            objective_df = None
            objective_matches_df = None

    if selected_view == "Dashboard":
        render_overview(filtered_df, df, objective_matches_df)
    elif selected_view == "Jugador":
        render_player_tab(filtered_df, objective_df, objective_matches_df)
    elif selected_view == "Calendario":
        render_calendar_tab(filtered_df)
    elif selected_view == "Campogramas":
        render_campograms_tab()
    else:
        render_reports_table(filtered_df)


if __name__ == "__main__":
    main()
