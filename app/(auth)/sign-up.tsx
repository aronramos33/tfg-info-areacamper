import React, { useMemo, useState } from 'react';
import { View, Text, TextInput, Button, Alert } from 'react-native';
import * as AuthSession from 'expo-auth-session';
import { supabase } from '../../lib/supabase';
import { useGoogleAuth } from '../../hooks/useGoogleAuth';
import { Link } from 'expo-router';

export default function SignUp() {
  const { signIn: continueWithGoogle, loading: loadingGoogle } =
    useGoogleAuth();

  const redirectTo = useMemo(() => AuthSession.makeRedirectUri(), []);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [info, setInfo] = useState<string | null>(null);

  const onSignUpEmail = async () => {
    try {
      setSubmitting(true);
      setInfo(null);

      if (!email || !password) {
        Alert.alert('Campos requeridos', 'Introduce email y contraseña.');
        return;
      }

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: redirectTo, // vuelve a tu app tras confirmar
          data: fullName ? { full_name: fullName } : undefined, // user_metadata opcional
        },
      });
      if (error) throw error;

      // Si en tu proyecto está activada la confirmación por email,
      // no habrá sesión todavía:
      if (!data.session) {
        setInfo('Registro creado. Revisa tu correo para confirmar la cuenta.');
      } else {
        setInfo('¡Registro correcto!');
      }
    } catch (e: any) {
      Alert.alert(
        'Error al registrar',
        e.message ?? 'No se pudo crear la cuenta',
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={{ flex: 1, padding: 20, gap: 12, justifyContent: 'center' }}>
      <Text
        style={{
          fontSize: 24,
          fontWeight: '700',
          textAlign: 'center',
          marginBottom: 8,
        }}
      >
        Crea tu cuenta
      </Text>

      <Text>Nombre (opcional)</Text>
      <TextInput
        value={fullName}
        onChangeText={setFullName}
        placeholder="Tu nombre"
        autoCapitalize="words"
        style={{
          borderWidth: 1,
          borderColor: '#ccc',
          padding: 10,
          borderRadius: 8,
        }}
      />

      <Text>Email</Text>
      <TextInput
        value={email}
        onChangeText={setEmail}
        placeholder="tu@email.com"
        keyboardType="email-address"
        autoCapitalize="none"
        style={{
          borderWidth: 1,
          borderColor: '#ccc',
          padding: 10,
          borderRadius: 8,
        }}
      />

      <Text>Contraseña</Text>
      <TextInput
        value={password}
        onChangeText={setPassword}
        placeholder="••••••••"
        secureTextEntry
        autoCapitalize="none"
        style={{
          borderWidth: 1,
          borderColor: '#ccc',
          padding: 10,
          borderRadius: 8,
          marginBottom: 8,
        }}
      />

      <Button
        title={submitting ? 'Creando...' : 'Registrarme'}
        onPress={onSignUpEmail}
        disabled={submitting}
      />

      <View style={{ height: 8 }} />

      <Button
        title={loadingGoogle ? 'Abriendo Google...' : 'Continuar con Google'}
        onPress={continueWithGoogle}
        disabled={loadingGoogle}
      />

      {info ? (
        <Text style={{ marginTop: 12, textAlign: 'center' }}>{info}</Text>
      ) : null}

      <View style={{ marginTop: 16, alignItems: 'center' }}>
        <Text>
          ¿Ya tienes cuenta? <Link href="/(auth)/sign-in">Inicia sesión</Link>
        </Text>
      </View>
    </View>
  );
}
