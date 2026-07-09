"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/AuthProvider";
import { PantallaCarga } from "@/components/PantallaCarga";
import { MapaAdmin } from "@/components/admin/MapaAdmin";
import { COMUNAS, asignarComuna } from "@/lib/comunas";
import { etiquetaEstado } from "@/lib/gamificacion";
import type { Perfil, Reporte } from "@/lib/tipos";

// Dashboard de administración: seguimiento de usuarios, mapa maestro de todos
// los reportes, diagnóstico por comunas, moderación y datos abiertos.
export default function PaginaAdmin() {
  const { sesion, perfil, cargando } = useAuth();
  const router = useRouter();
  const [reportes, setReportes] = useState<Reporte[]>([]);
  const [usuarios, setUsuarios] = useState<Perfil[]>([]);
  const [cargandoDatos, setCargandoDatos] = useState(true);
  const [seleccionado, setSeleccionado] = useState<Reporte | null>(null);

  const esAdmin = !!perfil?.es_admin;

  // Protección de acceso: solo administradores
  useEffect(() => {
    if (cargando) return;
    if (!sesion || (perfil && !perfil.es_admin)) router.replace("/");
  }, [cargando, sesion, perfil, router]);

  const cargar = useCallback(async () => {
    setCargandoDatos(true);
    const [r, u] = await Promise.all([
      supabase
        .from("reportes")
        .select("*, perfil:perfiles(nombre_usuario, nivel)")
        .order("creado_en", { ascending: false })
        .limit(2000),
      supabase.from("perfiles").select("*").order("puntos", { ascending: false }),
    ]);
    setReportes((r.data as Reporte[]) ?? []);
    setUsuarios((u.data as Perfil[]) ?? []);
    setCargandoDatos(false);
  }, []);

  useEffect(() => {
    if (esAdmin) cargar();
  }, [esAdmin, cargar]);

  // ---------- Estadísticas ----------
  const stats = useMemo(() => {
    const barreras = reportes.filter((r) => r.tipo === "barrera");
    const bienestar = reportes.filter((r) => r.tipo === "bienestar");
    const resueltas = barreras.filter((r) => r.estado === "resuelto").length;
    const persisten = barreras.filter((r) => r.estado === "persiste").length;
    const activos = usuarios.filter((u) => u.reportes_total > 0).length;
    const votos = usuarios.reduce((s, u) => s + (u.votos_total ?? 0), 0);
    const comentarios = usuarios.reduce((s, u) => s + (u.comentarios_total ?? 0), 0);
    return {
      totalReportes: reportes.length,
      barreras: barreras.length,
      bienestar: bienestar.length,
      resueltas,
      persisten,
      pctResueltas: barreras.length ? Math.round((resueltas / barreras.length) * 100) : 0,
      usuarios: usuarios.length,
      activos,
      votos,
      comentarios,
    };
  }, [reportes, usuarios]);

  // ---------- Diagnóstico por comuna ----------
  const zonas = useMemo(() => {
    const mapa = new Map(
      COMUNAS.map((c) => [
        c.id,
        { nombre: c.nombre, total: 0, barreras: 0, bienestar: 0, resueltas: 0 },
      ])
    );
    let fuera = 0;
    for (const r of reportes) {
      const c = asignarComuna(r.latitud, r.longitud);
      if (!c) {
        fuera++;
        continue;
      }
      const z = mapa.get(c.id)!;
      z.total++;
      if (r.tipo === "barrera") {
        z.barreras++;
        if (r.estado === "resuelto") z.resueltas++;
      } else {
        z.bienestar++;
      }
    }
    const filas = [...mapa.values()].sort((a, b) => b.barreras - a.barreras);
    return { filas, fuera };
  }, [reportes]);

  // ---------- Acciones de moderación ----------
  async function alternarBaneo(u: Perfil) {
    const nuevo = !u.baneado;
    const { error } = await supabase
      .from("perfiles")
      .update({ baneado: nuevo })
      .eq("id", u.id);
    if (error) {
      alert("No se pudo actualizar el baneo: " + error.message);
      return;
    }
    setUsuarios((lista) =>
      lista.map((x) => (x.id === u.id ? { ...x, baneado: nuevo } : x))
    );
  }

  async function eliminarUsuario(u: Perfil) {
    if (
      !confirm(
        `¿Eliminar a "${u.nombre_usuario}"? Se borrarán también sus reportes, votos y comentarios. Esta acción no se puede deshacer.`
      )
    )
      return;
    const { error } = await supabase.from("perfiles").delete().eq("id", u.id);
    if (error) {
      alert("No se pudo eliminar: " + error.message);
      return;
    }
    setUsuarios((lista) => lista.filter((x) => x.id !== u.id));
    setReportes((lista) => lista.filter((x) => x.usuario_id !== u.id));
  }

  async function eliminarReporte(r: Reporte) {
    if (!confirm("¿Eliminar este reporte definitivamente?")) return;
    const { error } = await supabase.from("reportes").delete().eq("id", r.id);
    if (error) {
      alert("No se pudo eliminar el reporte: " + error.message);
      return;
    }
    setReportes((lista) => lista.filter((x) => x.id !== r.id));
    setSeleccionado(null);
  }

  // ---------- Exportación de datos abiertos ----------
  function exportarCSV() {
    const cols = [
      "id",
      "tipo",
      "estado",
      "descripcion",
      "latitud",
      "longitud",
      "comuna",
      "creado_en",
    ];
    const filas = reportes.map((r) => {
      const c = asignarComuna(r.latitud, r.longitud);
      return [
        r.id,
        r.tipo,
        r.estado,
        `"${(r.descripcion ?? "").replace(/"/g, '""')}"`,
        r.latitud,
        r.longitud,
        c ? c.nombre : "Fuera del área",
        r.creado_en,
      ].join(",");
    });
    descargar("reportes-manizales.csv", [cols.join(","), ...filas].join("\n"), "text/csv");
  }

  function exportarGeoJSON() {
    const fc = {
      type: "FeatureCollection",
      features: reportes.map((r) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [r.longitud, r.latitud] },
        properties: {
          id: r.id,
          tipo: r.tipo,
          estado: r.estado,
          descripcion: r.descripcion,
          comuna: asignarComuna(r.latitud, r.longitud)?.nombre ?? "Fuera del área",
          creado_en: r.creado_en,
        },
      })),
    };
    descargar(
      "reportes-manizales.geojson",
      JSON.stringify(fc, null, 2),
      "application/geo+json"
    );
  }

  if (cargando || (sesion && !perfil)) {
    return <PantallaCarga mensaje="Verificando acceso…" />;
  }
  if (!esAdmin) {
    return <PantallaCarga mensaje="Redirigiendo…" />;
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col gap-6 bg-fondo px-4 py-6 md:px-6">
      {/* Encabezado */}
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold md:text-3xl">Panel de administración</h1>
          <p className="text-base text-gray-600">
            Manizales Accesible · tablero de datos ciudadanos
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={cargar}
            className="min-h-11 rounded-xl bg-white px-4 text-base font-bold shadow active:scale-95"
          >
            ↻ Actualizar
          </button>
          <Link
            href="/"
            className="min-h-11 rounded-xl bg-tinta px-4 py-2 text-base font-bold text-white shadow"
          >
            ← Volver al mapa
          </Link>
        </div>
      </header>

      {/* KPIs */}
      <section aria-label="Resumen" className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi valor={stats.usuarios} etiqueta="Usuarios registrados" sub={`${stats.activos} activos`} />
        <Kpi valor={stats.totalReportes} etiqueta="Reportes totales" />
        <Kpi valor={stats.barreras} etiqueta="Barreras" color="#e8590c" sub={`${stats.pctResueltas}% resueltas`} />
        <Kpi valor={stats.bienestar} etiqueta="Espacios de bienestar" color="#099268" />
        <Kpi valor={stats.persisten} etiqueta="Barreras que persisten" color="#c92a2a" />
        <Kpi valor={stats.resueltas} etiqueta="Barreras resueltas" color="#2b8a3e" />
        <Kpi valor={stats.votos} etiqueta="Corroboraciones" />
        <Kpi valor={stats.comentarios} etiqueta="Comentarios" />
      </section>

      {/* Mapa maestro */}
      <section aria-label="Mapa general" className="rounded-3xl bg-white p-3 shadow">
        <h2 className="px-1 pb-2 text-xl font-bold">Mapa general de reportes</h2>
        <div className="h-[60vh] min-h-80 w-full">
          {cargandoDatos ? (
            <div className="flex h-full items-center justify-center text-gray-500">
              Cargando mapa…
            </div>
          ) : (
            <MapaAdmin reportes={reportes} onSeleccionar={setSeleccionado} />
          )}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Diagnóstico por comuna */}
        <section aria-label="Diagnóstico por comuna" className="rounded-3xl bg-white p-5 shadow">
          <h2 className="text-xl font-bold">Diagnóstico por comuna</h2>
          <p className="mt-1 text-sm text-gray-500">
            Asignación aproximada por cercanía. Reemplazable por límites oficiales.
          </p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-base">
              <thead className="text-sm text-gray-500">
                <tr>
                  <th className="py-2">Comuna</th>
                  <th className="py-2 text-center">Total</th>
                  <th className="py-2 text-center">Barreras</th>
                  <th className="py-2 text-center">Bienestar</th>
                  <th className="py-2 text-center">% resueltas</th>
                </tr>
              </thead>
              <tbody>
                {zonas.filas.map((z) => (
                  <tr key={z.nombre} className="border-t border-gray-100">
                    <td className="py-2 font-semibold">{z.nombre}</td>
                    <td className="py-2 text-center">{z.total}</td>
                    <td className="py-2 text-center text-barrera-oscuro">{z.barreras}</td>
                    <td className="py-2 text-center text-bienestar-oscuro">{z.bienestar}</td>
                    <td className="py-2 text-center">
                      {z.barreras ? Math.round((z.resueltas / z.barreras) * 100) : 0}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {zonas.fuera > 0 && (
            <p className="mt-2 text-sm text-gray-500">
              {zonas.fuera} reporte(s) fuera del área de comunas.
            </p>
          )}
        </section>

        {/* Datos abiertos */}
        <section aria-label="Datos abiertos" className="rounded-3xl bg-white p-5 shadow">
          <h2 className="text-xl font-bold">Datos abiertos</h2>
          <p className="mt-1 text-base text-gray-600">
            Exporta los reportes para análisis externo, transparencia y
            colaboración data4good.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              onClick={exportarCSV}
              className="min-h-12 rounded-xl bg-tinta px-5 font-bold text-white active:scale-95"
            >
              ⬇ Exportar CSV
            </button>
            <button
              onClick={exportarGeoJSON}
              className="min-h-12 rounded-xl bg-tinta px-5 font-bold text-white active:scale-95"
            >
              ⬇ Exportar GeoJSON
            </button>
          </div>
        </section>
      </div>

      {/* Usuarios */}
      <section aria-label="Usuarios" className="rounded-3xl bg-white p-5 shadow">
        <h2 className="text-xl font-bold">Usuarios ({usuarios.length})</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-base">
            <thead className="text-sm text-gray-500">
              <tr>
                <th className="py-2">Usuario</th>
                <th className="py-2 text-center">Nivel</th>
                <th className="py-2 text-center">Reportes</th>
                <th className="py-2 text-center">Votos</th>
                <th className="py-2 text-center">Coment.</th>
                <th className="py-2 text-center">Estado</th>
                <th className="py-2 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {usuarios.map((u) => (
                <tr key={u.id} className="border-t border-gray-100">
                  <td className="py-2 font-semibold">
                    {u.nombre_usuario}
                    {u.es_admin && (
                      <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-bold text-amber-800">
                        admin
                      </span>
                    )}
                  </td>
                  <td className="py-2 text-center">{u.nivel}</td>
                  <td className="py-2 text-center">{u.reportes_total}</td>
                  <td className="py-2 text-center">{u.votos_total}</td>
                  <td className="py-2 text-center">{u.comentarios_total}</td>
                  <td className="py-2 text-center">
                    {u.baneado ? (
                      <span className="rounded bg-red-100 px-2 py-0.5 text-xs font-bold text-red-700">
                        baneado
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400">activo</span>
                    )}
                  </td>
                  <td className="py-2 text-right">
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => alternarBaneo(u)}
                        disabled={u.es_admin}
                        className="rounded-lg border-2 border-gray-300 px-3 py-1 text-sm font-bold disabled:opacity-40"
                      >
                        {u.baneado ? "Desbanear" : "Banear"}
                      </button>
                      <button
                        onClick={() => eliminarUsuario(u)}
                        disabled={u.es_admin}
                        className="rounded-lg bg-red-600 px-3 py-1 text-sm font-bold text-white disabled:opacity-40"
                      >
                        Eliminar
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Detalle de un reporte (desde el mapa) con opción de eliminar */}
      {seleccionado && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setSeleccionado(null)}
        >
          <div
            className="w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={seleccionado.foto_url} alt="" className="h-52 w-full object-cover" />
            <div className="flex flex-col gap-2 p-5">
              <div className="flex items-center justify-between">
                <span className="text-lg font-bold">
                  {seleccionado.tipo === "barrera" ? "⚠️ Barrera" : "💚 Bienestar"}
                </span>
                <span className="text-base text-gray-600">
                  {etiquetaEstado(seleccionado.estado, seleccionado.tipo)}
                </span>
              </div>
              <p className="text-lg">{seleccionado.descripcion}</p>
              <p className="text-sm text-gray-500">
                Por {seleccionado.perfil?.nombre_usuario ?? "—"} ·{" "}
                {new Date(seleccionado.creado_en).toLocaleDateString("es-CO")}
              </p>
              <div className="mt-2 flex gap-2">
                <button
                  onClick={() => setSeleccionado(null)}
                  className="min-h-12 flex-1 rounded-xl border-2 border-gray-300 font-bold"
                >
                  Cerrar
                </button>
                <button
                  onClick={() => eliminarReporte(seleccionado)}
                  className="min-h-12 flex-1 rounded-xl bg-red-600 font-bold text-white"
                >
                  Eliminar reporte
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

// Tarjeta de indicador (KPI)
function Kpi({
  valor,
  etiqueta,
  sub,
  color,
}: {
  valor: number;
  etiqueta: string;
  sub?: string;
  color?: string;
}) {
  return (
    <div className="rounded-2xl bg-white p-4 shadow">
      <p className="text-3xl font-extrabold" style={color ? { color } : undefined}>
        {valor}
      </p>
      <p className="text-sm font-semibold text-gray-600">{etiqueta}</p>
      {sub && <p className="text-xs text-gray-400">{sub}</p>}
    </div>
  );
}

// Descarga un archivo generado en el navegador
function descargar(nombre: string, contenido: string, tipo: string) {
  const blob = new Blob([contenido], { type: tipo });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  a.click();
  URL.revokeObjectURL(url);
}
