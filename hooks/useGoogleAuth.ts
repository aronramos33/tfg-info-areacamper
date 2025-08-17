import * as Linking from 'expo-linking';
import { useEffect, useState, useCallback } from 'react';
import { Alert } from 'react-native';
import { signInWithGoogle, handleIncomingLink } from '../lib/oauth';

export function useGoogleAuth() {
  const [loading, setLoading] = useState(false);
  const url = Linking.useURL();

  useEffect(() => {
    handleIncomingLink(url).catch(() => {});
  }, [url]);

  const signIn = useCallback(async () => {
    try {
      setLoading(true);
      await signInWithGoogle();
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'No se pudo iniciar sesión con Google');
    } finally {
      setLoading(false);
    }
  }, []);

  return { signIn, loading };
}
