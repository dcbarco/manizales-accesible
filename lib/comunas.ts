// Comunas de Manizales (11). Centroides APROXIMADOS: sirven para el diagnóstico
// por zonas asignando cada reporte a la comuna más cercana. Para límites
// oficiales, reemplazar por el GeoJSON de comunas y una prueba punto-en-polígono
// (la función asignarComuna es el único punto a cambiar).
export interface Comuna {
  id: number;
  nombre: string;
  lat: number;
  lng: number;
}

export const COMUNAS: Comuna[] = [
  { id: 1, nombre: "Atardeceres", lat: 5.0783, lng: -75.5205 },
  { id: 2, nombre: "San José", lat: 5.0688, lng: -75.5185 },
  { id: 3, nombre: "Cumanday (Centro)", lat: 5.0687, lng: -75.5138 },
  { id: 4, nombre: "La Estación", lat: 5.0651, lng: -75.5089 },
  { id: 5, nombre: "Ciudadela del Norte", lat: 5.0857, lng: -75.4939 },
  { id: 6, nombre: "Ecoturístico Cerro de Oro", lat: 5.0596, lng: -75.5218 },
  { id: 7, nombre: "Tesorito", lat: 5.0430, lng: -75.4790 },
  { id: 8, nombre: "Palogrande", lat: 5.0588, lng: -75.4930 },
  { id: 9, nombre: "Universitaria", lat: 5.0559, lng: -75.4972 },
  { id: 10, nombre: "La Fuente", lat: 5.0725, lng: -75.4855 },
  { id: 11, nombre: "La Macarena", lat: 5.0760, lng: -75.5075 },
];

// Distancia máxima (grados aprox.) para considerar que un punto pertenece a una
// comuna; más allá se etiqueta como "Fuera del área". ~0.05° ≈ 5.5 km.
const MAX_GRADOS = 0.05;

// Asigna un punto a la comuna del centroide más cercano (aproximación).
export function asignarComuna(lat: number, lng: number): Comuna | null {
  let mejor: Comuna | null = null;
  let mejorDist = Infinity;
  for (const c of COMUNAS) {
    const d = (c.lat - lat) ** 2 + (c.lng - lng) ** 2; // distancia² (basta comparar)
    if (d < mejorDist) {
      mejorDist = d;
      mejor = c;
    }
  }
  if (mejor && Math.sqrt(mejorDist) > MAX_GRADOS) return null;
  return mejor;
}
