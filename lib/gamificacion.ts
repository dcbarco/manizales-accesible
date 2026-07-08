import type { EstadoReporte, TipoReporte } from "./tipos";

// Niveles por puntos acumulados (ver schema.sql: calcular_nivel)
export interface Nivel {
  nivel: number;
  nombre: string;
  puntos: number;
}

export const NIVELES: Nivel[] = [
  { nivel: 1, nombre: "Observador", puntos: 0 },
  { nivel: 2, nombre: "Caminante", puntos: 30 },
  { nivel: 3, nombre: "Vigía", puntos: 100 },
  { nivel: 4, nombre: "Guardián", puntos: 250 },
  { nivel: 5, nombre: "Héroe Ciudadano", puntos: 500 },
];

export function infoNivel(puntos: number) {
  let actual = NIVELES[0];
  for (const n of NIVELES) if (puntos >= n.puntos) actual = n;
  const siguiente = NIVELES.find((n) => n.nivel === actual.nivel + 1) ?? null;
  const progreso = siguiente
    ? Math.min(
        100,
        Math.round(
          ((puntos - actual.puntos) / (siguiente.puntos - actual.puntos)) * 100
        )
      )
    : 100;
  return { actual, siguiente, progreso };
}

export function nombreNivel(nivel: number): string {
  return NIVELES.find((n) => n.nivel === nivel)?.nombre ?? "Observador";
}

// Etiquetas visibles de cada estado según tipo de reporte
export function etiquetaEstado(estado: EstadoReporte, tipo: TipoReporte): string {
  const mapa: Record<string, string> = {
    pendiente: "Sin corroborar",
    confirmado: "Confirmado",
    persiste: tipo === "barrera" ? "Sigue ahí" : "Recomendado",
    recomendado: "Recomendado",
    resuelto: "Resuelto",
    cerrado: "Ya no está",
  };
  return mapa[estado] ?? estado;
}

// Colores de los globos/puntos del mapa: cálidos = barrera, fríos = bienestar
export function colorReporte(tipo: TipoReporte, estado: EstadoReporte): string {
  if (tipo === "barrera") {
    if (estado === "resuelto") return "#868e96"; // gris: ya resuelto
    if (estado === "persiste") return "#c92a2a"; // rojo intenso: sigue ahí
    return "#e8590c"; // naranja
  }
  if (estado === "cerrado") return "#868e96";
  if (estado === "recomendado") return "#1971c2"; // azul: recomendado
  return "#099268"; // verde
}

// Opciones de corroboración según el tipo de reporte
export function opcionesVoto(tipo: TipoReporte) {
  if (tipo === "barrera") {
    return [
      { valor: "confirmado", texto: "Confirmo", icono: "✅" },
      { valor: "persiste", texto: "Sigue ahí", icono: "⚠️" },
      { valor: "resuelto", texto: "Resuelto", icono: "✔️" },
    ] as const;
  }
  return [
    { valor: "confirmado", texto: "Confirmo", icono: "✅" },
    { valor: "recomendado", texto: "Lo recomiendo", icono: "💚" },
    { valor: "cerrado", texto: "Ya no está", icono: "❌" },
  ] as const;
}
