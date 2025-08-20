import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Session } from '@supabase/supabase-js';

interface AuthContextValue {
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
} //Define que datos y funciones se van a usar en el contexto

const AuthContext = createContext<AuthContextValue>({
  session: null,
  loading: true,
  signOut: async () => {},
}); //Define el valor por defecto del contexto definido anteriormente

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [session, setSession] = useState<Session | null>(null); //Estado para la sesión
  const [loading, setLoading] = useState(true); //Estado para el loading

  useEffect(() => {
    let mounted = true;
    // Cargar sesión al inicio
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session ?? null);
      setLoading(false);
    }); //Sirve para saber si el usuario esta logueado o no

    // Suscribirse a cambios de auth
    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess ?? null); //El operador ?? es para que si no hay sesión, se ponga null
    }); //Cada vez que el usuario se loguea o desloguea, se actualiza el estado de la sesión

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
  }; //Función para cerrar sesión

  return (
    <AuthContext.Provider value={{ session, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  ); //Retorna el contexto con los datos y funciones definidos anteriormente
};

export const useAuth = () => useContext(AuthContext); //Retorna el contexto
//Lo que hace es que cada vez que se use el hook useAuth, se retorna el contexto con los datos y funciones definidos anteriormente. De tal forma que se puede usar en cualquier componente que este dentro del contexto.
