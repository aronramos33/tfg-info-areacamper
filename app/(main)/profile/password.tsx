import React, { useMemo, useState } from 'react';
import {
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
import { colors, radii, shadow, spacing, typography } from '@/lib/theme';
import { AppAlert } from '@/components/AppAlert';

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
      AppAlert.alert('Contraseña débil', 'Usa al menos 8 caracteres.');
      return;
    }
    if (p1 !== p2) {
      AppAlert.alert('No coincide', 'Las contraseñas no coinciden.');
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: p1 });
      if (error) throw error;
      AppAlert.alert('Listo', 'Tu contraseña se ha cambiado correctamente.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (e: any) {
      AppAlert.alert('Error', e?.message ?? 'No se pudo cambiar la contraseña.');
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
                  placeholderTextColor={colors.onSurfaceVariant}
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
                  placeholderTextColor={colors.onSurfaceVariant}
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
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: 12,
    backgroundColor: colors.background,
  },
  headerSide: { width: 70 },
  headerBack: { ...typography.titleMd, color: colors.secondary },
  headerTitle: { ...typography.titleLg },
  container: { padding: spacing.lg, paddingBottom: 40, gap: 16 },
  card: {
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.lg,
    overflow: 'hidden',
    ...shadow.sm,
  },
  fieldLabel: { ...typography.labelSm, marginTop: 14 },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.outlineVariant,
    marginTop: 4,
  },
  input: {
    ...typography.bodyLg,
    paddingVertical: Platform.select({ ios: 10, android: 8 }),
    color: colors.onSurface,
  },
  saveBtn: {
    backgroundColor: colors.primary,
    borderRadius: radii.md,
    paddingVertical: 15,
    alignItems: 'center',
    ...shadow.sm,
  },
  saveBtnText: { ...typography.titleMd, color: colors.onPrimary },
  infoCard: {
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: radii.lg,
    padding: spacing.lg,
    ...shadow.sm,
  },
  infoText: { ...typography.bodyLg, lineHeight: 22 },
});
