import React, { useState } from 'react';
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
import { useRouter } from 'expo-router';
import SignInEmailButton from '@/components/SignInEmailButton';
import SignInButton from '@/components/SignInButton';
import { supabase } from '@/lib/supabase';

type Tab = 'signin' | 'signup';

export default function AuthScreen() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>('signin');

  // Sign in
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // Sign up
  const [suEmail, setSuEmail] = useState('');
  const [suPassword, setSuPassword] = useState('');
  const [suRepeat, setSuRepeat] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [dni, setDni] = useState('');
  const [phone, setPhone] = useState('');
  const [licensePlate, setLicensePlate] = useState('');
  const [signUpLoading, setSignUpLoading] = useState(false);

  const handleSignUp = async () => {
    if (!suEmail.trim() || !suPassword.trim()) {
      Alert.alert('Campos requeridos', 'El email y la contraseña son obligatorios.');
      return;
    }
    if (!firstName.trim() || !lastName.trim()) {
      Alert.alert('Campos requeridos', 'El nombre y el apellido son obligatorios.');
      return;
    }
    if (!dni.trim()) {
      Alert.alert('Campos requeridos', 'El DNI/NIE es obligatorio.');
      return;
    }
    if (suPassword.length < 8) {
      Alert.alert('Contraseña débil', 'Usa al menos 8 caracteres.');
      return;
    }
    if (suPassword !== suRepeat) {
      Alert.alert('Contraseñas distintas', 'Las contraseñas no coinciden.');
      return;
    }

    setSignUpLoading(true);
    try {
      const fullName = `${firstName.trim()} ${lastName.trim()}`;
      const { data, error } = await supabase.auth.signUp({
        email: suEmail.trim().toLowerCase(),
        password: suPassword,
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
        [{ text: 'OK', onPress: () => setActiveTab('signin') }],
      );
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'No se pudo crear la cuenta.');
    } finally {
      setSignUpLoading(false);
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
          <Text style={styles.title}>Àrea Camper</Text>
          <Text style={styles.subtitle}>Tu acceso al área</Text>
        </View>

        <SignInButton />

        <View style={styles.divider}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>o continúa con email</Text>
          <View style={styles.dividerLine} />
        </View>

        <View style={styles.tabs}>
          <Pressable
            style={[styles.tab, activeTab === 'signin' && styles.tabActive]}
            onPress={() => setActiveTab('signin')}
          >
            <Text style={[styles.tabText, activeTab === 'signin' && styles.tabTextActive]}>
              Iniciar sesión
            </Text>
          </Pressable>
          <Pressable
            style={[styles.tab, activeTab === 'signup' && styles.tabActive]}
            onPress={() => setActiveTab('signup')}
          >
            <Text style={[styles.tabText, activeTab === 'signup' && styles.tabTextActive]}>
              Registrarse
            </Text>
          </Pressable>
        </View>

        {activeTab === 'signin' ? (
          <View style={styles.form}>
            <View style={styles.field}>
              <Text style={styles.label}>Email</Text>
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
              <Text style={styles.label}>Contraseña</Text>
              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder="••••••••"
                secureTextEntry
                style={styles.input}
                placeholderTextColor="#aaa"
              />
            </View>
            <SignInEmailButton email={email} password={password} />
          </View>
        ) : (
          <View style={styles.form}>
            <Text style={styles.sectionLabel}>CUENTA</Text>
            <View style={styles.field}>
              <Text style={styles.label}>Email *</Text>
              <TextInput
                value={suEmail}
                onChangeText={setSuEmail}
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
                value={suPassword}
                onChangeText={setSuPassword}
                placeholder="••••••••"
                secureTextEntry
                style={styles.input}
                placeholderTextColor="#aaa"
              />
            </View>
            <View style={styles.field}>
              <Text style={styles.label}>Repetir contraseña *</Text>
              <TextInput
                value={suRepeat}
                onChangeText={setSuRepeat}
                placeholder="••••••••"
                secureTextEntry
                style={styles.input}
                placeholderTextColor="#aaa"
              />
            </View>

            <Text style={[styles.sectionLabel, { marginTop: 16 }]}>DATOS PERSONALES</Text>
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
            <Pressable
              onPress={handleSignUp}
              disabled={signUpLoading}
              style={({ pressed }) => [
                styles.submitBtn,
                (pressed || signUpLoading) && { opacity: 0.7 },
              ]}
            >
              <Text style={styles.submitText}>
                {signUpLoading ? 'Creando cuenta…' : 'Crear cuenta'}
              </Text>
            </Pressable>
          </View>
        )}

        <Pressable
          onPress={() => router.replace('/(main)/services')}
          style={{ alignItems: 'center', paddingTop: 28, paddingBottom: 4 }}
        >
          <Text style={{ fontSize: 14, color: '#bbb', fontWeight: '500' }}>
            Continuar sin cuenta
          </Text>
        </Pressable>
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
    alignItems: 'center',
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
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginVertical: 16,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#e5e5e5',
  },
  dividerText: {
    fontSize: 13,
    color: '#aaa',
    fontWeight: '500',
  },
  tabs: {
    flexDirection: 'row',
    borderRadius: 12,
    backgroundColor: '#F7F8FB',
    padding: 4,
    marginBottom: 20,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  tabActive: {
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#888',
  },
  tabTextActive: {
    color: '#111',
  },
  form: {
    gap: 14,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#aaa',
    letterSpacing: 1,
    marginBottom: 4,
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
    marginTop: 8,
  },
  submitText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '700',
  },
});
