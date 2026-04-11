from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from io import BytesIO
from pathlib import Path
from typing import Any

import matplotlib.pyplot as plt
import pandas as pd
import requests
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas


PAGE_WIDTH, PAGE_HEIGHT = A4
UNIONISTAS_BLACK = colors.HexColor("#111111")
UNIONISTAS_GOLD = colors.HexColor("#E7D21A")
UNIONISTAS_WHITE = colors.HexColor("#FFFFFF")
UNIONISTAS_GRAY = colors.HexColor("#5A5A5A")
UNIONISTAS_LIGHT = colors.HexColor("#F7F7F3")
CREDITS_TEXT = "Informe realizado por: Ramón Codesido | MCode"
INTEREST_ORDER = ["+ de 10 jugadores", "7-10 jugadores", "4-6 jugadores", "Menos de 4"]
INTEREST_COLORS = {
    "+ de 10 jugadores": "#0f8a3b",
    "7-10 jugadores": "#8CCF5F",
    "4-6 jugadores": "#D4B000",
    "Menos de 4": "#8F8F8F",
}


@dataclass
class CalendarPdfSection:
    competition: str
    matchday: int
    order_label: str
    matches: pd.DataFrame


def _interest_badge(players_in_db: int) -> tuple[str, colors.Color, colors.Color]:
    if players_in_db > 10:
        return "+ de 10 jugadores", colors.HexColor("#0f8a3b"), colors.HexColor("#E8F8EC")
    if 7 <= players_in_db <= 10:
        return "7-10 jugadores", colors.HexColor("#55a630"), colors.HexColor("#EEF8E2")
    if 4 <= players_in_db <= 6:
        return "4-6 jugadores", colors.HexColor("#D4B000"), colors.HexColor("#FFF7D6")
    return "Menos de 4", colors.HexColor("#8F8F8F"), colors.HexColor("#F0F0F0")


def _safe_text(value: Any) -> str:
    return str(value or "").strip()


def _short_group_label(value: Any) -> str:
    text = _safe_text(value)
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


def _load_local_image(path: Path) -> ImageReader | None:
    if not path.exists():
        return None
    try:
        return ImageReader(str(path))
    except Exception:
        return None


def _load_remote_image(url: str) -> ImageReader | None:
    if not url:
        return None
    try:
        response = requests.get(url, timeout=10)
        response.raise_for_status()
        return ImageReader(BytesIO(response.content))
    except Exception:
        return None


def _wrap_player_list(
    pdf: canvas.Canvas,
    text: str,
    max_width: float,
    font_name: str = "Helvetica",
    font_size: int = 7,
    max_lines: int = 2,
) -> list[str]:
    clean_text = _safe_text(text)
    if not clean_text:
        return ["Sin jugadores detectados"]

    items = [item.strip() for item in clean_text.split("|") if item.strip()]
    if not items:
        return [clean_text]

    lines: list[str] = []
    current = ""
    overflow = False

    for item in items:
        candidate = item if not current else f"{current} | {item}"
        if pdf.stringWidth(candidate, font_name, font_size) <= max_width:
            current = candidate
            continue

        if current:
            lines.append(current)
            current = item
        else:
            trimmed = item
            ellipsis = "..."
            while trimmed and pdf.stringWidth(trimmed + ellipsis, font_name, font_size) > max_width:
                trimmed = trimmed[:-1].rstrip()
            lines.append((trimmed + ellipsis) if trimmed else ellipsis)
            current = ""

        if len(lines) >= max_lines:
            overflow = True
            current = ""
            break

    if current and len(lines) < max_lines:
        lines.append(current)

    if overflow and lines:
        last_line = lines[max_lines - 1]
        if not last_line.endswith("..."):
            while last_line and pdf.stringWidth(last_line + "...", font_name, font_size) > max_width:
                last_line = last_line[:-1].rstrip(" |")
            lines[max_lines - 1] = (last_line + "...") if last_line else "..."

    return lines[:max_lines]


def _draw_team_header(
    pdf: canvas.Canvas,
    team_name: str,
    team_logo: ImageReader | None,
    center_x: float,
    baseline_y: float,
    font_name: str = "Helvetica-Bold",
    font_size: int = 11,
    logo_size: float = 16,
    gap: float = 6,
) -> None:
    text = _safe_text(team_name)
    display_text = text[:34]
    text_width = pdf.stringWidth(display_text, font_name, font_size)
    total_width = text_width + (logo_size + gap if team_logo else 0)
    start_x = center_x - (total_width / 2)

    if team_logo:
        pdf.drawImage(
            team_logo,
            start_x,
            baseline_y - 12,
            width=logo_size,
            height=logo_size,
            preserveAspectRatio=True,
            mask="auto",
        )
        text_x = start_x + logo_size + gap
    else:
        text_x = start_x

    pdf.setFillColor(UNIONISTAS_BLACK)
    pdf.setFont(font_name, font_size)
    pdf.drawString(text_x, baseline_y, display_text)


