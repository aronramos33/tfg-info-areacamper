// app/index.tsx
import { useEffect } from 'react';
import { ActivityIndicator, Linking, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../providers/AuthProvider';

export default function Gate() {
  const { session, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return; // espera a que AuthProvider cargue
    if (session) router.replace('/(tabs)');
    else router.replace('/(auth)/sign-in');
  }, [loading, session, router]);

  useEffect(() => {
    const sub = Linking.addEventListener('url', (e) => {
      console.log('Deep link recibido =>', e.url);
    });
    return () => sub.remove();
  }, []);

  // Pantalla neutra mientras decide
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator />
    </View>
  );
}
