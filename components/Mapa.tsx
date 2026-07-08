"use client";

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Posicion, Reporte } from "@/lib/tipos";
import { colorReporte } from "@/lib/gamificacion";
import { CENTRO_MANIZALES } from "@/lib/useGeolocalizacion";

export type ModoMapa = "inmersiva" | "general";

interface Props {
  modo: ModoMapa;
  posicion: Posicion | null;
  enMovimiento: boolean;
  reportes: Reporte[]; // ya filtrados por el padre
  onSeleccionar: (reporte: Reporte) => void;
  /** Reporte al que centrar el mapa (ej. viniendo del historial del perfil) */
  centrarEn?: { lat: number; lng: number } | null;
}

// Avatar minimalista y unisex (SVG original, dos estados por CSS)
const SVG_AVATAR = `
<svg viewBox="0 0 48 64" class="avatar-usuario quieto" aria-hidden="true">
  <ellipse cx="24" cy="60" rx="12" ry="3.5" fill="rgba(0,0,0,0.25)"/>
  <g class="avatar-cuerpo">
    <rect class="pierna-izq" x="17" y="40" width="6.5" height="17" rx="3" fill="#3b5bdb"/>
    <rect class="pierna-der" x="24.5" y="40" width="6.5" height="17" rx="3" fill="#364fc7"/>
    <rect x="14" y="20" width="20" height="24" rx="9" fill="#4c6ef5"/>
    <circle cx="24" cy="11" r="9" fill="#ffd8a8"/>
    <path d="M15 9 a9 9 0 0 1 18 0 l0 1 a14 14 0 0 1 -18 0 z" fill="#5f3dc4"/>
  </g>
</svg>`;

