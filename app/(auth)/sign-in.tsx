import { useState } from 'react';
import { View, TextInput, Button, Text, Alert } from 'react-native';
import { supabase } from '@/lib/supabase';
import { Link } from 'expo-router';

export default function SignInScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // login normal con email + password
  const handleSignIn = async () => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      Alert.alert('Error', error.message);
    } else {
      Alert.alert('Éxito', 'Has iniciado sesión');
    }
  };

  // login con Google
  const handleGoogleSignIn = async () => {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: 'tfg-info-areacamper://auth/callback', // debe coincidir con tu scheme
      },
    });

    if (error) {
      Alert.alert('Error', error.message);
    } else {
      console.log('Redirigiendo a Google Auth...', data?.url);
      // Expo abrirá el navegador y volverá a tu app con el token
    }
  };

  return (
    <View style={{ flex: 1, justifyContent: 'center', padding: 20 }}>
      <Text style={{ fontSize: 20, marginBottom: 20 }}>Iniciar sesión</Text>

      <TextInput
        placeholder="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        style={{ borderWidth: 1, marginBottom: 10, padding: 8 }}
      />
      <TextInput
        placeholder="Contraseña"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        style={{ borderWidth: 1, marginBottom: 10, padding: 8 }}
      />
      <Button title="Entrar con email" onPress={handleSignIn} />

      <View style={{ marginTop: 20 }}>
        <Button title="Entrar con Google" onPress={handleGoogleSignIn} />
      </View>
      <Link href="/(auth)/sign-up">¿No tienes cuenta? Regístrate</Link>
    </View>
  );
}
