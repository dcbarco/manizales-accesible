"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useAuth } from "./AuthProvider";
import { useGeolocalizacion } from "@/lib/useGeolocalizacion";
import { Mapa, type ModoMapa } from "./Mapa";
import { PantallaCarga } from "./PantallaCarga";
import { AvisoSeguridad } from "./AvisoSeguridad";
import { FlujoReporte } from "./FlujoReporte";
import { DetalleReporte } from "./DetalleReporte";
import { TarjetaCercania } from "./TarjetaCercania";
import { useProximidad, type ReporteCercano } from "@/lib/useProximidad";
import type { Reporte, TipoReporte } from "@/lib/tipos";

type Filtro = "todo" | TipoReporte;

const CLAVE_AVISO = "manizales-accesible-aviso-visto";

// Notificación del navegador (best-effort): solo si el usuario dio permiso.
// Si no hay permiso, la app se apoya en la tarjeta dentro de la pantalla.
function notificarNavegador(puntos: ReporteCercano[]) {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") {
    return;
  }
  const titulo =
    puntos.length === 1
      ? "Tienes un punto cerca"
      : `Tienes ${puntos.length} puntos cerca`;
  const cuerpo =
    puntos.length === 1
      ? `${puntos[0].tipo === "barrera" ? "Barrera" : "Espacio de bienestar"}: ${puntos[0].descripcion.slice(0, 80)}`
      : "Toca la app para ver los lugares por visitar y corroborar.";
  try {
    new Notification(titulo, { body: cuerpo, lang: "es" });
  } catch {
    // Algunos navegadores requieren Service Worker; se ignora silenciosamente
  }
}

