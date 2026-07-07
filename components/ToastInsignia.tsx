"use client";

import type { Insignia } from "@/lib/tipos";

// Notificación celebratoria al ganar una insignia
export function ToastInsignia({
  insignia,
  onCerrar,
}: {
  insignia: Insignia;
  onCerrar: () => void;
}) {
  return (
    <div
      role="alertdialog"
      aria-label={`Ganaste la insignia ${insignia.nombre}`}
      className="fixed inset-x-0 bottom-0 z-[95] flex justify-center p-4 pointer-events-none"
    >
      <div className="aparece-abajo pointer-events-auto w-full max-w-md rounded-3xl bg-white shadow-2xl border-4 border-amber-400 p-6 text-center">
        <p className="text-5xl" aria-hidden="true">
          🎉 {insignia.icono ?? "🏅"}
        </p>
        <h2 className="mt-2 text-2xl font-bold text-amber-700">
          ¡Ganaste la insignia {insignia.nombre}!
        </h2>
        {insignia.descripcion && (
          <p className="mt-1 text-lg text-gray-700">{insignia.descripcion}</p>
        )}
        <button
          onClick={onCerrar}
          className="mt-4 w-full min-h-14 rounded-2xl bg-amber-500 text-white text-xl font-bold active:scale-95 transition"
        >
          ¡Genial!
        </button>
      </div>
    </div>
  );
}
