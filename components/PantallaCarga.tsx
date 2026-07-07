"use client";

// Logo de la app: pin de mapa con montañas (Manizales) y corazón
export function Logo({ tamano = 96 }: { tamano?: number }) {
  return (
    <svg
      width={tamano}
      height={tamano}
      viewBox="0 0 96 96"
      role="img"
      aria-label="Logo de Manizales Accesible"
    >
      <path
        d="M48 6C30 6 16 20 16 38c0 24 32 52 32 52s32-28 32-52C80 20 66 6 48 6z"
        fill="#f76707"
      />
      <circle cx="48" cy="38" r="22" fill="#fff" />
      <path d="M32 46l9-12 6 7 8-11 9 16z" fill="#099268" />
      <path
        d="M48 30c-2.5-4-9-3.2-9 1.6 0 3.6 5.4 7.4 9 9.4 3.6-2 9-5.8 9-9.4 0-4.8-6.5-5.6-9-1.6z"
        fill="#e8590c"
      />
    </svg>
  );
}

// Spinner de carga inicial con el logo animado
export function PantallaCarga({ mensaje }: { mensaje: string }) {
  return (
    <div
      className="fixed inset-0 z-[90] flex flex-col items-center justify-center gap-6 bg-fondo"
      role="status"
      aria-live="polite"
    >
      <div className="relative flex items-center justify-center">
        <div className="anillo-girando absolute h-36 w-36 rounded-full border-8 border-orange-200 border-t-cta" />
        <div className="logo-latido">
          <Logo tamano={80} />
        </div>
      </div>
      <p className="text-xl font-semibold text-gray-700 text-center px-8">{mensaje}</p>
    </div>
  );
}
