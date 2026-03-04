import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
} from 'react-native';
import { useAuth } from '@/providers/AuthProvider';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';

export default function SignUpScreen() {
  const { session } = useAuth();
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [repeatPassword, setRepeatPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [dni, setDni] = useState('');
  const [phone, setPhone] = useState('');
  const [licensePlate, setLicensePlate] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (session) router.replace('/');
  }, [router, session]);

  const handleSignUp = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert(
        'Campos requeridos',
        'El email y la contraseña son obligatorios.',
      );
      return;
    }
    if (!firstName.trim() || !lastName.trim()) {
      Alert.alert(
        'Campos requeridos',
        'El nombre y el apellido son obligatorios.',
      );
      return;
    }
    if (!dni.trim()) {
      Alert.alert('Campos requeridos', 'El DNI/NIE es obligatorio.');
      return;
    }
    if (password.length < 8) {
      Alert.alert('Contraseña débil', 'Usa al menos 8 caracteres.');
      return;
    }
    if (password !== repeatPassword) {
      Alert.alert('Contraseñas distintas', 'Las contraseñas no coinciden.');
      return;
    }

    setLoading(true);
    try {
      const fullName = `${firstName.trim()} ${lastName.trim()}`;

      const { data, error } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password,
        options: { data: { full_name: fullName } },
      });

      if (error) throw error;

      if (data.user) {
        const { error: profileError } = await supabase
          .from('user_profiles')
          .upsert(
            {
              user_id: data.user.id,
              full_name: fullName,
              dni: dni.trim().toUpperCase() || null,
              phone: phone.trim() || null,
              license_plate: licensePlate.trim().toUpperCase() || null,
            },
            { onConflict: 'user_id' },
          );

        if (profileError) console.warn('[sign-up] profile error', profileError);
      }

      Alert.alert(
        '¡Cuenta creada!',
        'Revisa tu email para confirmar tu cuenta antes de iniciar sesión.',
        [{ text: 'OK', onPress: () => router.replace('/(auth)/sign-in') }],
      );
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'No se pudo crear la cuenta.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.select({ ios: 'padding', android: undefined })}
    >
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <Text style={styles.backText}>‹ Iniciar sesión</Text>
          </Pressable>
          <Text style={styles.title}>Crear cuenta</Text>
          <Text style={styles.subtitle}>
            Rellena tus datos para registrarte
          </Text>
        </View>

        {/* Cuenta */}
        <Text style={styles.sectionLabel}>CUENTA</Text>
        <View style={styles.form}>
          <View style={styles.field}>
            <Text style={styles.label}>Email *</Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="tucorreo@ejemplo.com"
              autoCapitalize="none"
              keyboardType="email-address"
              autoCorrect={false}
              style={styles.input}
              placeholderTextColor="#aaa"
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Contraseña * (mín. 8 caracteres)</Text>
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••"
              secureTextEntry
              style={styles.input}
              placeholderTextColor="#aaa"
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Repetir contraseña *</Text>
            <TextInput
              value={repeatPassword}
              onChangeText={setRepeatPassword}
              placeholder="••••••••"
              secureTextEntry
              style={styles.input}
              placeholderTextColor="#aaa"
            />
          </View>
        </View>

        {/* Datos personales */}
        <Text style={[styles.sectionLabel, { marginTop: 24 }]}>
          DATOS PERSONALES
        </Text>
        <View style={styles.form}>
          <View style={styles.row}>
            <View style={[styles.field, { flex: 1 }]}>
              <Text style={styles.label}>Nombre *</Text>
              <TextInput
                value={firstName}
                onChangeText={setFirstName}
                placeholder="Juan"
                autoCapitalize="words"
                style={styles.input}
                placeholderTextColor="#aaa"
              />
            </View>
            <View style={{ width: 12 }} />
            <View style={[styles.field, { flex: 1 }]}>
              <Text style={styles.label}>Apellido *</Text>
              <TextInput
                value={lastName}
                onChangeText={setLastName}
                placeholder="García"
                autoCapitalize="words"
                style={styles.input}
                placeholderTextColor="#aaa"
              />
            </View>
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>DNI / NIE *</Text>
            <TextInput
              value={dni}
              onChangeText={setDni}
              placeholder="12345678Z"
              autoCapitalize="characters"
              style={styles.input}
              placeholderTextColor="#aaa"
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Teléfono (opcional)</Text>
            <TextInput
              value={phone}
              onChangeText={setPhone}
              placeholder="+34 600 000 000"
              keyboardType="phone-pad"
              style={styles.input}
              placeholderTextColor="#aaa"
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Matrícula (opcional)</Text>
            <TextInput
              value={licensePlate}
              onChangeText={setLicensePlate}
              placeholder="1234ABC"
              autoCapitalize="characters"
              style={styles.input}
              placeholderTextColor="#aaa"
            />
          </View>
        </View>

        <Pressable
          onPress={handleSignUp}
          disabled={loading}
          style={({ pressed }) => [
            styles.submitBtn,
            (pressed || loading) && { opacity: 0.7 },
          ]}
        >
          <Text style={styles.submitText}>
            {loading ? 'Creando cuenta…' : 'Crear cuenta'}
          </Text>
        </Pressable>

        <View style={styles.footer}>
          <Text style={styles.footerText}>¿Ya tienes cuenta? </Text>
          <Pressable onPress={() => router.replace('/(auth)/sign-in')}>
            <Text style={styles.footerLink}>Inicia sesión</Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    paddingHorizontal: 28,
    paddingTop: 60,
    paddingBottom: 48,
    backgroundColor: '#fff',
  },
  header: {
    marginBottom: 28,
  },
  backBtn: {
    marginBottom: 20,
  },
  backText: {
    fontSize: 15,
    color: '#1a73e8',
    fontWeight: '600',
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    color: '#111',
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 16,
    color: '#888',
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#aaa',
    letterSpacing: 1,
    marginBottom: 12,
  },
  form: {
    gap: 14,
    marginBottom: 8,
  },
  field: {
    gap: 6,
  },
  row: {
    flexDirection: 'row',
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#444',
  },
  input: {
    backgroundColor: '#F7F8FB',
    borderWidth: 1,
    borderColor: '#e5e5e5',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: Platform.select({ ios: 14, android: 12 }),
    fontSize: 16,
    color: '#111',
  },
  submitBtn: {
    backgroundColor: '#1a73e8',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 28,
  },
  submitText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '700',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 24,
  },
  footerText: {
    fontSize: 14,
    color: '#888',
  },
  footerLink: {
    fontSize: 14,
    color: '#1a73e8',
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
});
