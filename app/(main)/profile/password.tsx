import React, { useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuth } from '@/providers/AuthProvider';
import { supabase } from '@/lib/supabase';

export default function ProfilePassword() {
  const { session } = useAuth();
  const router = useRouter();

  const [newPassword, setNewPassword] = useState('');
  const [repeatPassword, setRepeatPassword] = useState('');
  const [saving, setSaving] = useState(false);

  const isEmailProvider = useMemo(() => {
    const user = session?.user;
    const p1 = user?.app_metadata?.provider as string | undefined;
    const p2 = Array.isArray(user?.app_metadata?.providers)
      ? (user?.app_metadata?.providers?.[0] as string | undefined)
      : undefined;
    return (p1 ?? p2 ?? 'unknown') === 'email';
  }, [session?.user?.app_metadata]);

  const handleChange = async () => {
    const p1 = newPassword.trim();
    const p2 = repeatPassword.trim();
    if (p1.length < 8) {
      Alert.alert('Contraseña débil', 'Usa al menos 8 caracteres.');
      return;
    }
    if (p1 !== p2) {
      Alert.alert('No coincide', 'Las contraseñas no coinciden.');
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: p1 });
      if (error) throw error;
      Alert.alert('Listo', 'Tu contraseña se ha cambiado correctamente.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'No se pudo cambiar la contraseña.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.select({ ios: 'padding', android: undefined })}
      >
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={8} style={styles.headerSide}>
            <Text style={styles.headerBack}>‹ Atrás</Text>
          </Pressable>
          <Text style={styles.headerTitle}>Contraseña</Text>
          <View style={styles.headerSide} />
        </View>

        <ScrollView
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
        >
          {isEmailProvider ? (
            <>
              <View style={styles.card}>
                <Text style={styles.fieldLabel}>Nueva contraseña</Text>
                <TextInput
                  value={newPassword}
                  onChangeText={setNewPassword}
                  placeholder="Mínimo 8 caracteres"
                  style={styles.input}
                  secureTextEntry
                  autoCapitalize="none"
                />
                <View style={styles.divider} />
                <Text style={styles.fieldLabel}>Repetir contraseña</Text>
                <TextInput
                  value={repeatPassword}
                  onChangeText={setRepeatPassword}
                  placeholder="Repite la nueva contraseña"
                  style={styles.input}
                  secureTextEntry
                  autoCapitalize="none"
                />
              </View>

              <Pressable
                style={({ pressed }) => [
                  styles.saveBtn,
                  saving && { opacity: 0.6 },
                  pressed && { opacity: 0.8 },
                ]}
                onPress={handleChange}
                disabled={saving}
              >
                <Text style={styles.saveBtnText}>
                  {saving ? 'Cambiando…' : 'Cambiar contraseña'}
                </Text>
              </Pressable>
            </>
          ) : (
            <View style={styles.infoCard}>
              <Text style={styles.infoText}>
                Tu cuenta está vinculada con Google. Para cambiar tu contraseña,
                hazlo desde tu cuenta de Google.
              </Text>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f2f2f7' },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e0e0e0',
  },
  headerSide: { width: 70 },
  headerBack: { color: '#007AFF', fontSize: 16 },
  headerTitle: { fontSize: 17, fontWeight: '600', color: '#111' },
  container: { padding: 20, paddingBottom: 40, gap: 16 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 16,
    overflow: 'hidden',
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#888',
    marginTop: 14,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#e0e0e0',
    marginTop: 4,
  },
  input: {
    fontSize: 16,
    paddingVertical: Platform.select({ ios: 10, android: 8 }),
    color: '#111',
  },
  saveBtn: {
    backgroundColor: '#007AFF',
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
  },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  infoCard: { backgroundColor: '#fff', borderRadius: 12, padding: 16 },
  infoText: { fontSize: 15, color: '#555', lineHeight: 22 },
});
