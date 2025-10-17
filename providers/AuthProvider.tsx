import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Session } from '@supabase/supabase-js';

type UserProfile = {
  user_id: string;
  full_name: string;
  phone: string;
  dni: string;
  license_plate: string;
  preferred_locale: string | null;
  accepted_terms_at: string | null;
  created_at: string | null;
} | null;

interface AuthContextValue {
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
  // 👇 nuevo:
  profile: UserProfile;
  isOwner: boolean;
  refreshProfile: () => Promise<void>;
} //Define que datos y funciones se van a usar en el contexto

const AuthContext = createContext<AuthContextValue>({
  session: null,
  loading: true,
  signOut: async () => {},
  // 👇 nuevo:
  profile: null,
  isOwner: false,
  refreshProfile: async () => {},
}); //Define el valor por defecto del contexto definido anteriormente

async function ensureUserProfile(userId: string) {
  try {
    // upsert atómico para evitar “duplicate key” en carreras
    const { error } = await supabase.from('user_profiles').upsert(
      {
        user_id: userId,
        full_name: 'Sin nombre',
        phone: '',
        dni: '',
        license_plate: '',
        preferred_locale: 'es',
        accepted_terms_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    );
    if (error) console.warn('[ensureUserProfile] upsert error', error);
  } catch (e) {
    console.warn('[ensureUserProfile] fatal', e);
  }
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [session, setSession] = useState<Session | null>(null); //Estado para la sesión
  const [loading, setLoading] = useState(true); //Estado para el loading
  const [profile, setProfile] = useState<UserProfile>(null);
  const [isOwner, setIsOwner] = useState(false);

  // loader del perfil
  const loadProfile = async (userId: string) => {
    const { data, error } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) {
      console.warn('[loadProfile]', error);
    }
    setProfile(data ?? null);
  };

  // loader del flag owner (lee la tabla owners)
  const loadIsOwner = async (userId: string) => {
    const { data, error } = await supabase
      .from('owners')
      .select('user_id')
      .eq('user_id', userId)
      .maybeSingle();
    if (error && error.code !== 'PGRST116') {
      // PGRST116 = maybeSingle sin filas
      console.warn('[loadIsOwner]', error);
    }
    setIsOwner(!!data);
  };

  const refreshProfile = async () => {
    const uid = session?.user?.id;
    if (uid) {
      await Promise.all([loadProfile(uid), loadIsOwner(uid)]);
    }
  };

  useEffect(() => {
    let mounted = true;
    // Cargar sesión al inicio
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session ?? null); // ✅ primero fijamos sesión

      const uid = data.session?.user?.id;
      if (uid) {
        // 2) aseguramos perfil (no bloquea)
        void ensureUserProfile(uid);
        // 3) cargamos perfil + owner (no bloquea)
        void Promise.all([loadProfile(uid), loadIsOwner(uid)]);
      } // ✅ luego, fire-and-forget (sin await)

      setLoading(false);
    }); //Sirve para saber si el usuario esta logueado o no

    // Suscribirse a cambios de auth
    const { data: sub } = supabase.auth.onAuthStateChange(
      async (_event, sess) => {
        setSession(sess ?? null); // ✅ primero sesión

        const uid = sess?.user?.id;
        if (uid) {
          void ensureUserProfile(uid);
          void Promise.all([loadProfile(uid), loadIsOwner(uid)]);
        } else {
          setProfile(null);
          setIsOwner(false);
        } // ✅ luego perfil (sin bloquear)
      },
    ); //Cada vez que el usuario se loguea o desloguea, se actualiza el estado de la sesión

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
  }; //Función para cerrar sesión

  return (
    <AuthContext.Provider
      value={{ session, loading, signOut, profile, isOwner, refreshProfile }}
    >
      {children}
    </AuthContext.Provider>
  ); //Retorna el contexto con los datos y funciones definidos anteriormente
};

export const useAuth = () => useContext(AuthContext); //Retorna el contexto
//Lo que hace es que cada vez que se use el hook useAuth, se retorna el contexto con los datos y funciones definidos anteriormente. De tal forma que se puede usar en cualquier componente que este dentro del contexto.
