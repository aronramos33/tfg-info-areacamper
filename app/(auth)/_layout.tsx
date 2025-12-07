// app/(auth)/_layout.tsx
import { Slot, Redirect } from 'expo-router';
import { View, ActivityIndicator } from 'react-native';
import { useAuth } from '../../providers/AuthProvider';

export default function AuthLayout() {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  // Si ya está logueado, no tiene sentido verlo aquí → lo sacamos a main
  if (session) {
    return <Redirect href="/(main)/qr" />;
  }

  // Si NO hay sesión, puede ver options, sign-in, sign-up sin problema
  return <Slot />;
}
