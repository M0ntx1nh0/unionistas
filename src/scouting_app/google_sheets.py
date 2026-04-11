from __future__ import annotations

import re
from typing import Any
import unicodedata

import gspread
import pandas as pd
import streamlit as st
from google.oauth2.service_account import Credentials


GOOGLE_SHEETS_SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive.readonly",
]


def _get_service_account_info() -> dict[str, Any]:
    if "gcp_service_account" not in st.secrets:
        raise KeyError(
            "Falta la clave 'gcp_service_account' en .streamlit/secrets.toml."
        )
    return dict(st.secrets["gcp_service_account"])


def _get_sheet_config() -> dict[str, str]:
    if "google_sheet" not in st.secrets:
        raise KeyError("Falta la clave 'google_sheet' en .streamlit/secrets.toml.")

    config = dict(st.secrets["google_sheet"])
    required_keys = ["spreadsheet_id", "worksheet_name"]
    missing = [key for key in required_keys if not config.get(key)]
    if missing:
        raise KeyError(f"Faltan claves en google_sheet: {', '.join(missing)}")
    return config


def get_service_account_email() -> str:
    service_account_info = _get_service_account_info()
    return str(service_account_info.get("client_email", ""))


def get_google_credentials() -> Credentials:
    return Credentials.from_service_account_info(
        _get_service_account_info(),
        scopes=GOOGLE_SHEETS_SCOPES,
    )


def get_google_sheets_client() -> gspread.Client:
    return gspread.authorize(get_google_credentials())


def _clean_header_value(value: Any, index: int) -> str:
    text = str(value or "")
    text = text.replace("\n", " ")
    text = re.sub(r"\s+", " ", text).strip()
    return text or f"unnamed_{index}"


def _make_headers_unique(headers: list[str]) -> list[str]:
    counts: dict[str, int] = {}
    unique_headers: list[str] = []
    for header in headers:
        occurrence = counts.get(header, 0) + 1
        counts[header] = occurrence
        if occurrence == 1:
            unique_headers.append(header)
        else:
            unique_headers.append(f"{header}__{occurrence}")
    return unique_headers


def _normalize_worksheet_name(value: str) -> str:
    text = unicodedata.normalize("NFKD", str(value or "")).encode("ascii", "ignore").decode()
    text = text.lower().strip()
    text = re.sub(r"\s+", " ", text)
    return text


def _open_worksheet(workbook: gspread.Spreadsheet, worksheet_name: str) -> gspread.Worksheet:
    try:
        return workbook.worksheet(worksheet_name)
    except gspread.WorksheetNotFound:
        normalized_target = _normalize_worksheet_name(worksheet_name)
        for worksheet in workbook.worksheets():
            if _normalize_worksheet_name(worksheet.title) == normalized_target:
                return worksheet
        raise


def read_google_worksheet(spreadsheet_id: str, worksheet_name: str) -> pd.DataFrame:
    client = get_google_sheets_client()
    workbook = client.open_by_key(spreadsheet_id)
    worksheet = _open_worksheet(workbook, worksheet_name)
    values = worksheet.get_all_values()
    if not values:
        return pd.DataFrame()

    raw_headers = values[0]
    headers = _make_headers_unique(
        [_clean_header_value(header, index + 1) for index, header in enumerate(raw_headers)]
    )

    normalized_rows: list[list[str]] = []
    width = len(headers)
    for row in values[1:]:
        padded_row = row[:width] + [""] * max(0, width - len(row))
        if not any(str(cell).strip() for cell in padded_row):
            continue
        normalized_rows.append(padded_row)

    return pd.DataFrame(normalized_rows, columns=headers)


def write_google_worksheet(spreadsheet_id: str, worksheet_name: str, df: pd.DataFrame) -> None:
    client = get_google_sheets_client()
    workbook = client.open_by_key(spreadsheet_id)
    worksheet = _open_worksheet(workbook, worksheet_name)
    rows = [df.columns.astype(str).tolist()]
    if not df.empty:
        rows.extend(df.fillna("").astype(str).values.tolist())
    worksheet.clear()
    worksheet.update("A1", rows)


def read_google_sheet() -> pd.DataFrame:
    config = _get_sheet_config()
    return read_google_worksheet(config["spreadsheet_id"], config["worksheet_name"])
