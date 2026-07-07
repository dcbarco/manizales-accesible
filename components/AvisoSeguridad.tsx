"use client";

// Aviso de seguridad obligatorio: la app NO detecta tráfico, obstáculos
// ni eventos imprevistos. Se muestra una vez y queda accesible después.
export function AvisoSeguridad({ onCerrar }: { onCerrar: () => void }) {
  return (
    <div
      className="fixed inset-0 z-[85] flex items-end sm:items-center justify-center bg-black/60 p-4"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="titulo-aviso"
    >
      <div className="aparece-abajo w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
        <p className="text-5xl text-center" aria-hidden="true">
          ⚠️
        </p>
        <h2 id="titulo-aviso" className="mt-2 text-2xl font-bold text-center">
          Tu seguridad primero
        </h2>
        <p className="mt-3 text-lg leading-relaxed text-gray-800">
          Mantente atento a tu entorno real. Esta app <strong>no detecta autos,
          peligros ni eventos imprevistos</strong>. Camina con precaución y evita
          usarla mientras cruzas la calle.
        </p>
        <button
          onClick={onCerrar}
          className="mt-5 w-full min-h-14 rounded-2xl bg-tinta text-white text-xl font-bold active:scale-95 transition"
        >
          Entendido
        </button>
      </div>
    </div>
  );
}
