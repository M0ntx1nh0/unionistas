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
    page_title="Unionistas Scouting",
    page_icon="⚽",
    layout="wide",
)


LOGO_PATH = Path("assets/escudo/unionistar.png")
COLOR_BLACK = "#0A0A0A"
COLOR_WHITE = "#F5F5F5"
COLOR_GRAY = "#B8B8B8"
COLOR_DARK_GRAY = "#4A4A4A"
COLOR_GOLD = "#E7D21A"
VIEWS = ["Dashboard", "Jugador", "Informes"]


@st.cache_data(ttl=300, show_spinner=False)
def get_data() -> pd.DataFrame:
    return load_scouting_reports()


@st.cache_data(ttl=300, show_spinner=False)
def get_objective_data() -> pd.DataFrame:
    return load_objective_players()


@st.cache_data(ttl=300, show_spinner=False)
def get_objective_matches(subjective_df: pd.DataFrame) -> pd.DataFrame:
    objective_df = get_objective_data()
    return match_objective_players(subjective_df, objective_df)


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
                <h1 class="unionistas-title">Scouting Dashboard</h1>
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
        text_column = "veredicto"
        color_scale = alt.Scale(
            domain=["A+", "A", "B", "C", "D", "E", "Seguir Valorando", "Filial/Juvenil DH"],
            range=["#0f8a3b", "#55a630", "#d4b000", "#f08c00", "#d9480f", "#c1121f", "#f08c00", "#7b2cbf"],
        )
    else:
        panel_df = panel_df.dropna(subset=["demarcacion_principal"]).copy()
        title = "Posición principal por scout y fecha"
        value_column = "demarcacion_principal"
        text_column = "demarcacion_short"
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
        panel_df["demarcacion_short"] = panel_df["demarcacion_principal"].map(short_labels).fillna(
            panel_df["demarcacion_principal"].astype(str).str.slice(0, 3).str.upper()
        )
        color_scale = alt.Scale(scheme="set2")

    if panel_df.empty:
        st.info("No hay datos suficientes para este bloque.")
        return

    panel_df = panel_df.sort_values(["marca_temporal", "ojeador"]).copy()
    panel_df["fecha_label"] = panel_df["marca_temporal"].dt.strftime("%d/%m/%y")
    x_order = panel_df["fecha_label"].drop_duplicates().tolist()
    y_order = panel_df["ojeador"].drop_duplicates().tolist()

    base = alt.Chart(panel_df)
    rect = base.mark_rect(cornerRadius=6).encode(
        x=alt.X(
            "fecha_label:N",
            sort=x_order,
            title=None,
            axis=alt.Axis(labelAngle=-35, labelFontSize=10, labelLimit=90),
        ),
        y=alt.Y(
            "ojeador:N",
            sort=y_order,
            title=None,
            axis=alt.Axis(labelFontSize=11, labelLimit=150),
        ),
        color=alt.Color(f"{value_column}:N", scale=color_scale, legend=None),
        tooltip=[
            alt.Tooltip("ojeador:N", title="Scout"),
            alt.Tooltip("marca_temporal:T", title="Fecha"),
            alt.Tooltip(f"{value_column}:N", title=("Veredicto" if mode == "verdict" else "Demarcación")),
        ],
    )
    text = base.mark_text(
        color="#111111",
        fontSize=10,
        fontWeight="bold",
    ).encode(
        x=alt.X("fecha_label:N", sort=x_order),
        y=alt.Y("ojeador:N", sort=y_order),
        text=alt.Text(f"{text_column}:N"),
    )
    chart = (
        (rect + text)
        .properties(height=max(150, len(y_order) * 52))
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
        render_rankings_section(full_df)
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

    if quick_verdict != "Selecciona un veredicto":
        queue_single_filter("filter_verdicts", quick_verdict)

    if quick_scout != "Selecciona un ojeador":
        queue_single_filter("filter_scouts", quick_scout)



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

    objective_df: pd.DataFrame | None = None
    objective_matches_df: pd.DataFrame | None = None
    try:
        objective_df = get_objective_data()
        objective_matches_df = get_objective_matches(df)
    except FileNotFoundError:
        objective_df = None
        objective_matches_df = None
    except Exception as exc:
        st.warning(f"No se pudieron cargar los datos objetivos 1RFEF: {exc}")
        objective_df = None
        objective_matches_df = None

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
            objective_matches_df = get_objective_matches(df)
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
    else:
        render_reports_table(filtered_df)


if __name__ == "__main__":
    main()
