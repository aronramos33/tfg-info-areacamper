// app/(auth)/sign-up.tsx
import { useState } from 'react';
import { View, Text, TextInput, Button, Alert } from 'react-native';
import { Link, useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';

export default function SignUpScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  // Registro con email + password
  const handleSignUpEmail = async () => {
    try {
      setBusy(true);
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
      });
      if (error) throw error;

      // Según ajustes del proyecto:
      // - Si confirmación por email está activada → no hay sesión todavía
      // - Si está desactivada → puede devolver session directa
      if (data.session) {
        Alert.alert('Éxito', 'Cuenta creada, sesión iniciada.');
        router.replace('/(tabs)');
      } else {
        Alert.alert(
          'Revisa tu email',
          'Te hemos enviado un enlace para confirmar la cuenta.',
        );
        router.replace('/(auth)/sign-in');
      }
    } catch (e: any) {
      Alert.alert('Error al registrar', e.message ?? String(e));
    } finally {
      setBusy(false);
    }
  };

  // Registro/login con Google (OAuth)
  const handleSignUpGoogle = async () => {
    try {
      setBusy(true);
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          // usa tu scheme definido en app.config/app.json
          redirectTo: 'tfg-info-areacamper://auth/callback',
        },
      });
      if (error) throw error;
      // Se abrirá el navegador y volverá a la app con la sesión creada
    } catch (e: any) {
      setBusy(false);
      Alert.alert('Error con Google', e.message ?? String(e));
    }
  };

  return (
    <View style={{ flex: 1, justifyContent: 'center', padding: 20, gap: 12 }}>
      <Text style={{ fontSize: 22, fontWeight: '600', marginBottom: 8 }}>
        Crear cuenta
      </Text>

      <TextInput
        placeholder="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        style={{ borderWidth: 1, borderRadius: 8, padding: 10 }}
      />
      <TextInput
        placeholder="Contraseña"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        style={{ borderWidth: 1, borderRadius: 8, padding: 10 }}
      />

      <Button
        title={busy ? 'Creando...' : 'Registrarse con email'}
        onPress={handleSignUpEmail}
        disabled={busy}
      />

      <View style={{ height: 16 }} />

      <Button
        title={busy ? 'Abriendo Google...' : 'Continuar con Google'}
        onPress={handleSignUpGoogle}
        disabled={busy}
      />

      <View style={{ height: 16 }} />
      <Link href="/(auth)/sign-in">¿Ya tienes cuenta? Inicia sesión</Link>
    </View>
  );
}
