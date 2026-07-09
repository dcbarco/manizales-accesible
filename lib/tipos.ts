// Tipos compartidos de la app (espejo del esquema de Supabase)

export type TipoReporte = "barrera" | "bienestar";

export type EstadoReporte =
  | "pendiente"
  | "confirmado"
  | "persiste"
  | "resuelto"
  | "recomendado"
  | "cerrado";

export interface Perfil {
  id: string;
  creado_en: string;
  nombre_usuario: string;
  avatar_url: string | null;
  puntos: number;
  nivel: number;
  reportes_total: number;
  votos_total: number;
  comentarios_total: number;
  es_admin?: boolean;
  baneado?: boolean;
}

export interface Reporte {
  id: string;
  usuario_id: string;
  creado_en: string;
  tipo: TipoReporte;
  descripcion: string;
  foto_url: string;
  latitud: number;
  longitud: number;
  direccion_texto: string | null;
  anonimo: boolean;
  estado: EstadoReporte;
  conteo_confirmado: number;
  conteo_persiste: number;
  conteo_resuelto: number;
  // Join con perfiles para mostrar autor
  perfil?: { nombre_usuario: string; nivel: number } | null;
}

export interface Comentario {
  id: string;
  reporte_id: string;
  usuario_id: string;
  texto: string;
  creado_en: string;
  perfil?: { nombre_usuario: string; nivel: number } | null;
}

export interface Insignia {
  id: string;
  nombre: string;
  descripcion: string | null;
  icono: string | null;
}

export interface InsigniaUsuario {
  id: string;
  usuario_id: string;
  insignia_id: string;
  otorgada_en: string;
  insignia?: Insignia | null;
}

export interface Posicion {
  lat: number;
  lng: number;
  heading: number | null;
  speed: number | null;
  precision: number | null; // exactitud del GPS en metros (coords.accuracy)
}
