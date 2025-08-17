// lib/supabase.ts
import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, processLock } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';
import Constants from 'expo-constants';

// 🔑 Lee las claves desde app.config.ts → extra del archivo .env
const supabaseUrl = Constants.expoConfig?.extra?.SUPABASE_URL as string; // URL de tu proyecto Supabase, lo lee del archivo .env a través de app.config.ts
const supabaseAnonKey = Constants.expoConfig?.extra
  ?.SUPABASE_ANON_KEY as string; // Clave anónima de tu proyecto Supabase, lo lee del archivo .env a través de app.config.ts

// 🛠️ Inicializa el cliente de Supabase
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    ...(Platform.OS !== 'web' ? { storage: AsyncStorage } : {}),
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false, // RN: evita loops
    flowType: 'pkce',
    lock: processLock,
  },
});

if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}
