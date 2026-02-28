import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons'; // ejemplo
import { useAuth } from '../../providers/AuthProvider';
import { Redirect } from 'expo-router';

export default function MainTabs() {
  const { isOwner } = useAuth();

  // Si no hay sesión => fuera
  if (isOwner) {
    return <Redirect href="/admin/qr" />;
  }

  // ✅ Si es admin, renderiza tabs admin
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#007AFF',
      }}
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
        name="reservations/index"
        options={{
          title: 'Reservar',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="calendar-outline" size={size} color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="qr/index"
        options={{
          title: 'Mis Viajes',
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
