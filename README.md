# Manizales Accesible 🗺️💚

Web app **mobile-first** de reporte ciudadano colaborativo para mapear **barreras urbanas** (andenes rotos, huecos, falta de rampas…) y **espacios de bienestar** (parques, bancas, cafés, miradores…) en Manizales, Caldas, Colombia. Pensada para personas de 40 años en adelante: botones grandes, textos claros, interfaz 100% en español.

Los ciudadanos toman una foto, la clasifican como **Barrera** o **Bienestar**, y el reporte aparece como un globo en un **mapa 3D inclinado** (estilo Waze). Otros usuarios corroboran ("Confirmo", "Sigue ahí", "Resuelto"), comentan y ganan **puntos, niveles e insignias**.

> ⚠️ **Seguridad:** esta app **no** detecta autos, obstáculos ni eventos imprevistos. La interacción principal es detenerse a reportar; el aviso de seguridad se muestra en la app y no debe retirarse.

## Stack

- **Next.js (App Router) + TypeScript + Tailwind CSS**
- **MapLibre GL JS** — mapa 3D inclinado (pitch 60°) con edificios extruidos; tiles de **MapTiler** (capa gratuita)
- **Supabase** — Postgres, Auth (email + contraseña), Storage (fotos), Realtime
- Geolocalización con `navigator.geolocation.watchPosition`; cámara con `<input type="file" capture="environment">`
- Despliegue: **Vercel** (capa gratuita)

## Requisitos

- Node.js 20+
- Cuenta gratuita en [Supabase](https://supabase.com)
- Clave gratuita de [MapTiler](https://www.maptiler.com/) (u otro proveedor de tiles compatible con MapLibre)

## 1. Configurar Supabase

1. Crea un proyecto en el [dashboard de Supabase](https://supabase.com/dashboard).
2. Abre **SQL Editor** y ejecuta **completo** el contenido de [`supabase/schema.sql`](supabase/schema.sql). Ese archivo crea:
   - Tablas: `perfiles`, `reportes`, `votos_reporte`, `comentarios`, `insignias`, `insignias_usuario` (+ seed de 8 insignias).
   - **Funciones y triggers** de gamificación (puntos, niveles, estado de reportes, otorgamiento de insignias) — se eligió lógica en **triggers de Postgres** por ser la opción más robusta: los puntos se otorgan de forma atómica en el servidor y no dependen del cliente.
   - Políticas **RLS**: lectura pública, escritura solo del usuario autenticado sobre sus propios datos.
   - Buckets de Storage `fotos-reportes` y `avatares` con sus políticas.
   - Publicación **Realtime** de `reportes`, `comentarios` e `insignias_usuario`.
3. (Recomendado para pruebas) En **Authentication → Sign In / Up → Email**, desactiva **"Confirm email"** para que los usuarios entren de inmediato al registrarse. Si lo dejas activo, la app muestra el mensaje "revisa tu correo".

## 2. Variables de entorno

Copia `.env.example` a `.env.local` y completa:

```
NEXT_PUBLIC_SUPABASE_URL=https://TU-PROYECTO.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=TU_ANON_KEY
NEXT_PUBLIC_MAP_KEY=TU_CLAVE_MAPTILER
NEXT_PUBLIC_MAP_STYLE_URL=https://api.maptiler.com/maps/basic-v2/style.json?key=TU_CLAVE_MAPTILER
```

- URL y anon key: **Project Settings → API** en Supabase.
- `NEXT_PUBLIC_MAP_STYLE_URL`: cualquier estilo MapLibre con capa `building` sirve (se usa para la extrusión 3D). Alternativa sin clave: [OpenFreeMap](https://openfreemap.org/) (`https://tiles.openfreemap.org/styles/liberty`).

No hay claves en el código: todo sale de `.env.local`.

## 3. Correr en local

```bash
npm install
npm run dev
```

Abre http://localhost:3000. Para probar la geolocalización desde un celular en tu red local necesitas HTTPS (la API de geolocalización requiere contexto seguro); lo más fácil es desplegar a Vercel o usar un túnel (`npx untun tunnel http://localhost:3000` o similar).

## 4. Desplegar en Vercel

1. Sube el repositorio a GitHub (verifica que `.env.local` **no** se suba; ya está en `.gitignore`).
2. En [vercel.com](https://vercel.com) → **New Project** → importa el repo.
3. Añade las 4 variables de entorno anteriores en **Settings → Environment Variables**.
4. Deploy. Funciona en la capa gratuita (<100 usuarios sin problema).

## Estructura

```
app/
  page.tsx            # Entrada: bienvenida o app principal
  login/ registro/    # Autenticación (email + contraseña)
  perfil/             # Nivel, puntos, insignias, historial
  ranking/            # Top 10 por puntos + tu posición
components/
  AppPrincipal.tsx    # Orquestador: mapa, realtime, navegación
  Mapa.tsx            # MapLibre 3D: avatar, globos, clusters
  FlujoReporte.tsx    # Tipo → cámara → confirmar → formulario → envío
  DetalleReporte.tsx  # Detalle: corroboración estilo Waze + comentarios
  AuthProvider.tsx    # Sesión + perfil + detección de insignias nuevas
lib/                  # Cliente Supabase, tipos, gamificación, geolocalización
supabase/schema.sql   # TODO el SQL (tablas, RLS, triggers, storage, realtime)
```

## Gamificación

| Acción | Puntos |
|---|---|
| Crear un reporte | +10 |
| Tu reporte recibe "Confirmo" | +3 |
| Tu barrera queda "Resuelto" | +5 |
| Corroborar un reporte ajeno | +2 |
| Escribir un comentario | +2 |

Niveles: Observador (0) → Caminante (30) → Vigía (100) → Guardián (250) → Héroe Ciudadano (500). Las 8 insignias y sus criterios están en el seed de `schema.sql`; se otorgan automáticamente por triggers y la app muestra una notificación celebratoria al detectarlas.

## Decisiones técnicas y supuestos

- **Gamificación en triggers de Postgres** (no en el cliente): atómica, a prueba de trampas y funciona aunque el cliente cierre la app a mitad de una acción.
- **Estado del reporte** derivado de los votos: 2+ votos de "Resuelto/Ya no está" (y ≥ que los de "Sigue ahí") lo marcan resuelto/cerrado; cualquier "Sigue ahí"/"Lo recomiendo" lo marca persiste/recomendado; cualquier "Confirmo" lo confirma.
- **Columna extra `reportes.anonimo`**: el flujo pide "Publicar como Anónimo"; el reporte queda vinculado internamente al usuario (para puntos) pero se muestra como "Anónimo".
- Las fotos se **comprimen en el navegador** (máx. 1280 px, JPEG 80%) antes de subirlas, pensando en conexiones móviles.
- El avatar es un SVG **original, minimalista y unisex**, animado por CSS (caminando/quieto según `watchPosition`), con respeto a `prefers-reduced-motion`.
