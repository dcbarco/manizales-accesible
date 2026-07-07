"use client";

import { Suspense, useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { Bienvenida } from "@/components/Bienvenida";
import { AppPrincipal } from "@/components/AppPrincipal";
import { PantallaCarga } from "@/components/PantallaCarga";

function Contenido() {
  const { sesion, cargando } = useAuth();
  // "Explorar sin cuenta": solo lectura, recordado durante la sesión del navegador
  const [explorar, setExplorar] = useState(false);
  const [listo, setListo] = useState(false);

  useEffect(() => {
    setExplorar(sessionStorage.getItem("explorar-sin-cuenta") === "1");
    setListo(true);
  }, []);

  if (cargando || !listo) {
    return <PantallaCarga mensaje="Cargando Manizales Accesible…" />;
  }

  if (!sesion && !explorar) {
    return (
      <Bienvenida
        onExplorar={() => {
          sessionStorage.setItem("explorar-sin-cuenta", "1");
          setExplorar(true);
        }}
      />
    );
  }

  return <AppPrincipal />;
}

export default function Pagina() {
  return (
    <Suspense fallback={<PantallaCarga mensaje="Cargando…" />}>
      <Contenido />
    </Suspense>
  );
}
