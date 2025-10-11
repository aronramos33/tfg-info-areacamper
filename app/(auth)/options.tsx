import { View } from 'react-native';
import { Pressable, Text, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/providers/AuthProvider';
import { useEffect } from 'react';
import * as Linking from 'expo-linking';

export default function SignInPage() {
  const { session, loading } = useAuth();
  const router = useRouter();
  const redirectTo = Linking.createURL('/');
  console.log('Redirect URL:', redirectTo);

  useEffect(() => {
    if (session) {
      router.replace('/');
    }
  }, [router, session]);

  const handlePressSignIn = () => {
    router.push('/(auth)/sign-in');
  };
  const handlePressSignUp = () => {
    router.push('/(auth)/sign-up');
  };

  return (
    <View style={{ flex: 1, padding: 24, gap: 16, justifyContent: 'center' }}>
      <Pressable
        onPress={handlePressSignIn}
        disabled={loading}
        style={({ pressed }) => ({
          opacity: pressed || loading ? 0.7 : 1,
          backgroundColor: '#1a73e8',
          paddingVertical: 14,
          paddingHorizontal: 16,
          borderRadius: 12,
          alignItems: 'center',
          justifyContent: 'center',
        })}
      >
        {loading ? (
          <ActivityIndicator />
        ) : (
          <Text style={{ color: 'white', fontSize: 16, fontWeight: '600' }}>
            Iniciar sesión
          </Text>
        )}
      </Pressable>
      <Pressable
        onPress={handlePressSignUp}
        disabled={loading}
        style={({ pressed }) => ({
          opacity: pressed || loading ? 0.7 : 1,
          backgroundColor: '#1a73e8',
          paddingVertical: 14,
          paddingHorizontal: 16,
          borderRadius: 12,
          alignItems: 'center',
          justifyContent: 'center',
        })}
      >
        {loading ? (
          <ActivityIndicator />
        ) : (
          <Text style={{ color: 'white', fontSize: 16, fontWeight: '600' }}>
            Registrarse
          </Text>
        )}
      </Pressable>
    </View>
  );
}
