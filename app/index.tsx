// app/index.tsx
import { useEffect } from 'react';
import { ActivityIndicator, Linking, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../providers/AuthProvider';

export default function Gate() {
  const { session, loading } = useAuth(); //Se obtiene la sesión y el estado de carga del contexto a través del hook useAuth.
  const router = useRouter(); //Se obtiene el router para redirigir al usuario a las diferentes rutas.

  useEffect(() => {
    if (loading) return; // espera a que AuthProvider cargue
    // Si loading ya terminó, chequeamos session
    if (session) {
      router.replace('/(tabs)');
    } else {
      router.replace('/(auth)/options');
    }
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
} //Este componente es el que se encarga de redirigir al usuario a las diferentes rutas, dependiendo de si esta logueado o no.
