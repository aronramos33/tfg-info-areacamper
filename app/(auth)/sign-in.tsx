import { View, Text, Button, ActivityIndicator } from 'react-native';
import { useGoogleAuth } from '../../hooks/useGoogleAuth';

export default function SignIn() {
  const { signIn, loading } = useGoogleAuth();

  return (
    <View
      style={{
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        gap: 16,
      }}
    >
      <Text style={{ fontSize: 22, fontWeight: '600' }}>Inicia sesión</Text>
      {loading ? (
        <ActivityIndicator />
      ) : (
        <Button title="Continuar con Google" onPress={signIn} />
      )}
    </View>
  );
}
