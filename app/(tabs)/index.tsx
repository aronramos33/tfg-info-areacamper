import { View, Text, Button } from 'react-native';
import { useAuth } from '@/providers/AuthProvider';
import { supabase } from '@/lib/supabase';

export default function HomeScreen() {
  const { user, loading } = useAuth();

  if (loading) {
    return <Text>Cargando sesión...</Text>;
  }

  if (!user) {
    return <Text>No has iniciado sesión</Text>;
  }

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
      <Text>Bienvenido {user.email}</Text>
      <Button title="Cerrar sesión" onPress={handleLogout} />
    </View>
  );
}
