import React, { useCallback, useState } from 'react';
import { Pressable, Text, ActivityIndicator, View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { supabase } from '../lib/supabase';

// URL de retorno para OAuth (funciona en Expo Go y builds nativas)
const redirectTo = Linking.createURL('/'); //Genera la url de retorno para el OAuth, es decir, la url a la que se redirigirá el usuario cuando termine el proceso de OAuth, en este caso es nuestra ruta raiz (index.tsx).

export const SignInButton: React.FC<{ label?: string }> = ({
  label = 'Iniciar sesión con Google',
}) => {
  const [loading, setLoading] = useState(false); //Estado para el loading
  const [error, setError] = useState<string | null>(null); //Estado para el error

  const handlePress = useCallback(async () => {
    setLoading(true); //Se pone en true para que se muestre el loading
    setError(null); //Se pone en null para que no se muestre el error
    try {
      // Inicia el flujo OAuth alojado por Supabase
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo, // importante para Expo Go, la url de retorno es la ruta raiz (index.tsx)
          skipBrowserRedirect: true,
        },
      });

      if (error) throw error; //Si hay un error, se lanza el error

      if (data?.url) {
        const result = await WebBrowser.openAuthSessionAsync(
          data.url,
          redirectTo,
        ); //Abre la ventana de autenticación de Google y espera al retorno del usuario
        if (result.type === 'success' && result.url) {
          try {
            const url = result.url;
            const search = url.includes('#')
              ? url.substring(url.indexOf('#') + 1)
              : (url.split('?')[1] ?? ''); //Si hay un #, se obtiene el código de autenticación, si no, se obtiene el código de autenticación de la url
            const params = new URLSearchParams(search); //Convierte la url en un objeto URLSearchParams, un objeto manejabñe

            const code = params.get('code') ?? undefined; //Obtiene el código de autenticación
            const accessToken = params.get('access_token') ?? undefined; //Obtiene el token de acceso
            const refreshToken = params.get('refresh_token') ?? undefined; //Obtiene el token de actualización

            if (code) {
              await supabase.auth.exchangeCodeForSession(code); //Intercambia el código de autenticación por una sesión, porque algunos proveedores no devulven la sesión si no el código de autenticación.
            } else if (accessToken && refreshToken) {
              await supabase.auth.setSession({
                access_token: accessToken,
                refresh_token: refreshToken,
              }); //Establece la sesión con los tokens de acceso y actualización
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
