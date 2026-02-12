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
  loading: boolean; // loading de auth (sesión)
  ownerLoading: boolean; // loading del rol (owners)
  signOut: () => Promise<void>;
  profile: UserProfile;
  isOwner: boolean;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  session: null,
  loading: true,
  ownerLoading: true,
  signOut: async () => {},
  profile: null,
  isOwner: false,
  refreshProfile: async () => {},
});

async function ensureUserProfile(userId: string) {
  try {
    const { error } = await supabase.from('user_profiles').insert({
      user_id: userId,
      preferred_locale: 'es',
      accepted_terms_at: new Date().toISOString(),
    });

    // 23505 = unique_violation
    if (error && (error as any).code !== '23505') {
      console.warn('[ensureUserProfile] insert error', error);
    }
  } catch (e) {
    console.warn('[ensureUserProfile] fatal', e);
  }
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [ownerLoading, setOwnerLoading] = useState(true);

  const [profile, setProfile] = useState<UserProfile>(null);
  const [isOwner, setIsOwner] = useState(false);

  const loadProfile = async (userId: string) => {
    const { data, error } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) console.warn('[loadProfile]', error);
    setProfile(data ?? null);
  };

  const loadIsOwner = async (userId: string) => {
    const { data, error } = await supabase
      .from('owners')
      .select('user_id')
      .eq('user_id', userId)
      .maybeSingle();

    // PGRST116 = maybeSingle sin filas
    if (error && error.code !== 'PGRST116') {
      console.warn('[loadIsOwner]', error);
    }

    setIsOwner(!!data);
    setOwnerLoading(false);
  };

  const refreshProfile = async () => {
    const uid = session?.user?.id;
    if (!uid) return;

    // Bloquea mientras refrescas el rol
    setOwnerLoading(true);
    await Promise.all([loadProfile(uid), loadIsOwner(uid)]);
  };

  console.log('[loadIsOwner] uid', profile?.user_id);

  useEffect(() => {
    let mounted = true;

    const handleSession = (sess: Session | null) => {
      setSession(sess);

      const uid = sess?.user?.id;

      if (uid) {
        // ✅ IMPORTANTÍSIMO: en cuanto hay sesión, marcamos ownerLoading=true
        // para que el Gate NO decida todavía.
        setOwnerLoading(true);

        // opcional pero ayuda a evitar estado viejo en transiciones
        setIsOwner(false);

        console.log('[handleSession]', {
          event: 'setSession',
          hasUid: !!uid,
          uid,
        });

        void ensureUserProfile(uid);
        void Promise.all([loadProfile(uid), loadIsOwner(uid)]);
      } else {
        setProfile(null);
        setIsOwner(false);
        setOwnerLoading(false);
      }
    };

    // 1) Sesión inicial
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      handleSession(data.session ?? null);
      setLoading(false);
    });

    // 2) Cambios de auth (login/logout)
    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => {
      handleSession(sess ?? null);
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);
  console.log('[loadIsOwner] result', !!profile);

  const signOut = async () => {
    await supabase.auth.signOut();
    // No hace falta navegar aquí si tienes guard en layouts,
    // pero no hace daño resetear
    setProfile(null);
    setIsOwner(false);
    setOwnerLoading(false);
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        loading,
        ownerLoading,
        signOut,
        profile,
        isOwner,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
