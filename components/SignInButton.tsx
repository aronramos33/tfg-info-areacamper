import React, { useCallback, useState } from 'react';
import { Pressable, Text, ActivityIndicator, View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { supabase } from '../lib/supabase';

// URL de retorno para OAuth (funciona en Expo Go y builds nativas)
const redirectTo = Linking.createURL('/');

export const SignInButton: React.FC<{ label?: string }> = ({
  label = 'Iniciar sesión con Google',
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handlePress = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Inicia el flujo OAuth alojado por Supabase
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo, // importante para Expo Go
          skipBrowserRedirect: true,
        },
      });

      if (error) throw error;

      if (data?.url) {
        const result = await WebBrowser.openAuthSessionAsync(
          data.url,
          redirectTo,
        );
        if (result.type === 'success' && result.url) {
          try {
            const url = result.url;
            const search = url.includes('#')
              ? url.substring(url.indexOf('#') + 1)
              : (url.split('?')[1] ?? '');
            const params = new URLSearchParams(search);

            const code = params.get('code') ?? undefined;
            const accessToken = params.get('access_token') ?? undefined;
            const refreshToken = params.get('refresh_token') ?? undefined;

            if (code) {
              await supabase.auth.exchangeCodeForSession(code);
            } else if (accessToken && refreshToken) {
              await supabase.auth.setSession({
                access_token: accessToken,
                refresh_token: refreshToken,
              });
            }
          } catch {}
        }
      }

      // Cuando el usuario vuelve desde el navegador, Supabase intercambia los tokens
      // y onAuthStateChange/ getSession() actualizarán la sesión automáticamente.
    } catch (e: any) {
      setError(e?.message ?? 'Ha ocurrido un error');
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <View style={{ width: '100%' }}>
      <Pressable
        onPress={handlePress}
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
            {label}
          </Text>
        )}
      </Pressable>
      {error ? (
        <Text style={{ color: 'crimson', marginTop: 8, textAlign: 'center' }}>
          {error}
        </Text>
      ) : null}
    </View>
  );
};

export default SignInButton;
