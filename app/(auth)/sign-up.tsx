import React, { useEffect, useState } from 'react';
import { View, Text, TextInput } from 'react-native';
import SignInButton from '@/components/SignInButton';
import { useAuth } from '@/providers/AuthProvider';
import { useRouter } from 'expo-router';
import SignUpEmailButton from '@/components/SignUpEmailButton';

export default function PantallaSignIn() {
  const { session } = useAuth();
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  useEffect(() => {
    if (session) {
      router.replace('/');
    }
  }, [router, session]);

  return (
    <View style={{ flex: 1, padding: 24, gap: 16, justifyContent: 'center' }}>
      <Text style={{ fontSize: 24, fontWeight: '700', textAlign: 'center' }}>
        SignIn
      </Text>
      <Text style={{ fontSize: 16, marginBottom: 8 }}>Email</Text>
      <TextInput
        placeholder="yzx@gmail.com"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        style={{
          borderWidth: 1,
          borderColor: '#ccc',
          padding: 8,
          borderRadius: 4,
        }}
      />
      <Text style={{ fontSize: 16, marginBottom: 8 }}>Contraseña</Text>
      <TextInput
        placeholder="Contraseña"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        style={{
          borderWidth: 1,
          borderColor: '#ccc',
          padding: 8,
          borderRadius: 4,
        }}
      />
      <SignUpEmailButton email={email} password={password} />
      <SignInButton />
    </View>
  );
} //Este componente es el que se encarga de mostrar la pantalla de registro.
