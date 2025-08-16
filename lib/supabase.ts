// lib/supabase.ts
import 'react-native-url-polyfill/auto'; // Necesario para que URL funcione en RN
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';

// 🔑 Lee las claves desde app.config.ts → extra del archivo .env
const supabaseUrl = Constants.expoConfig?.extra?.SUPABASE_URL as string; // URL de tu proyecto Supabase, lo lee del archivo .env a través de app.config.ts
const supabaseAnonKey = Constants.expoConfig?.extra
  ?.SUPABASE_ANON_KEY as string; // Clave anónima de tu proyecto Supabase, lo lee del archivo .env a través de app.config.ts

// 🛠️ Inicializa el cliente de Supabase
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage, // Guardar tokens de sesión en el móvil
    autoRefreshToken: true, // Refrescar automáticamente
    persistSession: true, // Mantener sesión tras cerrar app
    detectSessionInUrl: false, // En móvil no usamos query params
  },
});