def _draw_cover(
    pdf: canvas.Canvas,
    unionistas_logo: ImageReader | None,
    title_suffix: str,
    printed_at: datetime,
) -> None:
    pdf.setFillColor(UNIONISTAS_WHITE)
    pdf.rect(0, 0, PAGE_WIDTH, PAGE_HEIGHT, stroke=0, fill=1)

    band_width = 95
    pdf.setFillColor(UNIONISTAS_BLACK)
    pdf.rect(0, 0, band_width, PAGE_HEIGHT, stroke=0, fill=1)
    pdf.setFillColor(UNIONISTAS_GOLD)
    pdf.rect(band_width - 6, 0, 6, PAGE_HEIGHT, stroke=0, fill=1)

    if unionistas_logo:
        pdf.drawImage(
            unionistas_logo,
            PAGE_WIDTH - 110,
            PAGE_HEIGHT - 110,
            width=72,
            height=72,
            preserveAspectRatio=True,
            mask="auto",
        )

    center_x = (band_width + PAGE_WIDTH) / 2
    center_y = PAGE_HEIGHT / 2 + 30
    pdf.setFillColor(UNIONISTAS_BLACK)
    pdf.setFont("Helvetica-Bold", 26)
    pdf.drawCentredString(center_x, center_y + 50, "Calendario Unionistas")
    pdf.setFont("Helvetica-Bold", 16)
    pdf.drawCentredString(center_x, center_y + 18, "Área de Scouting")
    pdf.setFont("Helvetica-Bold", 16)
    pdf.drawCentredString(center_x, center_y - 18, title_suffix)
    pdf.setFont("Helvetica", 12)
    pdf.drawCentredString(
        center_x,
        center_y - 52,
        f"Fecha de impresión: {printed_at.strftime('%d/%m/%Y')}",
    )
    pdf.setFillColor(UNIONISTAS_GRAY)
    pdf.setFont("Helvetica", 9)
    pdf.drawRightString(PAGE_WIDTH - 30, 18, CREDITS_TEXT)
    pdf.showPage()


def _draw_page_frame(
    pdf: canvas.Canvas,
    unionistas_logo: ImageReader | None,
    page_number: int,
    header_title: str | None = None,
    footer_left: str | None = None,
) -> None:
    if unionistas_logo:
        pdf.drawImage(
            unionistas_logo,
            PAGE_WIDTH - 62,
            PAGE_HEIGHT - 56,
            width=32,
            height=32,
            preserveAspectRatio=True,
            mask="auto",
        )
    if header_title:
        pdf.setFillColor(UNIONISTAS_BLACK)
        pdf.setFont("Helvetica-Bold", 13)
        pdf.drawString(30, PAGE_HEIGHT - 52, header_title)
    pdf.setStrokeColor(UNIONISTAS_BLACK)
    pdf.setLineWidth(1.2)
    pdf.line(30, PAGE_HEIGHT - 68, PAGE_WIDTH - 30, PAGE_HEIGHT - 68)

    pdf.setFillColor(UNIONISTAS_GRAY)
    pdf.setFont("Helvetica", 9)
    if footer_left:
        pdf.drawString(30, 18, footer_left)
    pdf.drawCentredString(PAGE_WIDTH / 2, 18, str(page_number))
    pdf.drawRightString(PAGE_WIDTH - 30, 18, CREDITS_TEXT)


