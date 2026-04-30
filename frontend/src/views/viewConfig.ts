export const VIEWS = ["Dashboard", "Jugadores", "Informes", "Calendario", "Campogramas", "ULab"] as const;

export type ViewName = (typeof VIEWS)[number];
