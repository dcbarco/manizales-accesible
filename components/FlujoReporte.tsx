"use client";

import { useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { comprimirImagen } from "@/lib/imagen";
import { useAuth } from "./AuthProvider";
import type { Posicion, Reporte, TipoReporte } from "@/lib/tipos";
import { CENTRO_MANIZALES } from "@/lib/useGeolocalizacion";

type Paso = "tipo" | "confirmar" | "formulario" | "enviando" | "exito";

interface Props {
  posicion: Posicion | null;
  onCerrar: () => void;
  onCreado: (reporte: Reporte) => void;
}

// Flujo completo de creación de reporte:
// elegir tipo → cámara/galería → confirmar o repetir → formulario → envío
export function FlujoReporte({ posicion, onCerrar, onCreado }: Props) {
  const { sesion, perfil, avisarAccion } = useAuth();
  const [paso, setPaso] = useState<Paso>("tipo");
  const [tipo, setTipo] = useState<TipoReporte>("barrera");
  const [archivo, setArchivo] = useState<File | null>(null);
  const [previa, setPrevia] = useState<string | null>(null);
  const [anonimo, setAnonimo] = useState(false);
  const [descripcion, setDescripcion] = useState("");
  const [direccion, setDireccion] = useState("");
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const esBarrera = tipo === "barrera";
  const coords = posicion ?? { ...CENTRO_MANIZALES, heading: null, speed: null };

  function elegirTipo(t: TipoReporte) {
    setTipo(t);
    inputRef.current?.click(); // abre cámara o galería
  }

  function alElegirFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (previa) URL.revokeObjectURL(previa);
    setArchivo(f);
    setPrevia(URL.createObjectURL(f));
    setPaso("confirmar");
    e.target.value = ""; // permite re-seleccionar la misma foto
  }

  async function enviar() {
    if (!sesion || !archivo) return;
    if (!descripcion.trim()) {
      setError("Escribe una breve descripción del hallazgo.");
      return;
    }
    setError(null);
    setPaso("enviando");
    try {
      // 1. Comprimir y subir la foto al bucket fotos-reportes
      const blob = await comprimirImagen(archivo);
      const ruta = `${sesion.user.id}/${Date.now()}.jpg`;
      const { error: errorSubida } = await supabase.storage
        .from("fotos-reportes")
        .upload(ruta, blob, { contentType: "image/jpeg" });
      if (errorSubida) throw errorSubida;
      const { data: publica } = supabase.storage
        .from("fotos-reportes")
        .getPublicUrl(ruta);

      // 2. Insertar el reporte (los puntos e insignias los otorga el trigger)
      const { data, error: errorInsert } = await supabase
        .from("reportes")
        .insert({
          usuario_id: sesion.user.id,
          tipo,
          descripcion: descripcion.trim(),
          foto_url: publica.publicUrl,
          latitud: coords.lat,
          longitud: coords.lng,
          direccion_texto: direccion.trim() || null,
          anonimo,
        })
        .select("*, perfil:perfiles(nombre_usuario, nivel)")
        .single();
      if (errorInsert) throw errorInsert;

      onCreado(data as Reporte);
      await avisarAccion(); // refresca puntos y detecta insignias nuevas
      setPaso("exito");
      setTimeout(onCerrar, 1800);
    } catch (e) {
      console.error(e);
      setError(
        "No pudimos enviar tu reporte. Revisa tu conexión e inténtalo de nuevo."
      );
      setPaso("formulario");
    }
  }

  const colorAcento = esBarrera ? "bg-barrera" : "bg-bienestar";

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/60"
      role="dialog"
      aria-modal="true"
      aria-label="Crear un reporte"
    >
      {/* Input de cámara/galería (oculto) */}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={alElegirFoto}
        aria-hidden="true"
        tabIndex={-1}
      />

      <div className="aparece-abajo w-full max-w-md max-h-[92dvh] overflow-y-auto rounded-t-3xl bg-white p-5 pb-8">
        {/* ---------- Paso 1: elegir tipo ---------- */}
        {paso === "tipo" && (
          <div className="flex flex-col gap-4">
            <h2 className="text-2xl font-bold text-center">¿Qué quieres reportar?</h2>
            <button
              onClick={() => elegirTipo("barrera")}
              className="flex min-h-24 items-center gap-4 rounded-2xl bg-barrera-suave border-4 border-barrera p-4 text-left active:scale-95 transition"
            >
              <span className="text-5xl" aria-hidden="true">⚠️</span>
              <span>
                <span className="block text-xl font-bold text-barrera-oscuro">
                  Reportar barrera
                </span>
                <span className="block text-base text-gray-700">
                  Andenes rotos, huecos, falta de rampas…
                </span>
              </span>
            </button>
            <button
              onClick={() => elegirTipo("bienestar")}
              className="flex min-h-24 items-center gap-4 rounded-2xl bg-bienestar-suave border-4 border-bienestar p-4 text-left active:scale-95 transition"
            >
              <span className="text-5xl" aria-hidden="true">💚</span>
              <span>
                <span className="block text-xl font-bold text-bienestar-oscuro">
                  Reportar espacio de bienestar
                </span>
                <span className="block text-base text-gray-700">
                  Parques, bancas, cafés, miradores…
                </span>
              </span>
            </button>
            <button
              onClick={onCerrar}
              className="min-h-12 text-lg text-gray-600 underline underline-offset-4"
            >
              Cancelar
            </button>
          </div>
        )}

        {/* ---------- Paso 2: confirmar o repetir foto ---------- */}
        {paso === "confirmar" && previa && (
          <div className="flex flex-col gap-4">
            <h2 className="text-2xl font-bold text-center">¿Se ve bien la foto?</h2>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previa}
              alt="Foto tomada para el reporte"
              className="max-h-[45dvh] w-full rounded-2xl object-contain bg-gray-100"
            />
            <div className="flex gap-3">
              <button
                onClick={() => inputRef.current?.click()}
                className="flex-1 min-h-14 rounded-2xl border-4 border-gray-400 bg-white text-xl font-bold active:scale-95 transition"
              >
                🔄 Repetir
              </button>
              <button
                onClick={() => setPaso("formulario")}
                className={`flex-1 min-h-14 rounded-2xl ${colorAcento} text-white text-xl font-bold active:scale-95 transition`}
              >
                ✓ Confirmar
              </button>
            </div>
            <button
              onClick={onCerrar}
              className="min-h-12 text-lg text-gray-600 underline underline-offset-4"
            >
              Cancelar
            </button>
          </div>
        )}

        {/* ---------- Paso 3: formulario ---------- */}
        {(paso === "formulario" || paso === "enviando") && (
          <div className="flex flex-col gap-4">
            {/* Indicador del tipo, con opción de cambiar */}
            <div
              className={`flex items-center justify-between rounded-2xl p-3 ${
                esBarrera ? "bg-barrera-suave" : "bg-bienestar-suave"
              }`}
            >
              <p className="text-xl font-bold">
                {esBarrera ? "⚠️ Barrera" : "💚 Espacio de bienestar"}
              </p>
              <button
                onClick={() => setTipo(esBarrera ? "bienestar" : "barrera")}
                className="min-h-12 rounded-xl border-2 border-gray-500 bg-white px-4 text-base font-semibold"
              >
                Cambiar tipo
              </button>
            </div>

            {previa && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={previa}
                alt="Foto del reporte"
                className="h-32 w-full rounded-2xl object-cover"
              />
            )}

            {/* Nombre / anónimo */}
            <div className="rounded-2xl border-2 border-gray-300 p-3">
              <p className="text-lg">
                Publicar como:{" "}
                <strong>{anonimo ? "Anónimo" : perfil?.nombre_usuario}</strong>
              </p>
              <label className="mt-2 flex min-h-12 items-center gap-3 text-lg">
                <input
                  type="checkbox"
                  checked={anonimo}
                  onChange={(e) => setAnonimo(e.target.checked)}
                  className="h-7 w-7 accent-gray-700"
                />
                Publicar como Anónimo
              </label>
            </div>

            {/* Ubicación capturada + dirección opcional */}
            <div className="rounded-2xl border-2 border-gray-300 p-3">
              <p className="text-lg">
                📍 Ubicación:{" "}
                <strong>
                  {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}
                </strong>
                {!posicion && (
                  <span className="block text-base text-amber-700">
                    (aproximada: no tenemos tu ubicación exacta)
                  </span>
                )}
              </p>
              <label htmlFor="direccion" className="mt-2 block text-lg">
                Dirección (opcional):
              </label>
              <input
                id="direccion"
                type="text"
                value={direccion}
                onChange={(e) => setDireccion(e.target.value)}
                placeholder="Ej: Carrera 23 # 30-15"
                className="mt-1 w-full min-h-12 rounded-xl border-2 border-gray-300 px-3 text-lg"
              />
            </div>

            <label htmlFor="descripcion" className="text-lg font-semibold -mb-2">
              Descripción del hallazgo:
            </label>
            <textarea
              id="descripcion"
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              rows={3}
              placeholder={
                esBarrera
                  ? "Describe la barrera que encontraste..."
                  : "Describe este espacio de bienestar..."
              }
              className="w-full rounded-xl border-2 border-gray-300 p-3 text-lg"
            />

            {error && (
              <p role="alert" className="rounded-xl bg-red-100 p-3 text-lg text-red-800">
                {error}
              </p>
            )}

            <button
              onClick={enviar}
              disabled={paso === "enviando"}
              className="boton-enviar-vivo min-h-16 rounded-2xl bg-cta text-white text-2xl font-extrabold shadow-lg active:scale-95 transition disabled:opacity-60"
            >
              {paso === "enviando" ? "Enviando…" : "¡Enviar reporte! 🚀"}
            </button>
            <button
              onClick={onCerrar}
              disabled={paso === "enviando"}
              className="min-h-12 text-lg text-gray-600 underline underline-offset-4"
            >
              Cancelar
            </button>
          </div>
        )}

        {/* ---------- Paso 4: éxito ---------- */}
        {paso === "exito" && (
          <div className="aparece-zoom flex flex-col items-center gap-3 py-8 text-center">
            <p className="text-6xl" aria-hidden="true">✅</p>
            <h2 className="text-2xl font-bold">¡Reporte enviado!</h2>
            <p className="text-lg text-gray-700">
              Gracias por aportar a tu ciudad. Ganaste <strong>+10 puntos</strong>.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
