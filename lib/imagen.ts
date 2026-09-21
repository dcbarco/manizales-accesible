// URL de miniatura vía transformaciones de imagen de Supabase Storage
// (/render/image/ en vez de /object/). Pasa de ~370 KB a ~4 KB por foto y
// el CDN la cachea; el original se sirve con no-cache. Si la URL no es de
// Storage (o el plan no soporta transformaciones) devuelve la original.
export function urlMiniatura(fotoUrl: string, lado = 120): string {
  const marca = "/storage/v1/object/public/";
  if (!fotoUrl.includes(marca)) return fotoUrl;
  const base = fotoUrl.replace(marca, "/storage/v1/render/image/public/");
  return `${base}?width=${lado}&height=${lado}&resize=cover&quality=70`;
}

// Versión intermedia (ancho de pantalla móvil) para la tarjeta de detalle;
// la foto original solo se pide al "ampliar".
export function urlFotoMedia(fotoUrl: string, ancho = 720): string {
  const marca = "/storage/v1/object/public/";
  if (!fotoUrl.includes(marca)) return fotoUrl;
  const base = fotoUrl.replace(marca, "/storage/v1/render/image/public/");
  return `${base}?width=${ancho}&resize=contain&quality=75`;
}

// Comprime la foto en el navegador antes de subirla a Storage
// (máx. 1280px de lado, JPEG 80%) para conexiones móviles lentas.
export async function comprimirImagen(archivo: File): Promise<Blob> {
  const LADO_MAX = 1280;
  try {
    const bitmap = await createImageBitmap(archivo);
    const escala = Math.min(1, LADO_MAX / Math.max(bitmap.width, bitmap.height));
    const ancho = Math.round(bitmap.width * escala);
    const alto = Math.round(bitmap.height * escala);

    const canvas = document.createElement("canvas");
    canvas.width = ancho;
    canvas.height = alto;
    const ctx = canvas.getContext("2d");
    if (!ctx) return archivo;
    ctx.drawImage(bitmap, 0, 0, ancho, alto);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolver) =>
      canvas.toBlob(resolver, "image/jpeg", 0.8)
    );
    return blob ?? archivo;
  } catch {
    // Si el navegador no soporta createImageBitmap, sube el original
    return archivo;
  }
}
