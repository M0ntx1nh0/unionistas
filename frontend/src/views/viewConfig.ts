export const VIEWS = ["Dashboard", "Jugadores", "Equipos", "UScout", "Informes", "Calendario", "Campogramas", "ULab", "Rankings"] as const;

export type ViewName = (typeof VIEWS)[number];
