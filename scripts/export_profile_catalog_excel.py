from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import sys
from xml.sax.saxutils import escape
from zipfile import ZIP_DEFLATED, ZipFile

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from src.scouting_app.objective_profiles import (
    CENTER_BACK_ROLE_METRICS,
    LATERAL_ROLE_METRICS,
    MIDFIELD_PROFILE_GROUPS,
    MIDFIELD_ROLE_METRICS,
    STRIKER_PROFILE_GROUPS,
    STRIKER_ROLE_METRICS,
    WINGER_PROFILE_GROUPS,
    WINGER_ROLE_METRICS,
)


@dataclass(frozen=True)
class VisibleProfile:
    family: str
    visible_profile: str
    source_roles: tuple[str, ...]


VISIBLE_PROFILES: tuple[VisibleProfile, ...] = (
    VisibleProfile("Laterales", "Lateral ofensivo", ("Attacking FB",)),
    VisibleProfile("Laterales", "Lateral interior", ("Inverted FB",)),
    VisibleProfile("Laterales", "Lateral defensivo", ("Defensive FB",)),
    VisibleProfile("Centrales", "Central constructor", ("Ball playing CB",)),
    VisibleProfile("Centrales", "Central defensivo", ("Defensive CB",)),
    VisibleProfile("Centrales", "Central veloz", ("Fast CB",)),
    VisibleProfile("Centrocampistas", "Pivote", MIDFIELD_PROFILE_GROUPS["Pivot"]),
    VisibleProfile("Centrocampistas", "Mediocentro creador", MIDFIELD_PROFILE_GROUPS["Midfield Creator"]),
    VisibleProfile("Centrocampistas", "Mediapunta-asistente", MIDFIELD_PROFILE_GROUPS["Attacking Mid Creator"]),
    VisibleProfile("Centrocampistas", "Box to Box", MIDFIELD_PROFILE_GROUPS["Box to Box"]),
    VisibleProfile("Delanteros", "Segundo punta", STRIKER_PROFILE_GROUPS["Second Striker"]),
    VisibleProfile("Delanteros", "Delantero referencia", STRIKER_PROFILE_GROUPS["Target Man"]),
    VisibleProfile("Delanteros", "Delantero profundo", STRIKER_PROFILE_GROUPS["Advanced Striker"]),
    VisibleProfile("Extremos", "Extremo clásico", WINGER_PROFILE_GROUPS["Traditional Winger"]),
    VisibleProfile("Extremos", "Extremo creador", WINGER_PROFILE_GROUPS["Creative Winger"]),
    VisibleProfile("Extremos", "Extremo finalizador", WINGER_PROFILE_GROUPS["Inside Forward"]),
)

