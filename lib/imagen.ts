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
