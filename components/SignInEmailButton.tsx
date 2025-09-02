import React, { useCallback, useState } from 'react';
import { Pressable, Text, ActivityIndicator, View } from 'react-native';
import { supabase } from '../lib/supabase';

type Props = {
  email: string;
  password: string;
  label?: string;
  onSuccess?: () => void; // opcional: se llama si el login fue OK
};

const SignInEmailButton: React.FC<Props> = ({
  email,
  password,
  label = 'Iniciar sesión',
  onSuccess,
}) => {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const handlePress = useCallback(async () => {
    if (!email || !password) {
      setErr('Ingresa email y contraseña');
      return;
    }
    setLoading(true);
    setErr(null);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) throw error;

      // Tu AuthProvider recibirá la sesión vía onAuthStateChange
      if (data.session) onSuccess?.();
    } catch (e: any) {
      setErr(e?.message ?? 'No se pudo iniciar sesión');
    } finally {
      setLoading(false);
    }
  }, [email, password, onSuccess]);

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

      {err ? (
        <Text style={{ color: 'crimson', marginTop: 8, textAlign: 'center' }}>
          {err}
        </Text>
      ) : null}
    </View>
  );
};

export default SignInEmailButton;