export function Mapa({
  modo,
  posicion,
  enMovimiento,
  reportes,
  onSeleccionar,
  centrarEn,
}: Props) {
  const contenedorRef = useRef<HTMLDivElement>(null);
  const mapaRef = useRef<maplibregl.Map | null>(null);
  const avatarRef = useRef<maplibregl.Marker | null>(null);
  const globosRef = useRef<Map<string, maplibregl.Marker>>(new Map());
  const datosRef = useRef<Map<string, Reporte>>(new Map());
  const onSeleccionarRef = useRef(onSeleccionar);
  const modoRef = useRef(modo);
  const estiloListoRef = useRef(false);
  onSeleccionarRef.current = onSeleccionar;
  modoRef.current = modo;

  // ---------- Inicialización del mapa (una sola vez) ----------
  useEffect(() => {
    if (!contenedorRef.current) return;
    const globos = globosRef.current;

    const mapa = new maplibregl.Map({
      container: contenedorRef.current,
      style: process.env.NEXT_PUBLIC_MAP_STYLE_URL as string,
      center: [CENTRO_MANIZALES.lng, CENTRO_MANIZALES.lat],
      zoom: 17,
      pitch: 60, // vista 3D inclinada casi a ras de suelo
      bearing: 0,
      attributionControl: { compact: true },
    });
    mapaRef.current = mapa;

    // Evita que un error de MapLibre (p. ej. una capa opcional) rompa el mapa
    mapa.on("error", (e) => {
      console.warn("MapLibre:", e.error?.message ?? e);
    });

    mapa.on("load", () => {
      estiloListoRef.current = true;

      // Extrusión 3D de edificios. El nombre de la fuente varía según el
      // proveedor de tiles (MapTiler usa "maptiler_planet", OpenFreeMap
      // usa "openmaptiles"), así que lo detectamos desde el estilo cargado
      // buscando la capa de edificios existente y reutilizando su fuente.
      try {
        const estilo = mapa.getStyle();
        const capaEdificio = estilo.layers?.find(
          (c) => "source-layer" in c && c["source-layer"] === "building"
        ) as (maplibregl.LayerSpecification & { source?: string }) | undefined;
        const fuenteEdificios = capaEdificio?.source;

        if (fuenteEdificios) {
          mapa.addLayer({
            id: "edificios-3d",
            type: "fill-extrusion",
            source: fuenteEdificios,
            "source-layer": "building",
            minzoom: 14,
            paint: {
              "fill-extrusion-color": "#d8d4cc",
              "fill-extrusion-height": [
                "coalesce",
                ["get", "render_height"],
                ["get", "height"],
                8,
              ],
              "fill-extrusion-base": [
                "coalesce",
                ["get", "render_min_height"],
                ["get", "min_height"],
                0,
              ],
              "fill-extrusion-opacity": 0.75,
            },
          });
        }
      } catch {
        // Si el estilo no trae capa de edificios, el mapa sigue funcionando
      }

      // Fuente con clusters para la vista general
      mapa.addSource("reportes", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
        cluster: true,
        clusterRadius: 55,
        clusterMaxZoom: 15,
      });
      mapa.addLayer({
        id: "clusters",
        type: "circle",
        source: "reportes",
        filter: ["has", "point_count"],
        layout: { visibility: "none" },
        paint: {
          "circle-color": "#495057",
          "circle-radius": ["step", ["get", "point_count"], 20, 10, 27, 25, 34],
          "circle-opacity": 0.88,
          "circle-stroke-width": 3,
          "circle-stroke-color": "#ffffff",
        },
      });
      try {
        mapa.addLayer({
          id: "cluster-count",
          type: "symbol",
          source: "reportes",
          filter: ["has", "point_count"],
          layout: {
            visibility: "none",
            "text-field": "{point_count_abbreviated}",
            "text-size": 16,
            "text-font": ["Noto Sans Regular"],
          },
          paint: { "text-color": "#ffffff" },
        });
      } catch {
        // Sin fuente tipográfica en el estilo: los clusters quedan sin número
      }
      mapa.addLayer({
        id: "puntos",
        type: "circle",
        source: "reportes",
        filter: ["!", ["has", "point_count"]],
        layout: { visibility: "none" },
        paint: {
          "circle-color": ["get", "color"],
          "circle-radius": 11,
          "circle-stroke-width": 3,
          "circle-stroke-color": "#ffffff",
        },
      });

      // Pulsar un punto suelto → abrir detalle del reporte
      mapa.on("click", "puntos", (e) => {
        const id = e.features?.[0]?.properties?.id as string | undefined;
        const r = id ? datosRef.current.get(id) : undefined;
        if (r) onSeleccionarRef.current(r);
      });
      // Pulsar un cluster → acercar
      mapa.on("click", "clusters", async (e) => {
        const feature = e.features?.[0];
        if (!feature) return;
        const clusterId = feature.properties?.cluster_id;
        const fuente = mapa.getSource("reportes") as maplibregl.GeoJSONSource;
        const zoom = await fuente.getClusterExpansionZoom(clusterId);
        mapa.easeTo({
          center: (feature.geometry as GeoJSON.Point).coordinates as [number, number],
          zoom: zoom + 0.5,
        });
      });
      mapa.on("mouseenter", "puntos", () => (mapa.getCanvas().style.cursor = "pointer"));
      mapa.on("mouseleave", "puntos", () => (mapa.getCanvas().style.cursor = ""));
      mapa.on("mouseenter", "clusters", () => (mapa.getCanvas().style.cursor = "pointer"));
      mapa.on("mouseleave", "clusters", () => (mapa.getCanvas().style.cursor = ""));

      sincronizarReportes();
      sincronizarModo();
    });

    // Avatar del usuario, centrado en su posición
    const elAvatar = document.createElement("div");
    elAvatar.innerHTML = SVG_AVATAR;
    elAvatar.setAttribute("role", "img");
    elAvatar.setAttribute("aria-label", "Tu ubicación actual");
    const avatar = new maplibregl.Marker({ element: elAvatar, anchor: "bottom" })
      .setLngLat([CENTRO_MANIZALES.lng, CENTRO_MANIZALES.lat])
      .addTo(mapa);
    avatarRef.current = avatar;

    return () => {
      estiloListoRef.current = false;
      globos.forEach((m) => m.remove());
      globos.clear();
      mapa.remove();
      mapaRef.current = null;
    };
  }, []);

  // ---------- Sincronizar globos DOM + fuente GeoJSON ----------
  const reportesRef = useRef(reportes);
  reportesRef.current = reportes;

  function sincronizarReportes() {
    const mapa = mapaRef.current;
    if (!mapa || !estiloListoRef.current) return;
    const lista = reportesRef.current;
    datosRef.current = new Map(lista.map((r) => [r.id, r]));

    // Globos DOM (vista inmersiva): crear/actualizar/eliminar
    const globos = globosRef.current;
    const idsActuales = new Set(lista.map((r) => r.id));
    for (const [id, marcador] of globos) {
      if (!idsActuales.has(id)) {
        marcador.remove();
        globos.delete(id);
      }
    }
    const enInmersiva = modoRef.current === "inmersiva";
    for (const r of lista) {
      let marcador = globos.get(r.id);
      if (!marcador) {
        const el = crearGlobo(r.id, datosRef, onSeleccionarRef);
        marcador = new maplibregl.Marker({ element: el, anchor: "bottom" })
          .setLngLat([r.longitud, r.latitud])
          .addTo(mapa);
        globos.set(r.id, marcador);
      }
      pintarGlobo(marcador.getElement(), r);
      marcador.getElement().style.display = enInmersiva ? "" : "none";
    }

    // Fuente para clusters (vista general)
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
    sincronizarReportes();
  }, [reportes, modo]);

  // ---------- Cambio de modo: cámara y visibilidad de capas ----------
  function sincronizarModo() {
    const mapa = mapaRef.current;
    if (!mapa || !estiloListoRef.current) return;
    const enGeneral = modoRef.current === "general";
    for (const capa of ["clusters", "cluster-count", "puntos"]) {
      if (mapa.getLayer(capa)) {
        mapa.setLayoutProperty(capa, "visibility", enGeneral ? "visible" : "none");
      }
    }
    if (enGeneral) {
      // Panorama de la ciudad, ligeramente inclinado
      mapa.flyTo({
        center: [CENTRO_MANIZALES.lng, CENTRO_MANIZALES.lat],
        zoom: 13.2,
        pitch: 30,
        bearing: 0,
        duration: 1200,
      });
    } else {
      const pos = posicionRef.current;
      mapa.flyTo({
        center: pos ? [pos.lng, pos.lat] : [CENTRO_MANIZALES.lng, CENTRO_MANIZALES.lat],
        zoom: 17.5,
        pitch: 60,
        duration: 1200,
      });
    }
  }

  useEffect(() => {
    sincronizarModo();
  }, [modo]);

  // ---------- Seguimiento de la posición del usuario ----------
  const posicionRef = useRef(posicion);
  posicionRef.current = posicion;

  useEffect(() => {
    const mapa = mapaRef.current;
    if (!mapa || !posicion) return;
    avatarRef.current?.setLngLat([posicion.lng, posicion.lat]);
    if (modoRef.current === "inmersiva") {
      // La cámara sigue al usuario; si camina, gira hacia su rumbo
      mapa.easeTo({
        center: [posicion.lng, posicion.lat],
        ...(enMovimiento && posicion.heading !== null
          ? { bearing: posicion.heading }
          : {}),
        duration: 900,
      });
    }
  }, [posicion, enMovimiento]);

  // Estado del avatar: caminando / quieto
  useEffect(() => {
    const svg = avatarRef.current?.getElement().querySelector("svg");
    if (!svg) return;
    svg.classList.toggle("caminando", enMovimiento);
    svg.classList.toggle("quieto", !enMovimiento);
  }, [enMovimiento]);

  // Centrar en un reporte específico (desde el historial del perfil)
  useEffect(() => {
    if (!centrarEn || !mapaRef.current) return;
    mapaRef.current.flyTo({
      center: [centrarEn.lng, centrarEn.lat],
      zoom: 17.5,
      duration: 1000,
    });
  }, [centrarEn]);

  return <div ref={contenedorRef} className="absolute inset-0" aria-label="Mapa de reportes" />;
}

