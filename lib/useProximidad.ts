"use client";

import { useEffect, useRef, useState } from "react";
import type { Posicion, Reporte } from "./tipos";
import { distanciaMetros } from "./useGeolocalizacion";

// Radio (metros) de la "zona de influencia" de cada punto: al entrar en él se
// considera que el usuario está lo bastante cerca para visitar/corroborar.
export const RADIO_INFLUENCIA = 45;

export interface ReporteCercano extends Reporte {
  distancia: number; // metros hasta el avatar
}

/**
 * Detecta los reportes dentro de la zona de influencia del usuario y avisa
 * cuando entran nuevos puntos (para disparar la notificación una sola vez por
 * entrada). Al salir de un punto se "olvida", de modo que si el usuario regresa
 * más tarde vuelve a notificarse.
 */
export function useProximidad(
  posicion: Posicion | null,
  reportes: Reporte[],
  radio = RADIO_INFLUENCIA
) {
  const [enZona, setEnZona] = useState<ReporteCercano[]>([]);
  // Se incrementa cada vez que entra al menos un punto nuevo a la zona
  const [entrada, setEntrada] = useState(0);
  const vistosRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!posicion) {
      setEnZona([]);
      vistosRef.current.clear();
      return;
    }

    const dentro: ReporteCercano[] = [];
    for (const r of reportes) {
      const d = distanciaMetros(posicion.lat, posicion.lng, r.latitud, r.longitud);
      if (d <= radio) dentro.push({ ...r, distancia: d });
    }
    dentro.sort((a, b) => a.distancia - b.distancia);
    setEnZona(dentro);

    const idsDentro = new Set(dentro.map((r) => r.id));
    // Olvidar los que ya salieron (permite re-notificar si vuelven)
    for (const id of [...vistosRef.current]) {
      if (!idsDentro.has(id)) vistosRef.current.delete(id);
    }
    // Detectar entradas nuevas
    let hayNuevos = false;
    for (const r of dentro) {
      if (!vistosRef.current.has(r.id)) {
        vistosRef.current.add(r.id);
        hayNuevos = true;
      }
    }
    if (hayNuevos) setEntrada((x) => x + 1);
  }, [posicion, reportes, radio]);

  return { enZona, entrada };
}
