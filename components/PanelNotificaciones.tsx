"use client";

import type { Reporte } from "@/lib/tipos";
import type { ReporteCercano } from "@/lib/useProximidad";
import { colorReporte, etiquetaEstado } from "@/lib/gamificacion";

interface Props {
  puntos: ReporteCercano[];
  onSeleccionar: (reporte: Reporte) => void;
  onAbrirIntro: () => void;
  onCerrar: () => void;
}

// Panel de notificaciones (se abre con la campana). Siempre incluye un aviso
// persistente "Sobre la app" para releer la introducción, y debajo la lista de
// puntos dentro de la zona de influencia (para confirmar, recomendar o avisar).
export function PanelNotificaciones({
  puntos,
  onSeleccionar,
  onAbrirIntro,
  onCerrar,
}: Props) {
  return (
    <div className="absolute inset-x-0 bottom-28 z-40 flex justify-center px-3">
      <div className="aparece-abajo w-full max-w-md rounded-3xl bg-white shadow-2xl">
        {/* Encabezado */}
        <div className="flex items-center justify-between gap-2 px-4 pt-4">
          <h2 className="flex items-center gap-2 text-xl font-extrabold">
            <span aria-hidden="true">🔔</span> Notificaciones
          </h2>
          <button
            onClick={onCerrar}
            aria-label="Cerrar notificaciones"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xl font-bold text-gray-600 active:scale-95"
          >
            ✕
          </button>
        </div>

        <ul className="mt-2 flex max-h-72 flex-col gap-2 overflow-y-auto px-3 pb-4">
          {/* Notificación persistente: introducción de la app */}
          <li>
            <button
              onClick={onAbrirIntro}
              className="flex w-full items-center gap-3 rounded-2xl border-2 border-orange-200 bg-orange-50 p-3 text-left active:scale-[0.98] transition"
            >
              <span className="text-2xl" aria-hidden="true">ℹ️</span>
              <span className="min-w-0 flex-1">
                <span className="block text-lg font-bold">
                  ¿Qué es Manizales Accesible?
                </span>
                <span className="block text-base text-gray-600">
                  Toca para releer de qué trata la app.
                </span>
              </span>
            </button>
          </li>

          {/* Puntos cercanos */}
          {puntos.length > 0 && (
            <li className="px-1 pt-1 text-base font-bold text-gray-500">
              Cerca de ti ({puntos.length})
            </li>
          )}
          {puntos.map((r) => {
            const esBarrera = r.tipo === "barrera";
            const color = colorReporte(r.tipo, r.estado);
            return (
              <li key={r.id}>
                <button
                  onClick={() => onSeleccionar(r)}
                  className="flex w-full items-center gap-3 rounded-2xl border-2 border-gray-200 bg-gray-50 p-2 text-left active:scale-[0.98] transition"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={r.foto_url}
                    alt=""
                    className="h-14 w-14 shrink-0 rounded-xl object-cover"
                    style={{ border: `3px solid ${color}` }}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span
                        className="rounded-full px-2 py-0.5 text-sm font-bold text-white"
                        style={{ backgroundColor: color }}
                      >
                        {esBarrera ? "⚠️ Barrera" : "💚 Bienestar"}
                      </span>
                      <span className="text-sm font-semibold text-gray-500">
                        {etiquetaEstado(r.estado, r.tipo)}
                      </span>
                    </span>
                    <span className="mt-0.5 block truncate text-lg">
                      {r.descripcion}
                    </span>
                    <span className="mt-1 flex items-center gap-2">
                      {/* Distancia resaltada en píldora naranja */}
                      <span className="rounded-full bg-cta px-2.5 py-0.5 text-sm font-extrabold text-white">
                        A {Math.round(r.distancia)} m
                      </span>
                      <span className="text-base font-semibold text-gray-500">
                        Toca para corroborar
                      </span>
                    </span>
                  </span>
                </button>
              </li>
            );
          })}

          {puntos.length === 0 && (
            <li className="px-1 pb-1 pt-1 text-base text-gray-500">
              No tienes puntos cerca en este momento. Camina por la ciudad y te
              avisaremos cuando estés cerca de uno.
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}
