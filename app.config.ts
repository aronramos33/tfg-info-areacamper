import { config as loadEnv } from 'dotenv';
loadEnv();

export default {
  expo: {
    name: 'tfg-info-areacamper',
    slug: 'tfg-info-areacamper',
    scheme: 'tfg-info-areacamper',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/icon.png',
    userInterfaceStyle: 'automatic',
    splash: {
      image: './assets/splash-icon.png',
      resizeMode: 'contain',
      backgroundColor: '#ffffff',
    },
    ios: { supportsTablet: true },
    android: {
      adaptiveIcon: {
        foregroundImage: './assets/adaptive-icon.png',
        backgroundColor: '#ffffff',
      },
    },
    web: { bundler: 'metro' },
    plugins: ['expo-router', '@react-native-google-signin/google-signin'],
    extra: {
      // ⚠️ REEMPLAZA ESTAS VARIABLES CON LAS DE TU PROYECTO SUPABASE
      SUPABASE_URL: process.env.SUPABASE_URL,
      SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
      EXPO_OWNER: '@aronramos33',
      EXPO_SLUG: 'tfg-info-areacamper',
    },
  },
};
