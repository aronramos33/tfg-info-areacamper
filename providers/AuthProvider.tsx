import { createContext, useContext, useEffect, useState } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

//Create a context for authentication
type AuthContextValue = {
  user: User | null;
  loading: boolean;
}; //Create a type for the context value

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
}); //Initialize the context with default values

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null); //State to hold the user information
  const [loading, setLoading] = useState(true); //State to manage loading status

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      //El método getSession obtiene la sesión actual
      const session: Session | null = data.session ?? null; //Creamos una variable session que contiene la sesión actual o null si no hay sesión
      setUser(session?.user ?? null); //Si hay sesión, obtenemos el usuario, si no, lo dejamos como null
      setLoading(false); //Cambiamos el estado de loading a false
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      //Detecta los cambios de sesión de tal forma que si el usuario inicia o cierra sesión, se actualiza el estado. En event se guarda el tipo de evento (sign in, sign out, etc.) y en session se guarda la sesión actual.
      setUser(session?.user ?? null); //Actualiza el usuario en el estado
    });

    return () => sub.subscription.unsubscribe(); //Limpia la suscripción al evento de cambio de sesión cuando el componente se desmonta
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading }}>
      {children}
    </AuthContext.Provider>
  ); //Provee el contexto a los componentes hijos, es el contexto que acabamos de crear con createContext
}

export function useAuth() {
  return useContext(AuthContext);
} //Hook personalizado para acceder al contexto de autenticación, permite a los componentes acceder fácilmente a la información del usuario y el estado de carga
