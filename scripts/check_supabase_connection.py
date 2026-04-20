"""Comprueba la conexion local con Supabase usando el archivo .env."""

from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv
from supabase import create_client


PROJECT_ROOT = Path(__file__).resolve().parents[1]


def main() -> None:
    load_dotenv(PROJECT_ROOT / ".env")

    supabase_url = os.getenv("SUPABASE_URL")
    service_role_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

    if not supabase_url:
        raise RuntimeError("Falta SUPABASE_URL en .env")
    if not service_role_key:
        raise RuntimeError("Falta SUPABASE_SERVICE_ROLE_KEY en .env")
    if service_role_key == "tu_service_role_key":
        raise RuntimeError("SUPABASE_SERVICE_ROLE_KEY sigue con el placeholder.")

    client = create_client(supabase_url, service_role_key)
    response = client.table("seasons").select("id,label,starts_on,ends_on,active").execute()

    seasons = response.data or []
    print("Conexion Supabase OK")
    print(f"Temporadas encontradas: {len(seasons)}")
    for season in seasons:
        print(
            f"- {season.get('label')} | "
            f"{season.get('starts_on')} -> {season.get('ends_on')} | "
            f"active={season.get('active')}"
        )


if __name__ == "__main__":
    main()
