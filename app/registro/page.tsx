"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Logo } from "@/components/PantallaCarga";

export default function PaginaRegistro() {
  const router = useRouter();
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [clave, setClave] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function registrarse(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setOcupado(true);

    // El trigger de la base de datos crea el perfil con este nombre
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password: clave,
      options: { data: { nombre_usuario: nombre.trim() } },
    });
    setOcupado(false);

    if (error) {
      setError(
        error.message.includes("already registered")
          ? "Este correo ya tiene una cuenta. Intenta iniciar sesión."
          : error.message.includes("Password")
            ? "La contraseña debe tener al menos 6 caracteres."
            : "No pudimos crear tu cuenta. Intenta de nuevo."
      );
      return;
    }

    // Si el proyecto exige confirmar el correo, no hay sesión todavía
    if (!data.session) {
      setAviso(
        "Te enviamos un correo de confirmación. Ábrelo y luego inicia sesión."
      );
      return;
    }
    router.push("/");
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-5 bg-fondo px-6 py-10">
      <Logo tamano={80} />
      <h1 className="text-3xl font-extrabold">Crear cuenta</h1>

      <form onSubmit={registrarse} className="flex w-full max-w-md flex-col gap-4">
        <label htmlFor="nombre" className="text-lg font-semibold -mb-2">
          Tu nombre de usuario (público)
        </label>
        <input
          id="nombre"
          type="text"
          required
          minLength={3}
          maxLength={30}
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="Ej: maria_caldas"
          className="min-h-14 rounded-2xl border-2 border-gray-300 bg-white px-4 text-xl"
        />

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
          Contraseña (mínimo 6 caracteres)
        </label>
        <input
          id="clave"
          type="password"
          required
          minLength={6}
          autoComplete="new-password"
          value={clave}
          onChange={(e) => setClave(e.target.value)}
          className="min-h-14 rounded-2xl border-2 border-gray-300 bg-white px-4 text-xl"
        />

        {error && (
          <p role="alert" className="rounded-xl bg-red-100 p-3 text-lg text-red-800">
            {error}
          </p>
        )}
        {aviso && (
          <p role="status" className="rounded-xl bg-green-100 p-3 text-lg text-green-900">
            {aviso}
          </p>
        )}

        <button
          type="submit"
          disabled={ocupado}
          className="min-h-16 rounded-2xl bg-cta text-2xl font-bold text-white shadow-lg active:scale-95 transition disabled:opacity-60"
        >
          {ocupado ? "Creando cuenta…" : "Crear mi cuenta"}
        </button>
      </form>

      <p className="text-lg text-gray-700">
        ¿Ya tienes cuenta?{" "}
        <Link href="/login" className="font-bold underline">
          Iniciar sesión
        </Link>
      </p>
      <Link href="/" className="text-lg text-gray-600 underline underline-offset-4">
        ← Volver al inicio
      </Link>
    </main>
  );
}
