export const VIEWS = ["Dashboard", "Jugadores", "Informes", "Calendario", "Campogramas"] as const;

export type ViewName = (typeof VIEWS)[number];
