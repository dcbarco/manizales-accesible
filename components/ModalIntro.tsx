"use client";

import { Logo } from "./PantallaCarga";

interface Props {
  onCerrar: () => void;
  onReportar?: () => void;
}

// Modal de inicio: explica brevemente de qué trata la app y su finalidad.
// Aparece la primera vez y queda accesible desde la campana de notificaciones.
export function ModalIntro({ onCerrar, onReportar }: Props) {
  return (
    <div
      className="fixed inset-0 z-[95] flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="titulo-intro"
      onClick={onCerrar}
    >
      <div
        className="aparece-abajo relative w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cierre rápido con "X" */}
        <button
          onClick={onCerrar}
          aria-label="Cerrar"
          className="absolute right-3 top-3 flex h-11 w-11 items-center justify-center rounded-full bg-gray-100 text-2xl font-bold text-gray-600 active:scale-95"
        >
          ✕
        </button>

        <div className="flex flex-col items-center text-center">
          <Logo tamano={84} />
          <h2 id="titulo-intro" className="mt-3 text-2xl font-extrabold">
            Bienvenido a Manizales Accesible
          </h2>
          <p className="mt-3 text-lg leading-relaxed text-gray-700">
            Esta app te permite <strong>reportar barreras urbanas</strong> (huecos,
            andenes rotos, obstáculos) y <strong>compartir espacios de bienestar</strong>
            {" "}en Manizales. Entre todos hacemos una ciudad más fácil de caminar
            para todas las personas.
          </p>
          <p className="mt-3 text-lg leading-relaxed text-gray-700">
            Cuando pases cerca de un punto, la app te avisará para que puedas
            <strong> confirmarlo, recomendarlo o avisar si ya no está</strong>.
          </p>
        </div>

        {/* Acción principal */}
        <button
          onClick={() => {
            onCerrar();
            onReportar?.();
          }}
          className="mt-6 w-full min-h-16 rounded-2xl bg-cta text-2xl font-bold text-white shadow-lg active:scale-95 transition"
        >
          📷 Crear mi primer reporte
        </button>
        <button
          onClick={onCerrar}
          className="mt-2 w-full min-h-12 text-lg text-gray-600 underline underline-offset-4"
        >
          Explorar el mapa primero
        </button>
      </div>
    </div>
  );
}
