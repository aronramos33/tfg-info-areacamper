import 'react-native-gesture-handler';
import { Slot } from 'expo-router';
import { AuthProvider } from '../providers/AuthProvider';
import { PendingReservationProvider } from '../providers/PendingReservationContext';
import { AppAlertProvider } from '../components/AppAlert';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as Linking from 'expo-linking';
import { useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useFonts } from 'expo-font';
import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
} from '@expo-google-fonts/plus-jakarta-sans';
import {
  Inter_400Regular,
  Inter_600SemiBold,
  Inter_700Bold,
} from '@expo-google-fonts/inter';

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
    Inter_400Regular,
    Inter_600SemiBold,
    Inter_700Bold,
  });

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

  if (!fontsLoaded) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AuthProvider>
        <PendingReservationProvider>
          <Slot />
          <AppAlertProvider />
        </PendingReservationProvider>
      </AuthProvider>
    </GestureHandlerRootView>
  );
}
