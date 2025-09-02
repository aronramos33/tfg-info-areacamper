import React, { useCallback, useState } from 'react';
import { Text, View } from 'react-native';
import { supabase } from '../lib/supabase';
import AppButton from './AppButton';

type Props = {
  email: string;
  password: string;
  label?: string;
  onSuccess?: () => void; // opcional: callback si el registro fue exitoso
};

const SignUpEmailButton: React.FC<Props> = ({
  email,
  password,
  label = 'Registrarse',
  onSuccess,
}) => {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const handlePress = useCallback(async () => {
    if (!email || !password) {
      setErr('Debes ingresar email y contraseña');
      return;
    }

    setLoading(true);
    setErr(null);
    try {
      // 🔑 Lógica de registro con Supabase
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
      });

      if (error) throw error;

      // Si tu proyecto tiene "email confirmation" activado,
      // Supabase enviará un correo al usuario.
      if (data.user) {
        onSuccess?.();
      }
    } catch (e: any) {
      setErr(e?.message ?? 'No se pudo registrar el usuario');
    } finally {
      setLoading(false);
    }
  }, [email, password, onSuccess]);

  return (
    <View style={{ width: '100%' }}>
      <AppButton onPress={handlePress} title={label} loading={loading} />
      {err ? (
        <Text style={{ color: 'crimson', marginTop: 8, textAlign: 'center' }}>
          {err}
        </Text>
      ) : null}
    </View>
  );
};

export default SignUpEmailButton;
