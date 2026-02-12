import { Tabs, Redirect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, View } from 'react-native';
import { useAuth } from '../../providers/AuthProvider';

export default function AdminTabsLayout() {
  const { session, loading, ownerLoading } = useAuth();

  // Espera a que auth/rol estén listos
  if (loading || (session && ownerLoading)) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  // Si no hay sesión => fuera
  if (!session) {
    return <Redirect href="/(main)/qr" />;
  }

  // ✅ Si es admin, renderiza tabs admin
  return (
    <Tabs
      screenOptions={{ headerShown: false, tabBarActiveTintColor: '#007AFF' }}
    >
      <Tabs.Screen
        name="services"
        options={{
          title: 'Servicios',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="briefcase-outline" size={size} color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="places/index"
        options={{
          title: 'Estado',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="calendar-outline" size={size} color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="qr/index"
        options={{
          title: 'QR',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="qr-code-outline" size={size} color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="profile/index"
        options={{
          title: 'Perfil',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person-outline" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