def _build_distribution_chart_image(section: CalendarPdfSection) -> ImageReader | None:
    chart_df = section.matches.copy()
    if chart_df.empty:
        return None

    if "interest_label" not in chart_df.columns:
        chart_df["interest_label"] = chart_df["players_in_db"].apply(
            lambda value: _interest_badge(int(value or 0))[0]
        )

    grouped = (
        chart_df.groupby(["interest_label", "group"], as_index=False)
        .size()
        .rename(columns={"size": "partidos"})
    )
    if grouped.empty:
        return None

    categories = [item for item in INTEREST_ORDER if item in grouped["interest_label"].tolist()]
    groups = sorted(grouped["group"].dropna().astype(str).unique().tolist())
    if not categories or not groups:
        return None

    fig, ax = plt.subplots(figsize=(8.4, 3.2))
    bar_width = 0.16 if len(groups) >= 4 else 0.22
    positions = list(range(len(categories)))

    for group_index, group in enumerate(groups):
        group_df = grouped[grouped["group"] == group]
        offsets = [position + (group_index - (len(groups) - 1) / 2) * bar_width for position in positions]
        heights = [
            int(
                group_df.loc[group_df["interest_label"] == category, "partidos"].iloc[0]
            )
            if not group_df.loc[group_df["interest_label"] == category, "partidos"].empty
            else 0
            for category in categories
        ]
        bars = ax.bar(
            offsets,
            heights,
            width=bar_width * 0.92,
            color=[INTEREST_COLORS[category] for category in categories],
            edgecolor="none",
        )
        for bar, height in zip(bars, heights):
            if height <= 0:
                continue
            ax.text(
                bar.get_x() + bar.get_width() / 2,
                height + 0.1,
                str(height),
                ha="center",
                va="bottom",
                fontsize=9,
                fontweight="bold",
                color="#111111",
            )
            ax.text(
                bar.get_x() + bar.get_width() / 2,
                height + 0.9,
                _short_group_label(group),
                ha="center",
                va="bottom",
                fontsize=8,
                fontweight="bold",
                color="#5A5A5A",
            )

    ax.set_xticks(positions)
    ax.set_xticklabels(categories, fontsize=9)
    ax.set_ylabel("Partidos", fontsize=10)
    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)
    ax.spines["left"].set_visible(False)
    ax.grid(False)
    ax.set_axisbelow(True)
    ax.tick_params(axis="y", length=0)
    ax.tick_params(axis="x", length=0, pad=10)
    ax.set_title(
        f"{section.competition} | Jornada {section.matchday}",
        fontsize=12,
        fontweight="bold",
        color="#111111",
        pad=12,
    )
    ax.set_facecolor("white")
    fig.patch.set_facecolor("white")
    plt.tight_layout()

    image_buffer = BytesIO()
    fig.savefig(image_buffer, format="png", dpi=220, bbox_inches="tight", facecolor="white")
    plt.close(fig)
    image_buffer.seek(0)
    return ImageReader(image_buffer)


def _draw_match_card(
    pdf: canvas.Canvas,
    match_row: pd.Series,
    logo_map: dict[tuple[str, str], str],
    x: float,
    y: float,
    width: float,
    height: float,
) -> None:
    pdf.setFillColor(UNIONISTAS_WHITE)
    pdf.setStrokeColor(colors.HexColor("#E8E8E8"))
    pdf.roundRect(x, y - height, width, height, 14, stroke=1, fill=1)

    competition = _safe_text(match_row.get("competition"))
    date_label = ""
    date_value = pd.to_datetime(match_row.get("date"), errors="coerce")
    if pd.notna(date_value):
        date_label = date_value.strftime("%d/%m/%Y")
    kickoff_label = _safe_text(match_row.get("kickoff_time")) or "Horario pendiente"

    home_team = _safe_text(match_row.get("home_team"))
    away_team = _safe_text(match_row.get("away_team"))
    home_key = (competition, _safe_text(match_row.get("resolved_home_team_key")))
    away_key = (competition, _safe_text(match_row.get("resolved_away_team_key")))
    home_logo = _load_remote_image(logo_map.get(home_key, ""))
    away_logo = _load_remote_image(logo_map.get(away_key, ""))

    left_center_x = x + (width * 0.25)
    right_center_x = x + (width * 0.75)
    _draw_team_header(pdf, home_team, home_logo, left_center_x, y - 26)
    _draw_team_header(pdf, away_team, away_logo, right_center_x, y - 26)
    pdf.setFont("Helvetica-Bold", 9)
    pdf.setFillColor(UNIONISTAS_GRAY)
    pdf.drawCentredString(x + width / 2 - 6, y - 26, "vs")
    pdf.setFont("Helvetica", 8)
    pdf.drawString(x + 14, y - 44, f"{date_label} | {kickoff_label}")

    badge_text, badge_border, badge_background = _interest_badge(int(match_row.get("players_in_db") or 0))
    pdf.setFillColor(badge_background)
    pdf.setStrokeColor(badge_border)
    pdf.roundRect(x + width - 116, y - 16, 100, 16, 8, stroke=1, fill=1)
    pdf.setFillColor(UNIONISTAS_BLACK)
    pdf.setFont("Helvetica-Bold", 7)
    pdf.drawCentredString(x + width - 66, y - 9, badge_text)

    text_width = width - 28
    home_players_lines = _wrap_player_list(
        pdf,
        _safe_text(match_row.get("home_players_detected")) or "Sin jugadores detectados",
        max_width=text_width,
    )
    away_players_lines = _wrap_player_list(
        pdf,
        _safe_text(match_row.get("away_players_detected")) or "Sin jugadores detectados",
        max_width=text_width,
    )

    pdf.setFont("Helvetica-Bold", 8)
    pdf.setFillColor(UNIONISTAS_BLACK)
    pdf.drawString(x + 14, y - 62, f"{home_team}: {int(match_row.get('home_players_in_db') or 0)}")
    pdf.drawRightString(x + width - 14, y - 62, f"Total BD: {int(match_row.get('players_in_db') or 0)}")
    pdf.setFont("Helvetica", 7)
    pdf.setFillColor(UNIONISTAS_GRAY)
    for index, line in enumerate(home_players_lines):
        pdf.drawString(x + 14, y - 74 - (index * 9), line)

    away_heading_y = y - 92
    pdf.setFont("Helvetica-Bold", 8)
    pdf.setFillColor(UNIONISTAS_BLACK)
    pdf.drawString(x + 14, away_heading_y, f"{away_team}: {int(match_row.get('away_players_in_db') or 0)}")
    pdf.setFont("Helvetica", 7)
    pdf.setFillColor(UNIONISTAS_GRAY)
    for index, line in enumerate(away_players_lines):
        pdf.drawString(x + 14, away_heading_y - 12 - (index * 9), line)


