import 'react-native-gesture-handler';
import { Slot } from 'expo-router';
import { AuthProvider } from '../providers/AuthProvider';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
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
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AuthProvider>
        <Slot />
      </AuthProvider>
    </GestureHandlerRootView>
  );
} //Envuelve cada pantalla con el AuthProvider.
