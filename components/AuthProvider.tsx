"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import type { Insignia, Perfil } from "@/lib/tipos";
import { ToastInsignia } from "./ToastInsignia";

interface ContextoAuth {
  sesion: Session | null;
  perfil: Perfil | null;
  cargando: boolean;
  recargarPerfil: () => Promise<void>;
  /** Llamar tras reportar/votar/comentar: refresca perfil y detecta insignias nuevas */
  avisarAccion: () => Promise<void>;
  cerrarSesion: () => Promise<void>;
}

const Contexto = createContext<ContextoAuth>({
  sesion: null,
  perfil: null,
  cargando: true,
  recargarPerfil: async () => {},
  avisarAccion: async () => {},
  cerrarSesion: async () => {},
});

export function useAuth() {
  return useContext(Contexto);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [sesion, setSesion] = useState<Session | null>(null);
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [cargando, setCargando] = useState(true);
  // Insignias ya conocidas del usuario (para detectar las nuevas)
  const insigniasConocidas = useRef<Set<string> | null>(null);
  const [insigniaNueva, setInsigniaNueva] = useState<Insignia | null>(null);

  const cargarPerfil = useCallback(async (userId: string) => {
    const { data } = await supabase
      .from("perfiles")
      .select("*")
      .eq("id", userId)
      .single();
    setPerfil((data as Perfil) ?? null);
  }, []);

  const cargarInsignias = useCallback(
    async (userId: string, mostrarNuevas: boolean) => {
      const { data } = await supabase
        .from("insignias_usuario")
        .select("insignia_id, insignia:insignias(id, nombre, descripcion, icono)")
        .eq("usuario_id", userId);
      if (!data) return;
      const ids = new Set(data.map((d) => d.insignia_id as string));
      if (mostrarNuevas && insigniasConocidas.current) {
        for (const fila of data) {
          if (!insigniasConocidas.current.has(fila.insignia_id as string)) {
            setInsigniaNueva((fila.insignia as unknown as Insignia) ?? null);
            break; // muestra una a la vez
          }
        }
      }
      insigniasConocidas.current = ids;
    },
    []
  );

  useEffect(() => {
    // Sesión persistida + escucha de cambios de autenticación
    supabase.auth.getSession().then(({ data }) => {
      setSesion(data.session);
      if (data.session) {
        cargarPerfil(data.session.user.id);
        cargarInsignias(data.session.user.id, false);
      }
      setCargando(false);
    });

    const { data: escucha } = supabase.auth.onAuthStateChange(
      (_evento, nuevaSesion) => {
        setSesion(nuevaSesion);
        if (nuevaSesion) {
          cargarPerfil(nuevaSesion.user.id);
          cargarInsignias(nuevaSesion.user.id, false);
        } else {
          setPerfil(null);
          insigniasConocidas.current = null;
        }
      }
    );
    return () => escucha.subscription.unsubscribe();
  }, [cargarPerfil, cargarInsignias]);

  const recargarPerfil = useCallback(async () => {
    if (sesion) await cargarPerfil(sesion.user.id);
  }, [sesion, cargarPerfil]);

  const avisarAccion = useCallback(async () => {
    if (!sesion) return;
    await Promise.all([
      cargarPerfil(sesion.user.id),
      cargarInsignias(sesion.user.id, true),
    ]);
  }, [sesion, cargarPerfil, cargarInsignias]);

  const cerrarSesion = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  return (
    <Contexto.Provider
      value={{ sesion, perfil, cargando, recargarPerfil, avisarAccion, cerrarSesion }}
    >
      {children}
      {insigniaNueva && (
        <ToastInsignia
          insignia={insigniaNueva}
          onCerrar={() => setInsigniaNueva(null)}
        />
      )}
    </Contexto.Provider>
  );
}