def build_calendar_pdf(
    sections: list[CalendarPdfSection],
    unionistas_logo_path: Path,
    logo_map: dict[tuple[str, str], str],
    printed_at: datetime,
) -> bytes:
    buffer = BytesIO()
    pdf = canvas.Canvas(buffer, pagesize=A4)
    unionistas_logo = _load_local_image(unionistas_logo_path)

    cover_suffix = " | ".join(
        f"{section.competition} J{section.matchday}" for section in sections if not section.matches.empty
    ) or "Calendario"
    _draw_cover(pdf, unionistas_logo, cover_suffix, printed_at)

    page_number = 2
    chart_sections = [section for section in sections if not section.matches.empty]
    if chart_sections:
        pdf.setFillColor(UNIONISTAS_WHITE)
        pdf.rect(0, 0, PAGE_WIDTH, PAGE_HEIGHT, stroke=0, fill=1)
        _draw_page_frame(pdf, unionistas_logo, page_number)
        page_number += 1

        pdf.setFillColor(UNIONISTAS_BLACK)
        pdf.setFont("Helvetica-Bold", 16)
        pdf.drawString(34, PAGE_HEIGHT - 95, "Distribución por interés y grupo")
        pdf.setFont("Helvetica", 10)
        pdf.setFillColor(UNIONISTAS_GRAY)
        pdf.drawString(34, PAGE_HEIGHT - 112, "Resumen visual de las jornadas seleccionadas")

        chart_top_y = PAGE_HEIGHT - 150
        chart_height = 260 if len(chart_sections) == 1 else 280
        chart_spacing = 22
        available_sections = chart_sections[:2]
        for section in available_sections:
            chart_image = _build_distribution_chart_image(section)
            if chart_image:
                pdf.drawImage(
                    chart_image,
                    40,
                    chart_top_y - chart_height,
                    width=PAGE_WIDTH - 80,
                    height=chart_height,
                    preserveAspectRatio=True,
                    mask="auto",
                )
            chart_top_y -= chart_height + chart_spacing

        pdf.showPage()

    for section in sections:
        if section.matches.empty:
            continue
        first_group_page = True
        card_height = 116
        card_gap = 8

        for group, group_df in section.matches.groupby("group", sort=True):
            if not first_group_page:
                pdf.showPage()

            pdf.setFillColor(UNIONISTAS_WHITE)
            pdf.rect(0, 0, PAGE_WIDTH, PAGE_HEIGHT, stroke=0, fill=1)
            _draw_page_frame(
                pdf,
                unionistas_logo,
                page_number,
                header_title=f"{section.competition} | Jornada {section.matchday} | {group}",
                footer_left=f"Orden: {section.order_label}",
            )
            page_number += 1
            first_group_page = False
            current_y = PAGE_HEIGHT - 84

            for _, match_row in group_df.iterrows():
                if current_y - card_height < 40:
                    pdf.showPage()
                    pdf.setFillColor(UNIONISTAS_WHITE)
                    pdf.rect(0, 0, PAGE_WIDTH, PAGE_HEIGHT, stroke=0, fill=1)
                    _draw_page_frame(
                        pdf,
                        unionistas_logo,
                        page_number,
                        header_title=f"{section.competition} | Jornada {section.matchday} | {group}",
                        footer_left=f"Orden: {section.order_label}",
                    )
                    page_number += 1
                    current_y = PAGE_HEIGHT - 84

                _draw_match_card(
                    pdf=pdf,
                    match_row=match_row,
                    logo_map=logo_map,
                    x=34,
                    y=current_y,
                    width=PAGE_WIDTH - 68,
                    height=card_height,
                )
                current_y -= card_height + card_gap

    pdf.save()
    return buffer.getvalue()
