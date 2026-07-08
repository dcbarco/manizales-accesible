"use client";

import type { Reporte } from "@/lib/tipos";
import type { ReporteCercano } from "@/lib/useProximidad";
import { colorReporte, etiquetaEstado } from "@/lib/gamificacion";

interface Props {
  puntos: ReporteCercano[];
  onSeleccionar: (reporte: Reporte) => void;
  onCerrar: () => void;
}

// Tarjeta flotante que avisa de los puntos dentro de la zona de influencia.
// Invita a visitarlos para confirmar, recomendar o reportar si ya no están.
// Con un solo punto muestra una acción directa; con varios, un listado.
export function TarjetaCercania({ puntos, onSeleccionar, onCerrar }: Props) {
  if (puntos.length === 0) return null;
  const varios = puntos.length > 1;

  return (
    <div className="absolute inset-x-0 bottom-28 z-40 flex justify-center px-3">
      <div className="aparece-abajo w-full max-w-md rounded-3xl bg-white shadow-2xl">
        {/* Encabezado */}
        <div className="flex items-center justify-between gap-2 px-4 pt-4">
          <h2 className="flex items-center gap-2 text-xl font-extrabold">
            <span aria-hidden="true">📍</span>
            {varios
              ? `Tienes ${puntos.length} puntos cerca`
              : "Tienes un punto cerca"}
          </h2>
          <button
            onClick={onCerrar}
            aria-label="Cerrar aviso de cercanía"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xl font-bold text-gray-600 active:scale-95"
          >
            ✕
          </button>
        </div>

        <p className="px-4 pt-1 text-base text-gray-600">
          Ayuda corroborando: confirma, recomienda o reporta si ya no está.
        </p>

        {/* Listado de puntos (desplazable si son muchos) */}
        <ul className="mt-2 flex max-h-64 flex-col gap-2 overflow-y-auto px-3 pb-4">
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
                    <span className="text-base font-semibold text-gray-500">
                      A {Math.round(r.distancia)} m · Toca para corroborar
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
