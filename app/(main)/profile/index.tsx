import { View, Text, Button, StyleSheet, Alert } from 'react-native';
import { useAuth } from '@/providers/AuthProvider';
import RequireAuthCard from '@/components/RequireAuthCard';

export default function ProfileIndex() {
  //Aquí va una vez identificado.
  const { session, signOut, isOwner } = useAuth();

  const handleSignOut = async () => {
    Alert.alert(
      'Cerrar sesión',
      '¿Estás seguro de que quieres cerrar sesión?',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Cerrar sesión', onPress: signOut, style: 'destructive' },
      ],
    );
  };

  if (!session) return <RequireAuthCard />;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>¡Bienvenido!</Text>

      {session && (
        <View style={styles.userInfo}>
          <Text style={styles.label}>Email:</Text>
          <Text style={styles.value}>{session.user.email}</Text>

          {session.user.user_metadata?.full_name && (
            <>
              <Text style={styles.label}>Nombre:</Text>
              <Text style={styles.value}>
                {session.user.user_metadata.full_name}
              </Text>
            </>
          )}

          <Text style={styles.label}>ID de usuario:</Text>
          <Text style={styles.value}>{session.user.id}</Text>
          <Text style={{ fontSize: 18 }}>
            {session.user.user_metadata.full_name
              ? `Hola, ${session.user.user_metadata.full_name}`
              : 'Hola'}
          </Text>
          {isOwner ? (
            <Text style={{ color: 'green' }}>Eres propietario ✅</Text>
          ) : null}
        </View>
      )}

      <Button title="Cerrar sesión" onPress={handleSignOut} color="#ff4444" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 20,
  },
  userInfo: {
    width: '100%',
    padding: 20,
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
    marginTop: 12,
  },
  value: {
    fontSize: 16,
    color: '#333',
    marginTop: 4,
    marginBottom: 8,
  },
});