METRIC_LABELS = {
    "passes_to_final_third_avg": ("Passes to final third per 90", "Pases al ultimo tercio/90"),
    "pass_to_penalty_area_avg": ("Passes to penalty area per 90", "Pases al area/90"),
    "xg_assist_avg": ("Expected assists (xA) per 90", "Asistencias esperadas (xA)/90"),
    "assists_avg": ("Assists per 90", "Asistencias/90"),
    "accurate_crosses_percent": ("Accurate crosses, %", "Precision de centros %"),
    "progressive_run_avg": ("Progressive runs per 90", "Carreras progresivas/90"),
    "accelerations_avg": ("Accelerations per 90", "Aceleraciones/90"),
    "offensive_duels_won_percent": ("Offensive duels won, %", "% duelos ofensivos ganados"),
    "successful_dribbles_percent": ("Successful dribbles, %", "% regates exitosos"),
    "passes_avg": ("Passes per 90", "Pases/90"),
    "smart_passes_avg": ("Smart passes per 90", "Pases inteligentes/90"),
    "through_passes_avg": ("Through passes per 90", "Pases filtrados/90"),
    "progressive_pass_avg": ("Progressive passes per 90", "Pases progresivos/90"),
    "possession_adjusted_tackle": ("PAdj sliding tackles", "Entradas ajustadas por posesion"),
    "possession_adjusted_interceptions": ("PAdj interceptions", "Intercepciones ajustadas por posesion"),
    "short_medium_pass_avg": ("Short / medium passes per 90", "Pases cortos/medios/90"),
    "defensive_duels_won_percent": ("Defensive duels won, %", "% duelos defensivos ganados"),
    "aerial_duels_won_percent": ("Aerial duels won, %", "% duelos aereos ganados"),
    "successful_long_passes_percent": ("Accurate long passes, %", "Precision de pase largo %"),
    "deep_completed_pass_avg": ("Deep completions per 90", "Pases profundos completados/90"),
    "successful_defensive_actions_avg": ("Successful defensive actions per 90", "Acciones defensivas exitosas/90"),
    "tackle_avg": ("Tackles per 90", "Entradas/90"),
    "interceptions_avg": ("Interceptions per 90", "Intercepciones/90"),
    "xg_shot_avg": ("xG per 90", "xG/90"),
    "dribbles_avg": ("Dribbles per 90", "Regates/90"),
    "touch_in_box_avg": ("Touches in box per 90", "Toques en area/90"),
    "accurate_passes_percent": ("Accurate passes, %", "Precision de pase %"),
    "forward_passes_avg": ("Forward passes per 90", "Pases hacia delante/90"),
    "successful_forward_passes_percent": ("Accurate forward passes, %", "Precision pase hacia delante %"),
    "successful_short_medium_passes_percent": ("Accurate short / medium passes, %", "Precision pase corto/medio %"),
    "successful_through_passes_percent": ("Accurate through passes, %", "Precision pases filtrados %"),
    "long_pass_avg": ("Long passes per 90", "Pases largos/90"),
    "received_pass_avg": ("Received passes per 90", "Pases recibidos/90"),
    "pre_assist_avg": ("Second + third assists per 90", "Segundas + terceras asistencias/90"),
    "accurate_smart_passes_percent": ("Accurate smart passes, %", "Precision pases inteligentes %"),
    "crosses_avg": ("Crosses per 90", "Centros/90"),
    "non_penalty_goal_avg": ("Non-penalty goals per 90", "Goles sin penalti/90"),
    "goal_conversion_percent": ("Goal conversion, %", "Conversion de gol %"),
    "shots_on_target_percent_proxy": ("Shots on target proxy, %", "Proxy precision de remate %"),
    "shots_avg": ("Shots per 90", "Tiros/90"),
    "cross_to_goalie_box_avg": ("Deep completed crosses per 90", "Centros profundos completados/90"),
    "goals_avg": ("Goals per 90", "Goles/90"),
}

ROLE_METRICS = {
    **LATERAL_ROLE_METRICS,
    **CENTER_BACK_ROLE_METRICS,
    **MIDFIELD_ROLE_METRICS,
    **STRIKER_ROLE_METRICS,
    **WINGER_ROLE_METRICS,
}

HEADERS = (
    "Familia",
    "Perfil visible",
    "Rol base",
    "Metrica tecnica",
    "Metrica (EN)",
    "Metrica (ES)",
    "Peso (%)",
)


def metric_labels(metric_key: str) -> tuple[str, str]:
    return METRIC_LABELS.get(metric_key, (metric_key, metric_key))


def build_rows() -> list[tuple[str, str, str, str, str, str, float]]:
    rows: list[tuple[str, str, str, str, str, str, float]] = []
    for profile in VISIBLE_PROFILES:
        for source_role in profile.source_roles:
            metric_map = ROLE_METRICS[source_role]["metrics"]
            for metric_key, weight in metric_map.items():
                english, spanish = metric_labels(metric_key)
                rows.append(
                    (
                        profile.family,
                        profile.visible_profile,
                        source_role,
                        metric_key,
                        english,
                        spanish,
                        round(weight * 100, 2),
                    )
                )
    return rows


def excel_col(column_index: int) -> str:
    result = ""
    current = column_index
    while current > 0:
        current, remainder = divmod(current - 1, 26)
        result = chr(65 + remainder) + result
    return result


def inline_str_cell(cell_ref: str, value: str, style_id: int = 0) -> str:
    safe_value = escape(value)
    return f'<c r="{cell_ref}" t="inlineStr" s="{style_id}"><is><t>{safe_value}</t></is></c>'


