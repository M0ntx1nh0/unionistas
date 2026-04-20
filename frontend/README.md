# Frontend React

Aqui vivira la nueva version React de Unionistas Scouting Lab.

La app Streamlit actual se mantiene en la raiz del repo con `app.py`.

## Objetivo inicial

Primera pantalla implementada:

1. Login con Supabase Auth.
2. Lectura del perfil del usuario en `profiles`.
3. Selector de temporada.
4. Resumen inicial con conteos y próximos partidos.

## Variables esperadas

Crear un `.env.local` dentro de `frontend/`:

```bash
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

No guardar `.env.local` en Git.

## Comandos

Requiere Node.js y npm instalados.

```bash
npm install
npm run dev
```

Si no tienes Node instalado en macOS, una opcion sencilla es:

```bash
brew install node
```
