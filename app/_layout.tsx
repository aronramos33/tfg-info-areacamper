import { Slot } from 'expo-router';
import { AuthProvider } from '../providers/AuthProvider';
import * as Linking from 'expo-linking';
import { useEffect } from 'react';
import { supabase } from '../lib/supabase';

export default function RootLayout() {
  const url = Linking.useURL();

  useEffect(() => {
    if (!url) return;
    try {
      const parsed = Linking.parse(url);
      const code = (parsed as any)?.queryParams?.code as string | undefined;
      if (code) {
        supabase.auth.exchangeCodeForSession(code).catch(() => {});
      }
    } catch {}
  }, [url]);

  return (
    <AuthProvider>
      <Slot />
    </AuthProvider>
  );
}
