import React, { useEffect } from 'react';
import { View, Text, Pressable } from 'react-native';
import SignInButton from '../../components/SignInButton';
import { useAuth } from '../../providers/AuthProvider';
import { useRouter } from 'expo-router';

export default function SignInPage() {
  const { session, loading, signOut } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (session) {
      router.replace('/');
    }
  }, [router, session]);

  return (
    <View style={{ flex: 1, padding: 24, gap: 16, justifyContent: 'center' }}>
      <Text style={{ fontSize: 24, fontWeight: '700', textAlign: 'center' }}>
        SignIn
      </Text>
      {!loading && !session ? <SignInButton /> : null}

      {!loading && session ? (
        <View style={{ gap: 8, alignItems: 'center' }}>
          <Text style={{ textAlign: 'center' }}>¡Sesión iniciada!</Text>
          <Text style={{ textAlign: 'center' }}>
            Email: {session.user.email}
          </Text>
          <Pressable
            onPress={signOut}
            style={{ backgroundColor: '#222', padding: 12, borderRadius: 10 }}
          >
            <Text style={{ color: 'white' }}>Cerrar sesión</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}
