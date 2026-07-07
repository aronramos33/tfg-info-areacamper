import React, { useCallback, useState } from 'react';
import { Pressable, Text, ActivityIndicator, View, StyleSheet } from 'react-native';
import { supabase } from '../lib/supabase';
import { colors, radii, shadow, typography } from '@/lib/theme';

type Props = {
  email: string;
  password: string;
  label?: string;
  onSuccess?: () => void;
  disabled?: boolean;
};

const SignInEmailButton: React.FC<Props> = ({
  email,
  password,
  label = 'Iniciar sesión',
  onSuccess,
  disabled = false,
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
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
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
        disabled={loading || disabled}
        style={({ pressed }) => [styles.btn, { opacity: pressed || loading || disabled ? 0.5 : 1 }]}
      >
        {loading
          ? <ActivityIndicator color={colors.onPrimary} />
          : <Text style={styles.btnText}>{label}</Text>
        }
      </Pressable>

      {err ? <Text style={styles.error}>{err}</Text> : null}
    </View>
  );
};

const styles = StyleSheet.create({
  btn: {
    backgroundColor: colors.primary,
    paddingVertical: 15,
    paddingHorizontal: 16,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.sm,
  },
  btnText: {
    ...typography.titleMd,
    color: colors.onPrimary,
  },
  error: {
    ...typography.bodyMd,
    color: colors.error,
    marginTop: 8,
    textAlign: 'center',
  },
});

export default SignInEmailButton;
