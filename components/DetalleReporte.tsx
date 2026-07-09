"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { comprimirImagen } from "@/lib/imagen";
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
  onEliminar: (id: string) => void;
}

// Hoja de detalle de un reporte: foto, autor, estado, corroboración
// estilo Waze (3 botones según tipo) y comentarios en tiempo real.
export function DetalleReporte({ reporte, onCerrar, onActualizar, onEliminar }: Props) {
  const { sesion, avisarAccion } = useAuth();
  const [comentarios, setComentarios] = useState<Comentario[]>([]);
  const [texto, setTexto] = useState("");
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [fotoAmpliada, setFotoAmpliada] = useState(false);
  const [editando, setEditando] = useState(false);
  const [textoEdicion, setTextoEdicion] = useState(reporte.descripcion);
  const [nuevaFoto, setNuevaFoto] = useState<File | null>(null);
  const [previaFoto, setPreviaFoto] = useState<string | null>(null);
  const inputFotoRef = useRef<HTMLInputElement>(null);

  const esBarrera = reporte.tipo === "barrera";
  const color = colorReporte(reporte.tipo, reporte.estado);
  // ¿El reporte es del usuario que lo está viendo? (puede editarlo/borrarlo)
  const esAutor = !!sesion && sesion.user.id === reporte.usuario_id;

  // Selección de una nueva foto (cámara o galería)
  function alElegirFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (previaFoto) URL.revokeObjectURL(previaFoto);
    setNuevaFoto(f);
    setPreviaFoto(URL.createObjectURL(f));
    e.target.value = ""; // permite volver a elegir la misma
  }

  function cancelarEdicion() {
    setTextoEdicion(reporte.descripcion);
    if (previaFoto) URL.revokeObjectURL(previaFoto);
    setNuevaFoto(null);
    setPreviaFoto(null);
    setEditando(false);
  }

  // Guardar la edición: descripción y/o nueva foto del propio reporte
  async function guardarEdicion() {
    const nueva = textoEdicion.trim();
    const cambios: { descripcion?: string; foto_url?: string } = {};
    if (nueva && nueva !== reporte.descripcion) cambios.descripcion = nueva;

    if (!nueva) {
      setMensaje("La descripción no puede quedar vacía.");
      return;
    }
    setOcupado(true);
    try {
      // Si hay foto nueva: comprimir y subir al bucket fotos-reportes
      if (nuevaFoto && sesion) {
        const blob = await comprimirImagen(nuevaFoto);
        const ruta = `${sesion.user.id}/${Date.now()}.jpg`;
        const { error: errSubida } = await supabase.storage
          .from("fotos-reportes")
          .upload(ruta, blob, { contentType: "image/jpeg" });
        if (errSubida) throw errSubida;
        cambios.foto_url = supabase.storage
          .from("fotos-reportes")
          .getPublicUrl(ruta).data.publicUrl;
      }

      if (Object.keys(cambios).length === 0) {
        cancelarEdicion();
        return;
      }

      const { error } = await supabase
        .from("reportes")
        .update(cambios)
        .eq("id", reporte.id);
      if (error) throw error;

      onActualizar({ ...reporte, ...cambios });
      if (previaFoto) URL.revokeObjectURL(previaFoto);
      setNuevaFoto(null);
      setPreviaFoto(null);
      setEditando(false);
    } catch {
      setMensaje("No pudimos guardar los cambios. Intenta de nuevo.");
    } finally {
      setOcupado(false);
    }
  }

  // Borrar el propio reporte
  async function borrarReporte() {
    if (!confirm("¿Seguro que quieres borrar este reporte? No se puede deshacer.")) {
      return;
    }
    setOcupado(true);
    const { error } = await supabase.from("reportes").delete().eq("id", reporte.id);
    setOcupado(false);
    if (error) {
      setMensaje("No pudimos borrar el reporte. Intenta de nuevo.");
      return;
    }
    onEliminar(reporte.id);
  }

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
        className="aparece-abajo relative w-full max-w-md max-h-[88dvh] overflow-y-auto rounded-t-3xl bg-white"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cierre rápido con "X" (segundo método, junto al botón "Cerrar") */}
        <button
          onClick={onCerrar}
          aria-label="Cerrar"
          className="absolute right-3 top-3 z-20 flex h-11 w-11 items-center justify-center rounded-full bg-black/55 text-2xl font-bold text-white active:scale-95"
        >
          ✕
        </button>

        {/* Foto (ampliable) */}
        <button
          onClick={() => setFotoAmpliada(true)}
          className="relative block w-full"
          aria-label="Ampliar la foto del reporte"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={previaFoto ?? reporte.foto_url}
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

          {editando ? (
            <div className="flex flex-col gap-2">
              {/* Input de cámara/galería (oculto) para cambiar la foto */}
              <input
                ref={inputFotoRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={alElegirFoto}
                aria-hidden="true"
                tabIndex={-1}
              />
              <button
                onClick={() => inputFotoRef.current?.click()}
                disabled={ocupado}
                className="min-h-12 rounded-xl border-2 border-gray-400 bg-white text-lg font-bold active:scale-95 disabled:opacity-50"
              >
                📷 {nuevaFoto ? "Tomar otra foto" : "Cambiar foto"}
              </button>
              {nuevaFoto && (
                <p className="text-base font-semibold text-bienestar-oscuro">
                  ✓ Nueva foto lista. Guarda para aplicar los cambios.
                </p>
              )}

              <label htmlFor="editar-desc" className="sr-only">
                Editar descripción
              </label>
              <textarea
                id="editar-desc"
                value={textoEdicion}
                onChange={(e) => setTextoEdicion(e.target.value)}
                rows={3}
                className="w-full rounded-xl border-2 border-gray-300 p-3 text-lg"
              />
              <div className="flex gap-2">
                <button
                  onClick={guardarEdicion}
                  disabled={ocupado}
                  className="min-h-12 flex-1 rounded-xl bg-cta text-lg font-bold text-white active:scale-95 disabled:opacity-50"
                >
                  {ocupado ? "Guardando…" : "Guardar"}
                </button>
                <button
                  onClick={cancelarEdicion}
                  disabled={ocupado}
                  className="min-h-12 flex-1 rounded-xl border-2 border-gray-300 text-lg font-bold disabled:opacity-50"
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <p className="text-lg leading-relaxed">{reporte.descripcion}</p>
          )}
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
                {/* Botón cuadrado con ícono (avión de papel): ocupa un ancho
                    fijo para no ensanchar la fila ni provocar scroll horizontal.
                    Mantiene área táctil ≥56px y etiqueta accesible. */}
                <button
                  onClick={comentar}
                  disabled={ocupado || !texto.trim()}
                  aria-label="Enviar comentario"
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-tinta text-white active:scale-95 transition disabled:opacity-50"
                >
                  <svg
                    viewBox="0 0 24 24"
                    className="h-6 w-6"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M22 2 11 13" />
                    <path d="M22 2 15 22l-4-9-9-4 20-7z" />
                  </svg>
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

          {/* Acciones del autor: editar o borrar su propio reporte */}
          {esAutor && !editando && (
            <div className="flex gap-2">
              <button
                onClick={() => setEditando(true)}
                className="min-h-14 flex-1 rounded-2xl border-2 border-tinta text-lg font-bold text-tinta active:scale-95 transition"
              >
                ✏️ Editar
              </button>
              <button
                onClick={borrarReporte}
                disabled={ocupado}
                className="min-h-14 flex-1 rounded-2xl border-2 border-red-600 text-lg font-bold text-red-600 active:scale-95 transition disabled:opacity-50"
              >
                🗑️ Borrar
              </button>
            </div>
          )}

          <button
            onClick={onCerrar}
            className="min-h-14 rounded-2xl bg-cta text-xl font-bold text-white active:scale-95 transition"
          >
            Cerrar
          </button>
        </div>
      </div>

      {/* Foto en pantalla completa */}
      {fotoAmpliada && (
        <div
          className="fixed inset-0 z-[75] flex items-center justify-center bg-black/90 p-2"
          onClick={(e) => {
            e.stopPropagation();
            setFotoAmpliada(false);
          }}
        >
          {/* Botón de cerrar visible: evita que el usuario recurra al "Atrás"
              del celular (que recargaría la app y arruinaría la experiencia). */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              setFotoAmpliada(false);
            }}
            aria-label="Cerrar la foto ampliada"
            className="absolute right-4 top-4 z-10 flex h-12 w-12 items-center justify-center rounded-full bg-white/90 text-2xl font-bold text-tinta active:scale-95"
          >
            ✕
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={reporte.foto_url}
            alt="Foto ampliada del reporte"
            className="max-h-full max-w-full rounded-xl object-contain"
          />
        </div>
      )}
    </div>
  );
}
