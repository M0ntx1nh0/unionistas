from __future__ import annotations

import hashlib
from pathlib import Path
from xml.sax.saxutils import escape
import zipfile
import xml.etree.ElementTree as ET

import pandas as pd
import streamlit as st


LOCAL_USERS_PATH = Path("auth/users.xlsx")


def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode("utf-8")).hexdigest()


def looks_like_sha256(value: str) -> bool:
    cleaned = value.strip().lower()
    if len(cleaned) != 64:
        return False
    return all(character in "0123456789abcdef" for character in cleaned)


def _xlsx_column_letters(index: int) -> str:
    result = ""
    while index > 0:
        index, remainder = divmod(index - 1, 26)
        result = chr(65 + remainder) + result
    return result


def read_simple_xlsx(path: Path) -> pd.DataFrame:
    ns = {"main": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
    with zipfile.ZipFile(path) as archive:
        sheet_xml = archive.read("xl/worksheets/sheet1.xml")
        shared_strings = []
        if "xl/sharedStrings.xml" in archive.namelist():
            shared_root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
            for item in shared_root.findall("main:si", ns):
                text_fragments = [node.text or "" for node in item.findall(".//main:t", ns)]
                shared_strings.append("".join(text_fragments))

    root = ET.fromstring(sheet_xml)
    rows: list[list[str]] = []
    for row in root.findall(".//main:sheetData/main:row", ns):
        current_values: list[str] = []
        for cell in row.findall("main:c", ns):
            cell_type = cell.get("t")
            value_node = cell.find("main:v", ns)
            inline_node = cell.find("main:is/main:t", ns)
            value = ""
            if cell_type == "s" and value_node is not None:
                index = int(value_node.text or "0")
                value = shared_strings[index] if index < len(shared_strings) else ""
            elif cell_type == "inlineStr" and inline_node is not None:
                value = inline_node.text or ""
            elif value_node is not None:
                value = value_node.text or ""
            current_values.append(value)
        rows.append(current_values)

    if not rows:
        return pd.DataFrame()
    header = rows[0]
    data = rows[1:]
    normalized = [row + [""] * (len(header) - len(row)) for row in data]
    return pd.DataFrame(normalized, columns=header)


def write_simple_xlsx(path: Path, df: pd.DataFrame) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    rows = [df.columns.tolist(), *df.fillna("").astype(str).values.tolist()]

    sheet_rows: list[str] = []
    for row_index, row in enumerate(rows, start=1):
        cells: list[str] = []
        for col_index, value in enumerate(row, start=1):
            cell_ref = f"{_xlsx_column_letters(col_index)}{row_index}"
            cells.append(
                f'<c r="{cell_ref}" t="inlineStr"><is><t>{escape(value)}</t></is></c>'
            )
        sheet_rows.append(f'<row r="{row_index}">{"".join(cells)}</row>')

    worksheet_xml = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
        f"<sheetData>{''.join(sheet_rows)}</sheetData>"
        "</worksheet>"
    )
    workbook_xml = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
        '<sheets><sheet name="Usuarios" sheetId="1" r:id="rId1"/></sheets>'
        "</workbook>"
    )
    workbook_rels_xml = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" '
        'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" '
        'Target="worksheets/sheet1.xml"/>'
        '<Relationship Id="rId2" '
        'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" '
        'Target="styles.xml"/>'
        "</Relationships>"
    )
    root_rels_xml = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" '
        'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" '
        'Target="xl/workbook.xml"/>'
        "</Relationships>"
    )
    content_types_xml = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        '<Default Extension="xml" ContentType="application/xml"/>'
        '<Override PartName="/xl/workbook.xml" '
        'ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
        '<Override PartName="/xl/worksheets/sheet1.xml" '
        'ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
        '<Override PartName="/xl/styles.xml" '
        'ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
        "</Types>"
    )
    styles_xml = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
        '<fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts>'
        '<fills count="1"><fill><patternFill patternType="none"/></fill></fills>'
        '<borders count="1"><border/></borders>'
        '<cellStyleXfs count="1"><xf/></cellStyleXfs>'
        '<cellXfs count="1"><xf xfId="0"/></cellXfs>'
        '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>'
        "</styleSheet>"
    )

    with zipfile.ZipFile(path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("[Content_Types].xml", content_types_xml)
        archive.writestr("_rels/.rels", root_rels_xml)
        archive.writestr("xl/workbook.xml", workbook_xml)
        archive.writestr("xl/_rels/workbook.xml.rels", workbook_rels_xml)
        archive.writestr("xl/worksheets/sheet1.xml", worksheet_xml)
        archive.writestr("xl/styles.xml", styles_xml)


def _normalize_users(df: pd.DataFrame) -> list[dict[str, str]]:
    users: list[dict[str, str]] = []
    if df.empty:
        return users

    normalized_columns = {column.lower().strip(): column for column in df.columns}
    required = {"username"}
    if not required.issubset(normalized_columns):
        return users

    for _, row in df.iterrows():
        username = str(row[normalized_columns["username"]]).strip()
        if not username:
            continue

        active_column = normalized_columns.get("active")
        is_active = True
        if active_column:
            active_value = row[active_column]
            if pd.notna(active_value):
                is_active = str(active_value).strip().lower() not in {"0", "false", "no"}
        if not is_active:
            continue

        password_hash = ""
        if "password" in normalized_columns and pd.notna(
            row[normalized_columns["password"]]
        ):
            password_hash = hash_password(str(row[normalized_columns["password"]]).strip())
        elif "password_hash" in normalized_columns and pd.notna(
            row[normalized_columns["password_hash"]]
        ):
            raw_password_hash = str(row[normalized_columns["password_hash"]]).strip()
            password_hash = (
                raw_password_hash
                if looks_like_sha256(raw_password_hash)
                else hash_password(raw_password_hash)
            )

        if not password_hash:
            continue

        users.append(
            {
                "username": username,
                "password_hash": password_hash,
                "name": str(row[normalized_columns.get("name", "username")]).strip()
                if normalized_columns.get("name")
                else username,
                "role": str(row[normalized_columns.get("role", "username")]).strip()
                if normalized_columns.get("role")
                else "",
            }
        )

    return users


def load_users() -> list[dict[str, str]]:
    if "auth" in st.secrets and "users" in st.secrets["auth"]:
        users = list(st.secrets["auth"]["users"])
        normalized: list[dict[str, str]] = []
        for user in users:
            username = str(user.get("username", "")).strip()
            if not username:
                continue
            password_hash = ""
            if user.get("password"):
                password_hash = hash_password(str(user["password"]).strip())
            elif user.get("password_hash"):
                raw_password_hash = str(user.get("password_hash", "")).strip()
                password_hash = (
                    raw_password_hash
                    if looks_like_sha256(raw_password_hash)
                    else hash_password(raw_password_hash)
                )
            if not password_hash:
                continue
            normalized.append(
                {
                    "username": username,
                    "password_hash": password_hash,
                    "name": str(user.get("name", username)).strip(),
                    "role": str(user.get("role", "")).strip(),
                }
            )
        if normalized:
            return normalized

    if LOCAL_USERS_PATH.exists():
        return _normalize_users(read_simple_xlsx(LOCAL_USERS_PATH))

    return []


def authenticate_user(username: str, password: str) -> dict[str, str] | None:
    username_clean = username.strip()
    if not username_clean or not password:
        return None

    password_hash = hash_password(password)
    for user in load_users():
        if user["username"] == username_clean and user["password_hash"] == password_hash:
            return user
    return None


def logout() -> None:
    st.session_state["authenticated"] = False
    st.session_state["authenticated_user"] = None
    st.rerun()


def render_login() -> bool:
    if st.session_state.get("authenticated"):
        user = st.session_state.get("authenticated_user") or {}
        display_name = user.get("name") or user.get("username") or "Usuario"
        role = user.get("role")
        role_text = f" ({role})" if role else ""
        st.sidebar.markdown(f"**Sesion iniciada como:** {display_name}{role_text}")
        if st.sidebar.button("Cerrar sesion", use_container_width=True):
            logout()
        return True

    users = load_users()
    st.markdown("## Acceso")
    st.caption("Introduce tus credenciales para entrar en la aplicacion.")

    if not users:
        st.error(
            "No hay usuarios configurados. Crea `auth/users.xlsx` con columnas `username` y `password`, o define `[auth]` en `secrets.toml`."
        )
        return False

    with st.form("login_form", clear_on_submit=False):
        username = st.text_input("Usuario")
        password = st.text_input("Contrasena", type="password")
        submitted = st.form_submit_button("Entrar", use_container_width=True)

    if submitted:
        authenticated_user = authenticate_user(username, password)
        if authenticated_user:
            st.session_state["authenticated"] = True
            st.session_state["authenticated_user"] = authenticated_user
            st.rerun()
        st.error("Usuario o contrasena incorrectos.")

    return False