// Pantalla principal: mapa inmersivo/general + reportes + navegación
export function AppPrincipal() {
  const { sesion, perfil } = useAuth();
  const router = useRouter();
  const parametros = useSearchParams();
  const { posicion, enMovimiento, permiso, reintentar } = useGeolocalizacion();

  const [modo, setModo] = useState<ModoMapa>("inmersiva");
  // Acercamiento de la cámara (0 = vista aérea/cenital, 1 = a nivel del avatar).
  // Arranca alto para privilegiar la perspectiva del avatar sin llegar al tope.
  const [acercamiento, setAcercamiento] = useState(0.82);
  const [filtro, setFiltro] = useState<Filtro>("todo");
  const [reportes, setReportes] = useState<Reporte[]>([]);
  const [seleccionadoId, setSeleccionadoId] = useState<string | null>(null);
  const [mostrarFlujo, setMostrarFlujo] = useState(false);
  const [mostrarAviso, setMostrarAviso] = useState(false);
  const [sinUbicacion, setSinUbicacion] = useState(false);
  const [centrarEn, setCentrarEn] = useState<{ lat: number; lng: number } | null>(null);

  // Aviso de seguridad: solo la primera vez (persistido en localStorage)
  useEffect(() => {
    if (!localStorage.getItem(CLAVE_AVISO)) setMostrarAviso(true);
  }, []);

  function cerrarAviso() {
    localStorage.setItem(CLAVE_AVISO, "1");
    setMostrarAviso(false);
  }

  // Carga inicial de reportes con el perfil del autor
  const cargarReportes = useCallback(async () => {
    const { data } = await supabase
      .from("reportes")
      .select("*, perfil:perfiles(nombre_usuario, nivel)")
      .order("creado_en", { ascending: false })
      .limit(500);
    setReportes((data as Reporte[]) ?? []);
  }, []);

  useEffect(() => {
    cargarReportes();
  }, [cargarReportes]);

  // Realtime: reportes nuevos o actualizados aparecen sin recargar
  useEffect(() => {
    const canal = supabase
      .channel("reportes-vivo")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "reportes" },
        async (evento) => {
          const id = (evento.new as Reporte).id;
          const { data } = await supabase
            .from("reportes")
            .select("*, perfil:perfiles(nombre_usuario, nivel)")
            .eq("id", id)
            .single();
          if (data) {
            setReportes((lista) =>
              lista.some((r) => r.id === id) ? lista : [data as Reporte, ...lista]
            );
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "reportes" },
        (evento) => {
          const nuevo = evento.new as Reporte;
          setReportes((lista) =>
            lista.map((r) => (r.id === nuevo.id ? { ...r, ...nuevo, perfil: r.perfil } : r))
          );
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(canal);
    };
  }, []);

  // Llegada desde el historial del perfil: /?r=<id-del-reporte>
  useEffect(() => {
    const idReporte = parametros.get("r");
    if (idReporte && reportes.length > 0) {
      const r = reportes.find((x) => x.id === idReporte);
      if (r) {
        setSeleccionadoId(r.id);
        setCentrarEn({ lat: r.latitud, lng: r.longitud });
        router.replace("/", { scroll: false });
      }
    }
  }, [parametros, reportes, router]);

  const actualizarReporte = useCallback((actualizado: Reporte) => {
    setReportes((lista) =>
      lista.map((r) => (r.id === actualizado.id ? { ...r, ...actualizado } : r))
    );
  }, []);

  const filtrados = useMemo(
    () => (filtro === "todo" ? reportes : reportes.filter((r) => r.tipo === filtro)),
    [reportes, filtro]
  );

  const seleccionado = useMemo(
    () => reportes.find((r) => r.id === seleccionadoId) ?? null,
    [reportes, seleccionadoId]
  );

  // ---------- Proximidad: radar + notificación de puntos cercanos ----------
  const { enZona, entrada } = useProximidad(posicion, filtrados);
  const idsEnZona = useMemo(() => new Set(enZona.map((r) => r.id)), [enZona]);
  // La lista de puntos cercanos se abre/cierra con la campana de notificaciones
  const [mostrarCercania, setMostrarCercania] = useState(false);

  // Al entrar a la zona de un punto nuevo: notificación del navegador (si hay
  // permiso). El indicador visible es la campana con el globo rojo de conteo.
  useEffect(() => {
    if (entrada === 0 || !sesion || enZona.length === 0) return;
    notificarNavegador(enZona);
  }, [entrada]); // eslint-disable-line react-hooks/exhaustive-deps

  // Solicita permiso de notificaciones una vez tras iniciar sesión
  useEffect(() => {
    if (!sesion || typeof Notification === "undefined") return;
    if (Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
  }, [sesion]);

  // Si ya no hay puntos cerca, cierra el listado automáticamente
  useEffect(() => {
    if (enZona.length === 0) setMostrarCercania(false);
  }, [enZona.length]);

  const mostrarAvisoCercania =
    !!sesion &&
    mostrarCercania &&
    enZona.length > 0 &&
    !seleccionado &&
    !mostrarFlujo &&
    !mostrarAviso;

  function abrirFlujo() {
    if (!sesion) {
      router.push("/login");
      return;
    }
    setMostrarFlujo(true);
  }

  // ---------- Estados de carga / permisos de ubicación ----------
  if (permiso === "pidiendo" && !posicion) {
    return <PantallaCarga mensaje="Buscando tu ubicación…" />;
  }

  if (permiso === "denegado" && !sinUbicacion) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-5 bg-fondo px-6 text-center">
        <p className="text-6xl" aria-hidden="true">📍</p>
        <h1 className="text-2xl font-bold">Necesitamos tu ubicación</h1>
        <p className="max-w-md text-xl leading-relaxed text-gray-700">
          La app usa tu ubicación para mostrarte el mapa a tu alrededor y ubicar
          tus reportes. Activa el permiso de ubicación en tu navegador.
        </p>
        <button
          onClick={reintentar}
          className="w-full max-w-sm min-h-16 rounded-2xl bg-cta text-2xl font-bold text-white active:scale-95 transition"
        >
          Reintentar
        </button>
        <button
          onClick={() => setSinUbicacion(true)}
          className="min-h-12 text-lg text-gray-600 underline underline-offset-4"
        >
          Continuar sin ubicación (mapa de Manizales)
        </button>
      </main>
    );
  }

  const enGeneral = modo === "general";

  return (
    <main className="relative h-dvh w-full overflow-hidden">
      <Mapa
        modo={modo}
        posicion={posicion}
        enMovimiento={enMovimiento}
        reportes={filtrados}
        onSeleccionar={(r) => setSeleccionadoId(r.id)}
        centrarEn={centrarEn}
        acercamiento={acercamiento}
        idsEnZona={idsEnZona}
      />

      {/* ---------- Slider lateral de cámara (solo vista inmersiva) ----------
          Controla la altura y la inclinación de la cámara: arriba = vista
          aérea (cenital); abajo = a nivel del avatar. */}
      {!enGeneral && (
        <div className="absolute right-3 top-1/2 z-10 -translate-y-1/2 touch-none">
          <div className="flex touch-none flex-col items-center gap-2 rounded-full bg-white/95 px-2 py-3 shadow-lg">
            <span className="text-xl" aria-hidden="true">🛰️</span>
            <div className="slider-camara">
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={Math.round(acercamiento * 100)}
                onChange={(e) => setAcercamiento(Number(e.target.value) / 100)}
                aria-label="Acercamiento de la cámara: arriba vista aérea, abajo a nivel del avatar"
              />
            </div>
            <span className="text-xl" aria-hidden="true">🚶</span>
          </div>
        </div>
      )}

      {/* ---------- Barra superior ---------- */}
      <div className="absolute inset-x-0 top-0 flex flex-col gap-2 p-3">
        <div className="flex items-center justify-between gap-2">
          <span className="rounded-full bg-white/95 px-4 py-2 text-lg font-extrabold shadow">
            Manizales Accesible
          </span>
          <div className="flex items-center gap-2">
            {/* Campana de notificaciones con globo rojo de conteo */}
            {sesion && (
              <button
                onClick={() => setMostrarCercania((v) => !v)}
                aria-label={
                  enZona.length > 0
                    ? `Ver ${enZona.length} punto(s) cerca de ti`
                    : "No tienes puntos cerca"
                }
                className="relative flex h-14 w-14 items-center justify-center rounded-full bg-white/95 text-2xl shadow"
              >
                🔔
                {enZona.length > 0 && (
                  <span
                    className="absolute -right-0.5 -top-0.5 flex h-6 min-w-6 items-center justify-center rounded-full border-2 border-white bg-red-600 px-1 text-sm font-extrabold text-white"
                    aria-hidden="true"
                  >
                    {enZona.length}
                  </span>
                )}
              </button>
            )}
            <button
              onClick={() => setMostrarAviso(true)}
              aria-label="Ver el aviso de seguridad"
              className="flex h-14 w-14 items-center justify-center rounded-full bg-white/95 text-2xl shadow"
            >
              🛡️
            </button>
          </div>
        </div>

        {/* Filtros grandes (vista general) */}
        {enGeneral && (
          <div
            className="flex gap-2"
            role="group"
            aria-label="Filtrar reportes por tipo"
          >
            {(
              [
                { valor: "todo", texto: "Ver todo" },
                { valor: "barrera", texto: "Solo barreras" },
                { valor: "bienestar", texto: "Solo bienestar" },
              ] as const
            ).map((f) => (
              <button
                key={f.valor}
                onClick={() => setFiltro(f.valor)}
                aria-pressed={filtro === f.valor}
                className={`min-h-14 flex-1 rounded-2xl px-2 text-lg font-bold shadow transition ${
                  filtro === f.valor
                    ? f.valor === "barrera"
                      ? "bg-barrera text-white"
                      : f.valor === "bienestar"
                        ? "bg-bienestar text-white"
                        : "bg-tinta text-white"
                    : "bg-white/95 text-tinta"
                }`}
              >
                {f.texto}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ---------- Barra inferior: Perfil | Reportar | Mapa ---------- */}
      <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-4 pb-6">
        <Link
          href={sesion ? "/perfil" : "/login"}
          className="flex h-16 w-20 flex-col items-center justify-center rounded-2xl bg-white/95 shadow text-base font-bold"
        >
          <span className="text-2xl" aria-hidden="true">👤</span>
          Perfil
          {perfil && (
            <span className="sr-only">, nivel {perfil.nivel}</span>
          )}
        </Link>

        <button
          onClick={abrirFlujo}
          className="flex min-h-20 flex-1 max-w-xs flex-col items-center justify-center rounded-3xl bg-cta text-white shadow-2xl active:scale-95 transition"
        >
          <span className="text-3xl" aria-hidden="true">📷</span>
          <span className="text-xl font-extrabold">Reportar</span>
        </button>

        <button
          onClick={() => setModo(enGeneral ? "inmersiva" : "general")}
          className="flex h-16 w-20 flex-col items-center justify-center rounded-2xl bg-white/95 shadow text-base font-bold"
        >
          <span className="text-2xl" aria-hidden="true">
            {enGeneral ? "🚶" : "🗺️"}
          </span>
          {enGeneral ? "Volver" : "Mapa"}
        </button>
      </div>

      {/* ---------- Aviso de puntos cercanos (radar de proximidad) ---------- */}
      {mostrarAvisoCercania && (
        <TarjetaCercania
          puntos={enZona}
          onSeleccionar={(r) => setSeleccionadoId(r.id)}
          onCerrar={() => setMostrarCercania(false)}
        />
      )}

      {/* ---------- Capas modales ---------- */}
      {mostrarAviso && <AvisoSeguridad onCerrar={cerrarAviso} />}

      {mostrarFlujo && (
        <FlujoReporte
          posicion={posicion}
          onCerrar={() => setMostrarFlujo(false)}
          onCreado={(r) => {
            setReportes((lista) =>
              lista.some((x) => x.id === r.id) ? lista : [r, ...lista]
            );
          }}
        />
      )}

      {seleccionado && (
        <DetalleReporte
          reporte={seleccionado}
          onCerrar={() => setSeleccionadoId(null)}
          onActualizar={actualizarReporte}
        />
      )}
    </main>
  );
}
