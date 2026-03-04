import React, { useCallback, useState } from 'react';
import {
  Text,
  View,
  Pressable,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { supabase } from '../lib/supabase';

const redirectTo = Linking.createURL('/');

export const SignInButton: React.FC<{ label?: string }> = ({
  label = 'Continuar con Google',
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handlePress = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo,
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
    } catch (e: any) {
      setError(e?.message ?? 'Ha ocurrido un error');
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <View>
      <Pressable
        onPress={handlePress}
        disabled={loading}
        style={({ pressed }) => [
          styles.btn,
          pressed && { opacity: 0.85 },
          loading && { opacity: 0.7 },
        ]}
      >
        {loading ? (
          <ActivityIndicator color="#444" />
        ) : (
          <>
            {/* Logo Google SVG como texto unicode — o puedes poner una Image */}
            <GoogleLogo />
            <Text style={styles.btnText}>{label}</Text>
          </>
        )}
      </Pressable>

      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
};

function GoogleLogo() {
  const Svg = require('react-native-svg').Svg;
  const Path = require('react-native-svg').Path;

  return (
    <Svg width={22} height={22} viewBox="0 0 48 48">
      <Path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <Path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <Path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <Path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
      <Path fill="none" d="M0 0h48v48H0z" />
    </Svg>
  );
}

const styles = StyleSheet.create({
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#dadce0',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 12,
    // sombra suave
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  btnText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#3c4043',
  },
  logoWrapper: {
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  error: {
    color: 'crimson',
    marginTop: 8,
    textAlign: 'center',
    fontSize: 13,
  },
});

export default SignInButton;
