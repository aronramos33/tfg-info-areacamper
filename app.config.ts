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
    plugins: [],
    extra: {
      SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
      SUPABASE_ANON_KEY: process.env.EXPO_PUBLIC_SUPABASE_KEY,
    },
  },
};
