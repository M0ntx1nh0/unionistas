export const VIEWS = ["Dashboard", "Jugadores", "UScout", "Informes", "Calendario", "Campogramas", "ULab", "Rankings"] as const;

export type ViewName = (typeof VIEWS)[number];
