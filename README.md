# Unionistas Scouting

Aplicacion en Streamlit para consultar informes de scouting almacenados en Google Sheets.

## 1. Crear entorno

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## 2. Configurar Google Sheets

1. Crea una `service account` en Google Cloud.
2. Activa las APIs de Google Sheets y Google Drive.
3. Comparte la hoja con el correo de la `service account`.
4. Copia `.streamlit/secrets.toml.example` a `.streamlit/secrets.toml`.
5. Rellena:
   - `spreadsheet_id`: el ID de la URL de tu hoja.
   - `worksheet_name`: la pestaña exacta donde llegan las respuestas.
   - `gcp_service_account`: las credenciales JSON de la cuenta de servicio.

## 3. Configurar acceso

La app ahora exige login.

### Opcion A. Local con Excel ignorado por Git

Genera el archivo local:

```bash
python scripts/create_users_excel.py
```

Esto crea `.auth/users.xlsx`, que esta ignorado en Git.
Esto crea `auth/users.xlsx`, que esta ignorado en Git pero visible en tu carpeta local.

Columnas soportadas:

- `username`
- `password`
- `name`
- `role`
- `active`

### Opcion B. Streamlit Cloud con secrets

En `.streamlit/secrets.toml` puedes definir:

```toml
[auth]

[[auth.users]]
username = "admin_unionistas"
password = "tu_password"
name = "Admin Unionistas"
role = "admin"

[[auth.users]]
username = "scout_mikel"
password = "tu_password"
name = "Mikel Granda"
role = "scout"

[[auth.users]]
username = "direccion_deportiva"
password = "tu_password"
name = "Direccion Deportiva"
role = "direccion"
```

## 4. Ejecutar la app

```bash
streamlit run app.py
```

## 5. Que incluye esta v1

- Dashboard con metricas principales.
- Filtros por jugador, ojeador, demarcacion, equipo, competicion y veredicto.
- Ficha individual de jugador con ultimo informe e historico.
- Tabla completa de informes.
- Login con usuarios desde Excel local o `secrets.toml`.
