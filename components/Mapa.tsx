"use client";

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Posicion, Reporte } from "@/lib/tipos";
import { colorReporte } from "@/lib/gamificacion";
import { CENTRO_MANIZALES, distanciaMetros } from "@/lib/useGeolocalizacion";

export type ModoMapa = "inmersiva" | "general";

// Distancia (m) a la que empieza a mostrarse el anillo de radar de un punto.
const RADIO_RADAR_VISIBLE = 130;
// Conjunto vacío estable para el valor por defecto de idsEnZona
const SIN_ZONA: Set<string> = new Set();

// Píxeles que se baja el centro de la cámara en vista inmersiva, para que el
// avatar quede más abajo y se vea más terreno por delante.
const DESPLAZAMIENTO_AVATAR = 190;

interface Props {
  modo: ModoMapa;
  posicion: Posicion | null;
  enMovimiento: boolean;
  reportes: Reporte[]; // ya filtrados por el padre
  onSeleccionar: (reporte: Reporte) => void;
  /** Reporte al que centrar el mapa (ej. viniendo del historial del perfil) */
  centrarEn?: { lat: number; lng: number } | null;
  /**
   * Nivel de acercamiento de la cámara en vista inmersiva, de 0 a 1.
   * 0 = lejos, vista casi cenital (aérea); 1 = cerca, a nivel del avatar.
   */
  acercamiento?: number;
  /** IDs de reportes dentro de la zona de influencia (radar activo/pulsante) */
  idsEnZona?: Set<string>;
}

// Traduce el acercamiento (0..1) a los parámetros de cámara. Al alejarse
// (t→0) la cámara sube y se endereza hacia una vista cenital; al acercarse
// (t→1) baja el zoom de altura y aumenta el pitch para mirar a nivel de los
// ojos del avatar. La curva es lineal para que el slider se sienta parejo.
function camaraDesdeAcercamiento(t: number) {
  const c = Math.max(0, Math.min(1, t));
  return {
    pitch: 12 + c * (72 - 12), // 12° (casi cenital) → 72° (nivel del avatar)
    zoom: 16.6 + c * (19.2 - 16.6), // cenital sin alejarse tanto ⇄ mucho más cerca
  };
}

