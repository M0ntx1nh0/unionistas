from __future__ import annotations

import sys
from pathlib import Path

import pandas as pd

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src.scouting_app.auth import LOCAL_USERS_PATH, hash_password, write_simple_xlsx


def main() -> None:
    LOCAL_USERS_PATH.parent.mkdir(parents=True, exist_ok=True)

    users = pd.DataFrame(
        [
            {
                "username": "admin",
                "password": "admin123",
                "name": "Admin",
                "role": "admin",
                "active": True,
            },
            {
                "username": "scout_mikel",
                "password": "ScoutMikel2026!",
                "name": "Mikel Granda",
                "role": "scout",
                "active": True,
            },
            {
                "username": "direccion_deportiva",
                "password": "Direccion2026!",
                "name": "Direccion Deportiva",
                "role": "direccion",
                "active": True,
            },
        ]
    )

    write_simple_xlsx(LOCAL_USERS_PATH, users)
    print(f"Archivo creado en {LOCAL_USERS_PATH}")


if __name__ == "__main__":
    main()
