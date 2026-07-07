"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/AuthProvider";
import { nombreNivel } from "@/lib/gamificacion";
import type { Perfil } from "@/lib/tipos";

interface FilaRanking extends Perfil {
  insignias_usuario?: { insignia: { icono: string | null } | null }[];
}

// Tabla de clasificación: top 10 por puntos + posición del usuario
export default function PaginaRanking() {
  const { sesion, perfil } = useAuth();
  const [top, setTop] = useState<FilaRanking[]>([]);
  const [posicion, setPosicion] = useState<number | null>(null);

  useEffect(() => {
    supabase
      .from("perfiles")
      .select("*, insignias_usuario(insignia:insignias(icono))")
      .order("puntos", { ascending: false })
      .limit(10)
      .then(({ data }) => setTop((data as FilaRanking[]) ?? []));
  }, []);

  // Posición del usuario si no está en el top 10
  useEffect(() => {
    if (!perfil) return;
    supabase
      .from("perfiles")
      .select("id", { count: "exact", head: true })
      .gt("puntos", perfil.puntos)
      .then(({ count }) => setPosicion((count ?? 0) + 1));
  }, [perfil]);

  const estaEnTop = !!perfil && top.some((f) => f.id === perfil.id);
  const medallas = ["🥇", "🥈", "🥉"];

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-5 bg-fondo px-5 py-6">
      <div className="flex items-center justify-between">
        <Link
          href={sesion ? "/perfil" : "/"}
          className="flex min-h-12 items-center rounded-2xl bg-white px-4 text-lg font-bold shadow"
        >
          ← Volver
        </Link>
      </div>

      <h1 className="text-3xl font-extrabold text-center">🏆 Ranking ciudadano</h1>
      <p className="text-center text-lg text-gray-700">
        Las 10 personas que más aportan a Manizales
      </p>

      <ol className="flex flex-col gap-3">
        {top.map((fila, i) => {
          const esYo = perfil?.id === fila.id;
          const iconos = (fila.insignias_usuario ?? [])
            .map((iu) => iu.insignia?.icono)
            .filter(Boolean)
            .slice(0, 4);
          return (
            <li
              key={fila.id}
              className={`flex items-center gap-3 rounded-3xl p-4 shadow ${
                esYo ? "bg-orange-50 border-4 border-cta" : "bg-white"
              }`}
            >
              <span className="w-10 text-center text-2xl font-extrabold" aria-hidden="true">
                {medallas[i] ?? i + 1}
              </span>
              <span className="flex-1">
                <span className="block text-xl font-bold">
                  {fila.nombre_usuario}
                  {esYo && " (tú)"}
                </span>
                <span className="block text-base text-gray-600">
                  Nivel {fila.nivel} · {nombreNivel(fila.nivel)}
                  {iconos.length > 0 && (
                    <span className="ml-2" aria-label="Insignias destacadas">
                      {iconos.join(" ")}
                    </span>
                  )}
                </span>
              </span>
              <span className="text-xl font-extrabold">⭐ {fila.puntos}</span>
            </li>
          );
        })}
        {top.length === 0 && (
          <li className="rounded-3xl bg-white p-5 text-center text-lg text-gray-600 shadow">
            Aún no hay participantes. ¡Sé la primera persona en reportar!
          </li>
        )}
      </ol>

      {/* Posición del usuario si quedó fuera del top 10 */}
      {perfil && !estaEnTop && posicion !== null && (
        <div className="rounded-3xl border-4 border-cta bg-orange-50 p-4 text-center shadow">
          <p className="text-xl font-bold">
            Tu posición: #{posicion} · ⭐ {perfil.puntos} puntos
          </p>
          <p className="text-lg text-gray-700">¡Sigue reportando para subir!</p>
        </div>
      )}
    </main>
  );
}
