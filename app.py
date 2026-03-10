from __future__ import annotations

from pathlib import Path

import altair as alt
import pandas as pd
import streamlit as st

from src.scouting_app.auth import render_login
from src.scouting_app.data_processing import (
    build_player_summary,
    filter_reports,
    load_scouting_reports,
    summarize_repeated_capabilities,
)
from src.scouting_app.google_sheets import get_service_account_email


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
    panel_start()
    st.markdown(f"**{title}**")
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
    panel_end()


def render_labeled_bar_chart(
    data: pd.DataFrame,
    category_column: str,
    value_column: str,
    title: str,
    horizontal: bool = False,
    x_label_angle: int = 0,
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
            x=alt.X(f"{value_column}:Q", title="Informes"),
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
            y=alt.Y(f"{value_column}:Q", title="Informes"),
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
    grand_total = int(complete_heatmap["jugadores"].sum())
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
            title="Jugadores",
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
            title="Jugadores",
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


def render_overview(df: pd.DataFrame, full_df: pd.DataFrame) -> None:
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
        )
        render_position_competition_heatmap(df)
        render_rankings_section(full_df)

    if quick_verdict != "Selecciona un veredicto":
        queue_single_filter("filter_verdicts", quick_verdict)

    if quick_scout != "Selecciona un ojeador":
        queue_single_filter("filter_scouts", quick_scout)



def render_player_tab(df: pd.DataFrame) -> None:
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

    col1, col2, col3, col4, col5 = st.columns(5)
    col1.metric("Veces visto", summary["times_seen"])
    col1.caption(
        f"Posición principal: {summary['primary_position']} | {summary['position_scouts']}"
    )
    col2.metric("Último veredicto", summary["latest_verdict"])
    col3.metric("Consenso histórico", summary["consensus_label"])
    col3.caption(summary["consensus_detail"])
    st.caption(f"Detalle valoraciones: {summary['verdict_scouts']}")
    col4.metric("Último informe", summary["last_seen"])
    col5.metric("Equipo", summary["team"])

    panel_start()
    st.markdown("**Perfil**")
    profile_cols = st.columns(4)
    profile_cols[0].write(f"**Demarcación:** {summary['position']}")
    profile_cols[1].write(f"**Año nac.:** {summary['birth_year']}")
    profile_cols[2].write(f"**Nacionalidad:** {summary['nationality']}")
    profile_cols[3].write(f"**Lateralidad:** {summary['foot']}")
    panel_end()

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

    panel_start()
    st.markdown("**Historial de informes**")
    reports_sorted = player_df.sort_values("marca_temporal", ascending=False).copy()
    for _, report in reports_sorted.iterrows():
        render_report_card(report)
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
    if selected_view == "Dashboard":
        render_overview(filtered_df, df)
    elif selected_view == "Jugador":
        render_player_tab(filtered_df)
    else:
        render_reports_table(filtered_df)


if __name__ == "__main__":
    main()
