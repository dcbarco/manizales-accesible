"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Posicion } from "./tipos";

export type EstadoPermiso = "pidiendo" | "ok" | "denegado";

// Centro de Manizales como fallback si se niega la ubicación
export const CENTRO_MANIZALES = { lat: 5.0703, lng: -75.5138 };

// Umbral de velocidad para considerar que el usuario camina (m/s)
const UMBRAL_MOVIMIENTO = 0.5;

/**
 * Sigue la ubicación del usuario en tiempo real con watchPosition y
 * deriva si está en movimiento (para animar el avatar caminando/quieto).
 * Suaviza el estado exigiendo 2 lecturas consecutivas antes de cambiar.
 */
export function useGeolocalizacion() {
  const [posicion, setPosicion] = useState<Posicion | null>(null);
  const [enMovimiento, setEnMovimiento] = useState(false);
  const [permiso, setPermiso] = useState<EstadoPermiso>("pidiendo");
  const anteriorRef = useRef<{ lat: number; lng: number; t: number } | null>(null);
  const rachaRef = useRef(0); // lecturas consecutivas en el mismo sentido
  const watchIdRef = useRef<number | null>(null);
  const [intento, setIntento] = useState(0);

  const reintentar = useCallback(() => {
    setPermiso("pidiendo");
    setIntento((i) => i + 1);
  }, []);

  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setPermiso("denegado");
      return;
    }

    const id = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude, heading, speed } = pos.coords;
        setPermiso("ok");
        setPosicion({ lat: latitude, lng: longitude, heading, speed });

        // Velocidad: usa coords.speed si existe; si no, calcula por distancia
        let velocidad = speed ?? null;
        const ant = anteriorRef.current;
        if (velocidad === null && ant) {
          const dt = (pos.timestamp - ant.t) / 1000;
          if (dt > 0) {
            velocidad = distanciaMetros(ant.lat, ant.lng, latitude, longitude) / dt;
          }
        }
        anteriorRef.current = { lat: latitude, lng: longitude, t: pos.timestamp };

        if (velocidad !== null) {
          const moviendose = velocidad > UMBRAL_MOVIMIENTO;
          setEnMovimiento((actual) => {
            if (moviendose === actual) {
              rachaRef.current = 0;
              return actual;
            }
            // Exige 2 lecturas seguidas para cambiar (evita parpadeo)
            rachaRef.current += 1;
            if (rachaRef.current >= 2) {
              rachaRef.current = 0;
              return moviendose;
            }
            return actual;
          });
        }
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) setPermiso("denegado");
        else setPermiso((p) => (p === "ok" ? "ok" : "denegado"));
      },
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 15000 }
    );
    watchIdRef.current = id;

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, [intento]);

  return { posicion, enMovimiento, permiso, reintentar };
}

// Distancia aproximada en metros entre dos coordenadas (haversine)
export function distanciaMetros(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371000;
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLng = (lng2 - lng1) * rad;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
