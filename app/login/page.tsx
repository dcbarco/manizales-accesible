"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Logo } from "@/components/PantallaCarga";

export default function PaginaLogin() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [clave, setClave] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function iniciarSesion(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setOcupado(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password: clave,
    });
    setOcupado(false);
    if (error) {
      setError(
        error.message.includes("Invalid login credentials")
          ? "Correo o contraseña incorrectos. Revisa e intenta de nuevo."
          : "No pudimos iniciar sesión. Intenta de nuevo."
      );
      return;
    }
    router.push("/");
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-5 bg-fondo px-6 py-10">
      <Logo tamano={80} />
      <h1 className="text-3xl font-extrabold">Iniciar sesión</h1>

      <form onSubmit={iniciarSesion} className="flex w-full max-w-md flex-col gap-4">
        <label htmlFor="email" className="text-lg font-semibold -mb-2">
          Correo electrónico
        </label>
        <input
          id="email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="min-h-14 rounded-2xl border-2 border-gray-300 bg-white px-4 text-xl"
        />

        <label htmlFor="clave" className="text-lg font-semibold -mb-2">
          Contraseña
        </label>
        <input
          id="clave"
          type="password"
          required
          autoComplete="current-password"
          value={clave}
          onChange={(e) => setClave(e.target.value)}
          className="min-h-14 rounded-2xl border-2 border-gray-300 bg-white px-4 text-xl"
        />

        {error && (
          <p role="alert" className="rounded-xl bg-red-100 p-3 text-lg text-red-800">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={ocupado}
          className="min-h-16 rounded-2xl bg-cta text-2xl font-bold text-white shadow-lg active:scale-95 transition disabled:opacity-60"
        >
          {ocupado ? "Entrando…" : "Entrar"}
        </button>
      </form>

      <p className="text-lg text-gray-700">
        ¿No tienes cuenta?{" "}
        <Link href="/registro" className="font-bold underline">
          Crear cuenta
        </Link>
      </p>
      <Link href="/" className="text-lg text-gray-600 underline underline-offset-4">
        ← Volver al inicio
      </Link>

      {/* Créditos del equipo desarrollador, en letra muy pequeña */}
      <p className="mt-4 max-w-xs text-center text-xs leading-snug text-gray-400">
        Desarrollado por el equipo del Centro de Ciencia Francisco José de Caldas
      </p>
    </main>
  );
}