def number_cell(cell_ref: str, value: float, style_id: int = 0) -> str:
    return f'<c r="{cell_ref}" s="{style_id}"><v>{value:.2f}</v></c>'


def build_sheet_xml(rows: list[tuple[str, str, str, str, str, str, float]]) -> str:
    all_rows = [HEADERS, *rows]
    xml_rows: list[str] = []
    column_widths = [18, 22, 22, 28, 34, 34, 12]
    cols_xml = "".join(
        f'<col min="{idx}" max="{idx}" width="{width}" customWidth="1"/>'
        for idx, width in enumerate(column_widths, start=1)
    )

    for row_idx, row_values in enumerate(all_rows, start=1):
        cells: list[str] = []
        for col_idx, value in enumerate(row_values, start=1):
            cell_ref = f"{excel_col(col_idx)}{row_idx}"
            if row_idx == 1:
                cells.append(inline_str_cell(cell_ref, str(value), style_id=1))
            elif col_idx == 7:
                cells.append(number_cell(cell_ref, float(value), style_id=2))
            else:
                cells.append(inline_str_cell(cell_ref, str(value), style_id=0))
        xml_rows.append(f'<row r="{row_idx}">{"".join(cells)}</row>')

    last_row = len(all_rows)
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
        f'<cols>{cols_xml}</cols>'
        '<sheetViews><sheetView workbookViewId="0">'
        '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>'
        '</sheetView></sheetViews>'
        f'<sheetData>{"".join(xml_rows)}</sheetData>'
        f'<autoFilter ref="A1:G{last_row}"/>'
        '</worksheet>'
    )


def build_styles_xml() -> str:
    return """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="2">
    <font><sz val="11"/><name val="Calibri"/></font>
    <font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>
  </fonts>
  <fills count="3">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF1F2937"/><bgColor indexed="64"/></patternFill></fill>
  </fills>
  <borders count="1">
    <border><left/><right/><top/><bottom/><diagonal/></border>
  </borders>
  <cellStyleXfs count="1">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>
  </cellStyleXfs>
  <cellXfs count="3">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>
    <xf numFmtId="2" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
  </cellXfs>
  <cellStyles count="1">
    <cellStyle name="Normal" xfId="0" builtinId="0"/>
  </cellStyles>
</styleSheet>"""


def build_workbook_xml() -> str:
    return """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
 xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="Perfiles" sheetId="1" r:id="rId1"/>
  </sheets>
</workbook>"""


def build_content_types_xml() -> str:
    return """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>"""


def build_root_rels_xml() -> str:
    return """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>"""


def build_workbook_rels_xml() -> str:
    return """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>"""


def build_core_xml() -> str:
    return """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"
 xmlns:dc="http://purl.org/dc/elements/1.1/"
 xmlns:dcterms="http://purl.org/dc/terms/"
 xmlns:dcmitype="http://purl.org/dc/dcmitype/"
 xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:creator>Codex</dc:creator>
  <cp:lastModifiedBy>Codex</cp:lastModifiedBy>
  <dc:title>Catalogo de perfiles Unionistas</dc:title>
</cp:coreProperties>"""


def build_app_xml() -> str:
    return """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"
 xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>Codex</Application>
</Properties>"""


def build_workbook(output_path: Path) -> Path:
    rows = build_rows()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with ZipFile(output_path, "w", compression=ZIP_DEFLATED) as workbook:
        workbook.writestr("[Content_Types].xml", build_content_types_xml())
        workbook.writestr("_rels/.rels", build_root_rels_xml())
        workbook.writestr("xl/workbook.xml", build_workbook_xml())
        workbook.writestr("xl/_rels/workbook.xml.rels", build_workbook_rels_xml())
        workbook.writestr("xl/styles.xml", build_styles_xml())
        workbook.writestr("xl/worksheets/sheet1.xml", build_sheet_xml(rows))
        workbook.writestr("docProps/core.xml", build_core_xml())
        workbook.writestr("docProps/app.xml", build_app_xml())
    return output_path


def main() -> None:
    output_path = Path("outputs/perfiles_unionistas_catalogo.xlsx")
    saved = build_workbook(output_path)
    print(saved.resolve())


if __name__ == "__main__":
    main()
