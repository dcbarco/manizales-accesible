"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/AuthProvider";
import { PantallaCarga } from "@/components/PantallaCarga";
import { infoNivel } from "@/lib/gamificacion";
import type { Insignia, Reporte } from "@/lib/tipos";

// Perfil del usuario: nivel, puntos, insignias, contadores e historial
export default function PaginaPerfil() {
  const { sesion, perfil, cargando, cerrarSesion } = useAuth();
  const router = useRouter();
  const [insignias, setInsignias] = useState<Insignia[]>([]);
  const [obtenidas, setObtenidas] = useState<Set<string>>(new Set());
  const [historial, setHistorial] = useState<Reporte[]>([]);

  useEffect(() => {
    if (!cargando && !sesion) router.replace("/login");
  }, [cargando, sesion, router]);

  useEffect(() => {
    if (!sesion) return;
    // Catálogo completo + insignias del usuario + historial de reportes
    supabase
      .from("insignias")
      .select("*")
      .then(({ data }) => setInsignias((data as Insignia[]) ?? []));
    supabase
      .from("insignias_usuario")
      .select("insignia_id")
      .eq("usuario_id", sesion.user.id)
      .then(({ data }) =>
        setObtenidas(new Set((data ?? []).map((d) => d.insignia_id as string)))
      );
    supabase
      .from("reportes")
      .select("*")
      .eq("usuario_id", sesion.user.id)
      .order("creado_en", { ascending: false })
      .then(({ data }) => setHistorial((data as Reporte[]) ?? []));
  }, [sesion]);

  if (cargando || !perfil) {
    return <PantallaCarga mensaje="Cargando tu perfil…" />;
  }

  const { actual, siguiente, progreso } = infoNivel(perfil.puntos);

  // Baja suavemente hasta la sección "Mis reportes" dentro de la misma tarjeta
  function irAMisReportes() {
    document
      .getElementById("mis-reportes")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-5 bg-fondo px-5 py-6">
      <div className="flex items-center justify-between">
        <Link
          href="/"
          className="flex min-h-12 items-center rounded-2xl bg-white px-4 text-lg font-bold shadow"
        >
          ← Volver al mapa
        </Link>
        <Link
          href="/ranking"
          className="flex min-h-12 items-center rounded-2xl bg-tinta px-4 text-lg font-bold text-white shadow"
        >
          🏆 Ranking
        </Link>
      </div>

      {/* Acceso al panel de administración (solo admins) */}
      {perfil.es_admin && (
        <Link
          href="/admin"
          className="flex min-h-14 items-center justify-center rounded-2xl bg-tinta text-lg font-bold text-white shadow active:scale-95 transition"
        >
          🛠️ Panel de administración
        </Link>
      )}

      {/* Cabecera del perfil */}
      <section className="rounded-3xl bg-white p-5 shadow" aria-label="Tu nivel y puntos">
        <div className="flex items-center gap-4">
          {perfil.avatar_url ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={perfil.avatar_url}
              alt=""
              className="h-20 w-20 rounded-full object-cover"
            />
          ) : (
            <span
              className="flex h-20 w-20 items-center justify-center rounded-full bg-orange-100 text-4xl"
              aria-hidden="true"
            >
              👤
            </span>
          )}
          <div>
            <h1 className="text-2xl font-extrabold">{perfil.nombre_usuario}</h1>
            <p className="text-lg text-gray-700">
              Nivel {actual.nivel} · <strong>{actual.nombre}</strong>
            </p>
          </div>
        </div>

        <p className="mt-4 text-xl font-bold">⭐ {perfil.puntos} puntos</p>
        <div
          className="mt-2 h-5 w-full overflow-hidden rounded-full bg-gray-200"
          role="progressbar"
          aria-valuenow={progreso}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={
            siguiente
              ? `Progreso hacia el nivel ${siguiente.nombre}`
              : "Nivel máximo alcanzado"
          }
        >
          <div
            className="h-full rounded-full bg-cta transition-all"
            style={{ width: `${progreso}%` }}
          />
        </div>
        <p className="mt-1 text-base text-gray-600">
          {siguiente
            ? `${siguiente.puntos - perfil.puntos} puntos para ser ${siguiente.nombre}`
            : "¡Alcanzaste el nivel máximo: Héroe Ciudadano!"}
        </p>

        {/* Contadores: botones (con gradiente) que bajan a "Mis reportes" */}
        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          <button
            onClick={irAMisReportes}
            aria-label={`${perfil.reportes_total} reportes. Ver mis reportes`}
            className="rounded-2xl bg-gradient-to-b from-orange-400 to-orange-600 p-3 text-white shadow active:scale-95 transition"
          >
            <p className="text-2xl font-extrabold leading-none">{perfil.reportes_total}</p>
            <p className="mt-1 text-xs font-semibold">Reportes</p>
          </button>
          <button
            onClick={irAMisReportes}
            aria-label={`${perfil.votos_total} votos. Ver mis reportes`}
            className="rounded-2xl bg-gradient-to-b from-slate-500 to-slate-700 p-3 text-white shadow active:scale-95 transition"
          >
            <p className="text-2xl font-extrabold leading-none">{perfil.votos_total}</p>
            <p className="mt-1 text-xs font-semibold">Votos</p>
          </button>
          <button
            onClick={irAMisReportes}
            aria-label={`${perfil.comentarios_total} comentarios. Ver mis reportes`}
            className="rounded-2xl bg-gradient-to-b from-emerald-500 to-emerald-700 p-3 text-white shadow active:scale-95 transition"
          >
            <p className="text-2xl font-extrabold leading-none">{perfil.comentarios_total}</p>
            <p className="mt-1 text-xs font-semibold">Comentarios</p>
          </button>
        </div>
      </section>

      {/* Insignias: obtenidas a color, pendientes en gris */}
      <section className="rounded-3xl bg-white p-5 shadow" aria-label="Tus insignias">
        <h2 className="text-xl font-bold">Insignias</h2>
        <ul className="mt-3 grid grid-cols-2 gap-3">
          {insignias.map((ins) => {
            const tiene = obtenidas.has(ins.id);
            return (
              <li
                key={ins.id}
                className={`rounded-2xl border-2 p-3 text-center ${
                  tiene
                    ? "border-amber-400 bg-amber-50"
                    : "border-gray-200 bg-gray-100 opacity-60 grayscale"
                }`}
              >
                <p className="text-3xl" aria-hidden="true">
                  {ins.icono ?? "🏅"}
                </p>
                <p className="text-base font-bold">{ins.nombre}</p>
                <p className="text-sm text-gray-600">{ins.descripcion}</p>
                <p className="sr-only">{tiene ? "Obtenida" : "Bloqueada"}</p>
              </li>
            );
          })}
        </ul>
      </section>

      {/* Historial de reportes propios */}
      <section
        id="mis-reportes"
        className="scroll-mt-4 rounded-3xl bg-white p-5 shadow"
        aria-label="Tus reportes"
      >
        <h2 className="text-xl font-bold">Mis reportes ({historial.length})</h2>
        <ul className="mt-3 flex flex-col gap-2">
          {historial.map((r) => (
            <li key={r.id}>
              <Link
                href={`/?r=${r.id}`}
                className="flex min-h-16 items-center gap-3 rounded-2xl border-2 border-gray-200 p-2"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={r.foto_url}
                  alt=""
                  className="h-14 w-14 rounded-xl object-cover"
                />
                <span className="flex-1">
                  <span
                    className={`text-base font-bold ${
                      r.tipo === "barrera" ? "text-barrera-oscuro" : "text-bienestar-oscuro"
                    }`}
                  >
                    {r.tipo === "barrera" ? "⚠️ Barrera" : "💚 Bienestar"}
                  </span>
                  <span className="block text-base text-gray-700 line-clamp-1">
                    {r.descripcion}
                  </span>
                </span>
                <span aria-hidden="true" className="text-xl text-gray-400">
                  ›
                </span>
              </Link>
            </li>
          ))}
          {historial.length === 0 && (
            <li className="text-lg text-gray-600">
              Todavía no has creado reportes. ¡Anímate con el primero!
            </li>
          )}
        </ul>
      </section>

      <button
        onClick={async () => {
          await cerrarSesion();
          router.push("/");
        }}
        className="min-h-14 rounded-2xl bg-cta text-xl font-bold text-white shadow active:scale-95 transition"
      >
        Cerrar sesión
      </button>
    </main>
  );
}