// ---------- Globo flotante con miniatura de la foto ----------
function crearGlobo(
  id: string,
  datosRef: React.RefObject<Map<string, Reporte>>,
  onSeleccionarRef: React.RefObject<(r: Reporte) => void>
): HTMLElement {
  const el = document.createElement("button");
  el.type = "button";
  el.className = "globo-reporte";
  el.addEventListener("click", (e) => {
    e.stopPropagation();
    const r = datosRef.current?.get(id);
    if (r) onSeleccionarRef.current?.(r);
  });
  return el;
}

function pintarGlobo(el: HTMLElement, r: Reporte) {
  const color = colorReporte(r.tipo, r.estado);
  const etiqueta =
    r.tipo === "barrera" ? "Reporte de barrera" : "Espacio de bienestar";
  el.setAttribute("aria-label", `${etiqueta}: ${r.descripcion.slice(0, 60)}`);
  el.innerHTML = `
    <span style="display:block;width:54px;height:54px;border-radius:14px;border:4px solid ${color};overflow:hidden;background:#fff;box-shadow:0 3px 8px rgba(0,0,0,0.3)">
      <img src="${r.foto_url}" alt="" style="width:100%;height:100%;object-fit:cover" loading="lazy"/>
    </span>
    <span style="display:block;margin:-1px auto 0;width:0;height:0;border-left:9px solid transparent;border-right:9px solid transparent;border-top:12px solid ${color}"></span>
  `;
}
