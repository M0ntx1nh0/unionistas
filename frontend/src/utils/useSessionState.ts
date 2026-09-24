import { useCallback, useState } from "react";

/**
 * Como useState pero persiste el valor en sessionStorage.
 * Sobrevive desmontajes del componente por refrescos de token u otras causas.
 */
export function useSessionState<T>(key: string, initial: T): [T, (value: T | ((prev: T) => T)) => void] {
  const [state, setStateRaw] = useState<T>(() => {
    try {
      const stored = sessionStorage.getItem(key);
      return stored !== null ? (JSON.parse(stored) as T) : initial;
    } catch {
      return initial;
    }
  });

  const setState = useCallback(
    (value: T | ((prev: T) => T)) => {
      setStateRaw((prev) => {
        const next = typeof value === "function" ? (value as (p: T) => T)(prev) : value;
        try {
          sessionStorage.setItem(key, JSON.stringify(next));
        } catch {
          // sessionStorage lleno o no disponible — continuar sin persistir
        }
        return next;
      });
    },
    [key],
  );

  return [state, setState];
}
