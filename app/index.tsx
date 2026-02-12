import { ActivityIndicator, View } from 'react-native';
import { Redirect } from 'expo-router';
import { useAuth } from '../providers/AuthProvider';

export default function Gate() {
  const { session, loading, ownerLoading, isOwner } = useAuth();
  console.log('GATE RENDER');
  console.log('GATE STATE', {
    loading,
    hasSession: !!session,
    ownerLoading,
    isOwner,
    uid: session?.user?.id,
  });

  // 1) Espera a cargar auth
  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  // 2) Si hay sesión, espera a resolver el rol SIEMPRE
  if (session && ownerLoading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  // 3) Sin sesión => auth
  if (!session) return <Redirect href="/(main)/qr" />;

  // 4) Con sesión => decide por rol
  return isOwner ? (
    <Redirect href="/admin/qr" />
  ) : (
    <Redirect href="/(main)/qr" />
  );
}