// Flecha de dirección: se dibuja "sobre el suelo" (pitchAlignment: map) delante
// del avatar y apunta siempre al rumbo de avance del usuario. Apunta al norte
// en su marco local; MapLibre la rota al heading con setRotation.
const SVG_FLECHA = `
<svg viewBox="0 0 60 96" class="flecha-direccion" aria-hidden="true">
  <path d="M30 4 L48 40 L30 30 L12 40 Z"
        fill="#f76707" stroke="#ffffff" stroke-width="3" stroke-linejoin="round"/>
</svg>`;

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
  acercamiento = 0.7,
  idsEnZona = SIN_ZONA,
}: Props) {
  const contenedorRef = useRef<HTMLDivElement>(null);
  const mapaRef = useRef<maplibregl.Map | null>(null);
  const avatarRef = useRef<maplibregl.Marker | null>(null);
  const flechaRef = useRef<maplibregl.Marker | null>(null);
  const ultimoHeadingRef = useRef<number | null>(null);
  const globosRef = useRef<Map<string, maplibregl.Marker>>(new Map());
  const radaresRef = useRef<Map<string, maplibregl.Marker>>(new Map());
  const idsEnZonaRef = useRef(idsEnZona);
  idsEnZonaRef.current = idsEnZona;
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
      zoom: 18.4,
      pitch: 61, // arranca con mayor incidencia de la perspectiva del avatar
      bearing: 0,
      // Atribución compacta: solo el ícono "ⓘ" que se expande al tocarlo
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
      sincronizarRadares();
    });

    // Flecha de dirección sobre el suelo, DEBAJO del avatar en apilamiento.
    // rotationAlignment/pitchAlignment "map" la mantienen pegada al terreno y
    // girando con el mapa, para que siempre marque el rumbo real de avance.
    const elFlecha = document.createElement("div");
    elFlecha.innerHTML = SVG_FLECHA;
    const flecha = new maplibregl.Marker({
      element: elFlecha,
      anchor: "center",
      rotationAlignment: "map",
      pitchAlignment: "map",
    })
      .setLngLat([CENTRO_MANIZALES.lng, CENTRO_MANIZALES.lat])
      .addTo(mapa);
    elFlecha.style.display = "none"; // se muestra al conocer el primer rumbo
    flechaRef.current = flecha;

    // Avatar del usuario, centrado en su posición. La clase le fija un z-index
    // alto (CSS !important) para que NUNCA quede tapado por los globos.
    const elAvatar = document.createElement("div");
    elAvatar.innerHTML = SVG_AVATAR;
    elAvatar.className = "marcador-avatar";
    elAvatar.setAttribute("role", "img");
    elAvatar.setAttribute("aria-label", "Tu ubicación actual");
    const avatar = new maplibregl.Marker({ element: elAvatar, anchor: "bottom" })
      .setLngLat([CENTRO_MANIZALES.lng, CENTRO_MANIZALES.lat])
      .addTo(mapa);
    avatarRef.current = avatar;

    const radares = radaresRef.current;
    return () => {
      estiloListoRef.current = false;
      globos.forEach((m) => m.remove());
      globos.clear();
      radares.forEach((m) => m.remove());
      radares.clear();
      flecha.remove();
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

  // ---------- Anillos de radar (zona de influencia) sobre el suelo ----------
  // Solo se dibujan para los puntos cercanos al avatar en vista inmersiva; los
  // que están dentro de la zona de influencia pulsan (clase "activo").
  function sincronizarRadares() {
    const mapa = mapaRef.current;
    if (!mapa || !estiloListoRef.current) return;
    const radares = radaresRef.current;
    const pos = posicionRef.current;
    const inmersiva = modoRef.current === "inmersiva";
    const lista = reportesRef.current;

    // Qué puntos merecen anillo ahora mismo
    const cercanos = new Set<string>();
    if (pos && inmersiva) {
      for (const r of lista) {
        const d = distanciaMetros(pos.lat, pos.lng, r.latitud, r.longitud);
        if (d <= RADIO_RADAR_VISIBLE) cercanos.add(r.id);
      }
    }

    // Quitar anillos que ya no aplican
    for (const [id, m] of radares) {
      if (!cercanos.has(id)) {
        m.remove();
        radares.delete(id);
      }
    }

    const datos = datosRef.current;
    for (const id of cercanos) {
      const r = datos.get(id);
      if (!r) continue;
      let m = radares.get(id);
      if (!m) {
        const el = document.createElement("div");
        el.className = "radar-anillo";
        m = new maplibregl.Marker({
          element: el,
          anchor: "center",
          pitchAlignment: "map",
          rotationAlignment: "map",
        })
          .setLngLat([r.longitud, r.latitud])
          .addTo(mapa);
        radares.set(id, m);
      }
      const el = m.getElement();
      el.style.setProperty("--color-radar", colorReporte(r.tipo, r.estado));
      el.classList.toggle("activo", idsEnZonaRef.current.has(id));
    }
  }

  useEffect(() => {
    sincronizarRadares();
  }, [reportes, modo, posicion, idsEnZona]);

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
    // La flecha de dirección solo tiene sentido en la vista inmersiva
    flechaRef.current?.getElement().style.setProperty(
      "display",
      !enGeneral && ultimoHeadingRef.current !== null ? "" : "none"
    );

    if (enGeneral) {
      // Panorama de la ciudad, ligeramente inclinado y sin desplazamiento
      mapa.flyTo({
        center: [CENTRO_MANIZALES.lng, CENTRO_MANIZALES.lat],
        zoom: 13.2,
        pitch: 30,
        bearing: 0,
        padding: { top: 0, bottom: 0, left: 0, right: 0 },
        duration: 1200,
      });
    } else {
      const pos = posicionRef.current;
      // Al volver a la vista inmersiva respetamos el nivel elegido en el slider
      const { pitch, zoom } = camaraDesdeAcercamiento(acercamientoRef.current);
      mapa.flyTo({
        center: pos ? [pos.lng, pos.lat] : [CENTRO_MANIZALES.lng, CENTRO_MANIZALES.lat],
        zoom,
        pitch,
        // Desplaza el centro hacia abajo: el avatar queda en el tercio inferior
        // y se gana perspectiva hacia adelante (puntos lejanos visibles).
        padding: { top: DESPLAZAMIENTO_AVATAR, bottom: 0, left: 0, right: 0 },
        duration: 1200,
      });
    }
  }

  useEffect(() => {
    sincronizarModo();
  }, [modo]);

  // ---------- Slider de cámara: rotación suave según acercamiento ----------
  const acercamientoRef = useRef(acercamiento);
  acercamientoRef.current = acercamiento;

  useEffect(() => {
    const mapa = mapaRef.current;
    if (!mapa || modoRef.current !== "inmersiva") return;
    const pos = posicionRef.current;
    const { pitch, zoom } = camaraDesdeAcercamiento(acercamiento);
    // Duración corta: la cámara sigue el arrastre del slider de forma fluida
    mapa.easeTo({
      ...(pos ? { center: [pos.lng, pos.lat] } : {}),
      pitch,
      zoom,
      duration: 260,
    });
  }, [acercamiento]);

  // ---------- Seguimiento de la posición del usuario ----------
  const posicionRef = useRef(posicion);
  posicionRef.current = posicion;

  useEffect(() => {
    const mapa = mapaRef.current;
    if (!mapa || !posicion) return;
    avatarRef.current?.setLngLat([posicion.lng, posicion.lat]);

    // Flecha de dirección: sigue al avatar y apunta al último rumbo conocido.
    // El GPS solo entrega heading al moverse, así que conservamos el último.
    flechaRef.current?.setLngLat([posicion.lng, posicion.lat]);
    if (posicion.heading !== null && !Number.isNaN(posicion.heading)) {
      ultimoHeadingRef.current = posicion.heading;
      flechaRef.current?.setRotation(posicion.heading);
      if (modoRef.current === "inmersiva") {
        flechaRef.current?.getElement().style.setProperty("display", "");
      }
    }

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

  // El contenedor externo aporta el tamaño (absolute inset-0). El div interno
  // es el que recibe MapLibre: NO usamos inset-0 ahí porque MapLibre le aplica
  // .maplibregl-map { position: relative }, lo que anularía el inset y colapsaría
  // su altura a 0. Con h-full/w-full llena el contenedor sin depender del inset.
  return (
    <div className="absolute inset-0">
      <div ref={contenedorRef} className="h-full w-full" aria-label="Mapa de reportes" />
    </div>
  );
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
