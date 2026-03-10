from __future__ import annotations

from typing import Any

import gspread
import pandas as pd
import streamlit as st
from google.oauth2.service_account import Credentials


GOOGLE_SHEETS_SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets.readonly",
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


def get_google_sheets_client() -> gspread.Client:
    credentials = Credentials.from_service_account_info(
        _get_service_account_info(),
        scopes=GOOGLE_SHEETS_SCOPES,
    )
    return gspread.authorize(credentials)


def read_google_sheet() -> pd.DataFrame:
    config = _get_sheet_config()
    client = get_google_sheets_client()
    workbook = client.open_by_key(config["spreadsheet_id"])
    worksheet = workbook.worksheet(config["worksheet_name"])
    rows = worksheet.get_all_records()
    return pd.DataFrame(rows)
