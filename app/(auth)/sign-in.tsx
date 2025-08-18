import React, { useEffect } from 'react';
import { View, Text } from 'react-native';
import SignInButton from '../../components/SignInButton';
import { useAuth } from '../../providers/AuthProvider';
import { useRouter } from 'expo-router';

export default function SignInPage() {
  const { session, loading } = useAuth();
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
    </View>
  );
}
