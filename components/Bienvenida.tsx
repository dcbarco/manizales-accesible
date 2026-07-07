"use client";

import Link from "next/link";
import { Logo } from "./PantallaCarga";

// Pantalla de bienvenida para visitantes sin sesión
export function Bienvenida({ onExplorar }: { onExplorar: () => void }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 px-6 py-10 bg-fondo text-center">
      <Logo tamano={110} />
      <h1 className="text-3xl font-extrabold text-tinta">Manizales Accesible</h1>
      <p className="max-w-md text-xl leading-relaxed text-gray-700">
        Reporta barreras y comparte espacios de bienestar en tu ciudad. Entre
        todos hacemos una Manizales más fácil de caminar.
      </p>

      <div className="mt-4 flex w-full max-w-md flex-col gap-4">
        <Link
          href="/registro"
          className="flex min-h-16 items-center justify-center rounded-2xl bg-cta text-white text-2xl font-bold shadow-lg active:scale-95 transition"
        >
          Crear cuenta
        </Link>
        <Link
          href="/login"
          className="flex min-h-14 items-center justify-center rounded-2xl border-4 border-tinta bg-white text-tinta text-xl font-bold active:scale-95 transition"
        >
          Ya tengo cuenta → Iniciar sesión
        </Link>
        <button
          onClick={onExplorar}
          className="min-h-12 text-lg text-gray-600 underline underline-offset-4"
        >
          Explorar sin cuenta
        </button>
      </div>
    </main>
  );
}
