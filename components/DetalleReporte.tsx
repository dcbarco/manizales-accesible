"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useAuth } from "./AuthProvider";
import type { Comentario, Reporte } from "@/lib/tipos";
import {
  colorReporte,
  etiquetaEstado,
  nombreNivel,
  opcionesVoto,
} from "@/lib/gamificacion";

interface Props {
  reporte: Reporte;
  onCerrar: () => void;
  onActualizar: (reporte: Reporte) => void;
}

// Hoja de detalle de un reporte: foto, autor, estado, corroboración
// estilo Waze (3 botones según tipo) y comentarios en tiempo real.
export function DetalleReporte({ reporte, onCerrar, onActualizar }: Props) {
  const { sesion, avisarAccion } = useAuth();
  const [comentarios, setComentarios] = useState<Comentario[]>([]);
  const [texto, setTexto] = useState("");
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [fotoAmpliada, setFotoAmpliada] = useState(false);

  const esBarrera = reporte.tipo === "barrera";
  const color = colorReporte(reporte.tipo, reporte.estado);

  const cargarComentarios = useCallback(async () => {
    const { data } = await supabase
      .from("comentarios")
      .select("*, perfil:perfiles(nombre_usuario, nivel)")
      .eq("reporte_id", reporte.id)
      .order("creado_en", { ascending: true });
    setComentarios((data as Comentario[]) ?? []);
  }, [reporte.id]);

  const recargarReporte = useCallback(async () => {
    const { data } = await supabase
      .from("reportes")
      .select("*, perfil:perfiles(nombre_usuario, nivel)")
      .eq("id", reporte.id)
      .single();
    if (data) onActualizar(data as Reporte);
  }, [reporte.id, onActualizar]);

  // Comentarios y cambios del reporte en tiempo real (Supabase Realtime)
  useEffect(() => {
    cargarComentarios();
    const canal = supabase
      .channel(`detalle-${reporte.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "comentarios",
          filter: `reporte_id=eq.${reporte.id}`,
        },
        () => cargarComentarios()
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "reportes",
          filter: `id=eq.${reporte.id}`,
        },
        () => recargarReporte()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(canal);
    };
  }, [reporte.id, cargarComentarios, recargarReporte]);

  async function votar(tipoVoto: string) {
    if (!sesion) return;
    setOcupado(true);
    setMensaje(null);
    const { error } = await supabase.from("votos_reporte").insert({
      reporte_id: reporte.id,
      usuario_id: sesion.user.id,
      tipo: tipoVoto,
    });
    if (error) {
      // 23505 = violación de UNIQUE: ya votó este reporte
      setMensaje(
        error.code === "23505"
          ? "Ya corroboraste este reporte. ¡Gracias!"
          : "No pudimos registrar tu voto. Intenta de nuevo."
      );
    } else {
      setMensaje("¡Gracias por corroborar! +2 puntos");
      await recargarReporte();
      await avisarAccion();
    }
    setOcupado(false);
  }

  async function comentar() {
    if (!sesion || !texto.trim()) return;
    setOcupado(true);
    const { error } = await supabase.from("comentarios").insert({
      reporte_id: reporte.id,
      usuario_id: sesion.user.id,
      texto: texto.trim(),
    });
    if (!error) {
      setTexto("");
      await cargarComentarios();
      await avisarAccion();
    }
    setOcupado(false);
  }

  const autor = reporte.anonimo
    ? "Anónimo"
    : reporte.perfil?.nombre_usuario ?? "Ciudadano";

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-label={`Detalle del reporte: ${esBarrera ? "barrera" : "espacio de bienestar"}`}
      onClick={onCerrar}
    >
      <div
        className="aparece-abajo w-full max-w-md max-h-[88dvh] overflow-y-auto rounded-t-3xl bg-white"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Foto (ampliable) */}
        <button
          onClick={() => setFotoAmpliada(true)}
          className="relative block w-full"
          aria-label="Ampliar la foto del reporte"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={reporte.foto_url}
            alt={`Foto del reporte: ${reporte.descripcion.slice(0, 80)}`}
            className="h-52 w-full rounded-t-3xl object-cover"
          />
          <span
            className="absolute left-3 top-3 rounded-full px-4 py-1.5 text-lg font-bold text-white"
            style={{ backgroundColor: color }}
          >
            {esBarrera ? "⚠️ Barrera" : "💚 Espacio de bienestar"}
          </span>
        </button>

        <div className="flex flex-col gap-4 p-5">
          {/* Autor y estado */}
          <div className="flex items-center justify-between gap-2">
            <p className="text-lg">
              <strong>{autor}</strong>
              {!reporte.anonimo && reporte.perfil && (
                <span className="block text-base text-gray-600">
                  Nivel {reporte.perfil.nivel} · {nombreNivel(reporte.perfil.nivel)}
                </span>
              )}
            </p>
            <span
              className="rounded-full border-2 px-3 py-1 text-base font-bold"
              style={{ borderColor: color, color }}
            >
              {etiquetaEstado(reporte.estado, reporte.tipo)}
            </span>
          </div>

          <p className="text-lg leading-relaxed">{reporte.descripcion}</p>
          {reporte.direccion_texto && (
            <p className="text-lg text-gray-700">📍 {reporte.direccion_texto}</p>
          )}

          {/* Corroboración: 3 botones contextuales según el tipo */}
          <div>
            <h3 className="text-lg font-bold">¿Pasaste por aquí? Corrobora:</h3>
            {sesion ? (
              <div className="mt-2 grid grid-cols-3 gap-2">
                {opcionesVoto(reporte.tipo).map((op) => (
                  <button
                    key={op.valor}
                    onClick={() => votar(op.valor)}
                    disabled={ocupado}
                    className="flex min-h-16 flex-col items-center justify-center rounded-2xl border-2 border-gray-300 bg-gray-50 px-1 text-base font-semibold active:scale-95 transition disabled:opacity-50"
                  >
                    <span className="text-2xl" aria-hidden="true">
                      {op.icono}
                    </span>
                    {op.texto}
                  </button>
                ))}
              </div>
            ) : (
              <p className="mt-2 rounded-xl bg-gray-100 p-3 text-lg">
                <Link href="/login" className="font-bold underline">
                  Inicia sesión
                </Link>{" "}
                para corroborar este reporte.
              </p>
            )}
            {mensaje && (
              <p role="status" className="mt-2 rounded-xl bg-blue-50 p-3 text-lg">
                {mensaje}
              </p>
            )}
            {/* Contadores de votos */}
            <div className="mt-3 flex flex-wrap gap-3 text-base text-gray-700">
              <span>✅ Confirmado: {reporte.conteo_confirmado}</span>
              <span>
                {esBarrera ? "⚠️ Sigue ahí" : "💚 Recomendado"}:{" "}
                {reporte.conteo_persiste}
              </span>
              <span>
                {esBarrera ? "✔️ Resuelto" : "❌ Ya no está"}:{" "}
                {reporte.conteo_resuelto}
              </span>
            </div>
          </div>

          {/* Comentarios */}
          <div>
            <h3 className="text-lg font-bold">
              Comentarios ({comentarios.length})
            </h3>
            <ul className="mt-2 flex flex-col gap-2">
              {comentarios.map((c) => (
                <li key={c.id} className="rounded-xl bg-gray-100 p-3">
                  <p className="text-base font-bold">
                    {c.perfil?.nombre_usuario ?? "Ciudadano"}{" "}
                    <span className="font-normal text-gray-600">
                      · Nivel {c.perfil?.nivel ?? 1}
                    </span>
                  </p>
                  <p className="text-lg">{c.texto}</p>
                </li>
              ))}
              {comentarios.length === 0 && (
                <li className="text-lg text-gray-600">
                  Aún no hay comentarios. ¡Sé la primera persona en opinar!
                </li>
              )}
            </ul>
            {sesion ? (
              <div className="mt-3 flex gap-2">
                <label htmlFor="nuevo-comentario" className="sr-only">
                  Escribe un comentario
                </label>
                <input
                  id="nuevo-comentario"
                  type="text"
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                  placeholder="Escribe un comentario…"
                  className="min-h-14 flex-1 rounded-xl border-2 border-gray-300 px-3 text-lg"
                />
                <button
                  onClick={comentar}
                  disabled={ocupado || !texto.trim()}
                  className="min-h-14 rounded-xl bg-tinta px-5 text-lg font-bold text-white active:scale-95 transition disabled:opacity-50"
                >
                  Enviar
                </button>
              </div>
            ) : (
              <p className="mt-3 text-lg text-gray-600">
                <Link href="/login" className="font-bold underline">
                  Inicia sesión
                </Link>{" "}
                para comentar.
              </p>
            )}
          </div>

          <button
            onClick={onCerrar}
            className="min-h-14 rounded-2xl border-4 border-gray-400 text-xl font-bold active:scale-95 transition"
          >
            Cerrar
          </button>
        </div>
      </div>

      {/* Foto en pantalla completa */}
      {fotoAmpliada && (
        <button
          className="fixed inset-0 z-[75] flex items-center justify-center bg-black/90 p-2"
          onClick={(e) => {
            e.stopPropagation();
            setFotoAmpliada(false);
          }}
          aria-label="Cerrar la foto ampliada"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={reporte.foto_url}
            alt={`Foto ampliada del reporte`}
            className="max-h-full max-w-full rounded-xl object-contain"
          />
        </button>
      )}
    </div>
  );
}
