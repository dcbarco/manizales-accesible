"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Reporte } from "@/lib/tipos";
import { colorReporte } from "@/lib/gamificacion";
import { CENTRO_MANIZALES } from "@/lib/useGeolocalizacion";
import { COMUNAS } from "@/lib/comunas";

type Vista = "puntos" | "calor";

interface Props {
  reportes: Reporte[];
  onSeleccionar?: (r: Reporte) => void;
}

// Mapa maestro del dashboard: todos los reportes de todos los usuarios, con
// vista de puntos (color por tipo/estado) o mapa de calor de densidad.
export function MapaAdmin({ reportes, onSeleccionar }: Props) {
  const contenedorRef = useRef<HTMLDivElement>(null);
  const mapaRef = useRef<maplibregl.Map | null>(null);
  const listoRef = useRef(false);
  const datosRef = useRef<Map<string, Reporte>>(new Map());
  const onSelRef = useRef(onSeleccionar);
  onSelRef.current = onSeleccionar;
  const [vista, setVista] = useState<Vista>("puntos");

  const reportesRef = useRef(reportes);
  reportesRef.current = reportes;

  useEffect(() => {
    if (!contenedorRef.current) return;
    const mapa = new maplibregl.Map({
      container: contenedorRef.current,
      style: process.env.NEXT_PUBLIC_MAP_STYLE_URL as string,
      center: [CENTRO_MANIZALES.lng, CENTRO_MANIZALES.lat],
      zoom: 12,
      attributionControl: false,
    });
    mapaRef.current = mapa;
    mapa.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    mapa.on("error", (e) => console.warn("MapLibre admin:", e.error?.message ?? e));

    mapa.on("load", () => {
      listoRef.current = true;
      mapa.addSource("reportes", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });

      // Mapa de calor (densidad)
      mapa.addLayer({
        id: "calor",
        type: "heatmap",
        source: "reportes",
        layout: { visibility: "none" },
        paint: {
          "heatmap-weight": 1,
          "heatmap-intensity": 1.1,
          "heatmap-radius": 26,
          "heatmap-opacity": 0.75,
        },
      });

      // Puntos por reporte
      mapa.addLayer({
        id: "puntos",
        type: "circle",
        source: "reportes",
        paint: {
          "circle-color": ["get", "color"],
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 11, 4, 16, 9],
          "circle-stroke-width": 1.5,
          "circle-stroke-color": "#ffffff",
          "circle-opacity": 0.9,
        },
      });

      // Centroides de comuna como referencia del diagnóstico por zonas
      mapa.addSource("comunas", {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: COMUNAS.map((c) => ({
            type: "Feature" as const,
            geometry: { type: "Point" as const, coordinates: [c.lng, c.lat] },
            properties: { nombre: c.nombre },
          })),
        },
      });
      try {
        mapa.addLayer({
          id: "comunas-etq",
          type: "symbol",
          source: "comunas",
          layout: {
            "text-field": ["get", "nombre"],
            "text-size": 12,
            "text-font": ["Noto Sans Regular"],
            "text-offset": [0, 0.6],
            "text-anchor": "top",
          },
          paint: {
            "text-color": "#1f2428",
            "text-halo-color": "#ffffff",
            "text-halo-width": 1.6,
          },
        });
      } catch {
        // Sin fuente tipográfica en el estilo: se omiten las etiquetas
      }

      mapa.on("click", "puntos", (e) => {
        const id = e.features?.[0]?.properties?.id as string | undefined;
        const r = id ? datosRef.current.get(id) : undefined;
        if (r) onSelRef.current?.(r);
      });
      mapa.on("mouseenter", "puntos", () => (mapa.getCanvas().style.cursor = "pointer"));
      mapa.on("mouseleave", "puntos", () => (mapa.getCanvas().style.cursor = ""));

      sincronizar();
    });

    return () => {
      listoRef.current = false;
      mapa.remove();
      mapaRef.current = null;
    };
  }, []);

  function sincronizar() {
    const mapa = mapaRef.current;
    if (!mapa || !listoRef.current) return;
    const lista = reportesRef.current;
    datosRef.current = new Map(lista.map((r) => [r.id, r]));
    const fuente = mapa.getSource("reportes") as maplibregl.GeoJSONSource | undefined;
    fuente?.setData({
      type: "FeatureCollection",
      features: lista.map((r) => ({
        type: "Feature" as const,
        geometry: { type: "Point" as const, coordinates: [r.longitud, r.latitud] },
        properties: { id: r.id, color: colorReporte(r.tipo, r.estado) },
      })),
    });
  }

  useEffect(() => {
    sincronizar();
  }, [reportes]);

  // Alternar puntos / calor
  useEffect(() => {
    const mapa = mapaRef.current;
    if (!mapa || !listoRef.current) return;
    if (mapa.getLayer("puntos")) {
      mapa.setLayoutProperty("puntos", "visibility", vista === "puntos" ? "visible" : "none");
    }
    if (mapa.getLayer("calor")) {
      mapa.setLayoutProperty("calor", "visibility", vista === "calor" ? "visible" : "none");
    }
  }, [vista]);

  return (
    <div className="relative h-full w-full overflow-hidden rounded-2xl">
      <div ref={contenedorRef} className="h-full w-full" aria-label="Mapa de todos los reportes" />
      {/* Conmutador de vista */}
      <div className="absolute left-3 top-3 z-10 flex overflow-hidden rounded-xl bg-white shadow">
        {(["puntos", "calor"] as const).map((v) => (
          <button
            key={v}
            onClick={() => setVista(v)}
            aria-pressed={vista === v}
            className={`px-3 py-2 text-sm font-bold ${
              vista === v ? "bg-tinta text-white" : "text-tinta"
            }`}
          >
            {v === "puntos" ? "Puntos" : "Mapa de calor"}
          </button>
        ))}
      </div>
    </div>
  );
}
