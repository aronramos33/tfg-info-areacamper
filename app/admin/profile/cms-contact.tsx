import React, { useEffect, useState } from 'react';
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
import { supabase } from '@/lib/supabase';
import { AppAlert } from '@/components/AppAlert';
import { Ionicons } from '@expo/vector-icons';
import { colors, radii, shadow, spacing, typography } from '@/lib/theme';

export default function AdminCmsContact() {
  const router = useRouter();

  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [savedPhone, setSavedPhone] = useState('');
  const [savedEmail, setSavedEmail] = useState('');
  const [savedWhatsapp, setSavedWhatsapp] = useState('');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    void (async () => {
      const { data } = await supabase
        .from('cms_pages')
        .select('content')
        .eq('id', 'contact')
        .maybeSingle();
      if (data) {
        const c = data.content as any;
        const p = c.phone ?? '';
        const e = c.email ?? '';
        const w = c.whatsapp ?? '';
        setPhone(p); setSavedPhone(p);
        setEmail(e); setSavedEmail(e);
        setWhatsapp(w); setSavedWhatsapp(w);
      }
      setLoading(false);
    })();
  }, []);

  const handleCancel = () => {
    setPhone(savedPhone);
    setEmail(savedEmail);
    setWhatsapp(savedWhatsapp);
    setIsEditing(false);
  };

  const handleSave = async () => {
    if (!phone.trim() || !email.trim() || !whatsapp.trim()) {
      AppAlert.alert('Campos obligatorios', 'Todos los campos son obligatorios.');
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase
        .from('cms_pages')
        .update({ content: { phone: phone.trim(), email: email.trim(), whatsapp: whatsapp.trim() } })
        .eq('id', 'contact');
      if (error) throw error;
      setSavedPhone(phone.trim());
      setSavedEmail(email.trim());
      setSavedWhatsapp(whatsapp.trim());
      setIsEditing(false);
    } catch (e: any) {
      AppAlert.alert('Error', e?.message ?? 'No se pudo guardar.');
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
          <Text style={styles.headerTitle}>¿Necesitas ayuda?</Text>
          <View style={[styles.headerSide, { alignItems: 'flex-end' }]}>
            {!loading && !isEditing && (
              <Pressable onPress={() => setIsEditing(true)} hitSlop={8} style={styles.pencilBtn}>
                <Ionicons name="create-outline" size={20} color={colors.secondary} />
              </Pressable>
            )}
          </View>
        </View>

        <ScrollView
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
        >
          {!loading && (
            <>
              <Text style={styles.hint}>
                Estos datos son los que ven los usuarios en la sección de contacto.
              </Text>

              <View style={styles.card}>
                <Text style={styles.fieldLabel}>Teléfono</Text>
                {isEditing ? (
                  <TextInput
                    value={phone}
                    onChangeText={setPhone}
                    style={styles.input}
                    keyboardType="phone-pad"
                    autoCorrect={false}
                    placeholder="651496228"
                    placeholderTextColor={colors.onSurfaceVariant}
                    autoFocus
                  />
                ) : (
                  <Text style={styles.readValue}>{savedPhone || '—'}</Text>
                )}

                <View style={styles.divider} />

                <Text style={styles.fieldLabel}>Email</Text>
                {isEditing ? (
                  <TextInput
                    value={email}
                    onChangeText={setEmail}
                    style={styles.input}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    placeholder="info@areacamper.es"
                    placeholderTextColor={colors.onSurfaceVariant}
                  />
                ) : (
                  <Text style={styles.readValue}>{savedEmail || '—'}</Text>
                )}

                <View style={styles.divider} />

                <Text style={styles.fieldLabel}>WhatsApp</Text>
                {isEditing ? (
                  <TextInput
                    value={whatsapp}
                    onChangeText={setWhatsapp}
                    style={styles.input}
                    keyboardType="phone-pad"
                    autoCorrect={false}
                    placeholder="651496228"
                    placeholderTextColor={colors.onSurfaceVariant}
                  />
                ) : (
                  <Text style={styles.readValue}>{savedWhatsapp || '—'}</Text>
                )}
              </View>

              {isEditing && (
                <View style={styles.editActions}>
                  <Pressable
                    style={({ pressed }) => [styles.cancelBtn, pressed && { opacity: 0.7 }]}
                    onPress={handleCancel}
                    disabled={saving}
                  >
                    <Text style={styles.cancelBtnText}>Cancelar</Text>
                  </Pressable>
                  <Pressable
                    style={({ pressed }) => [
                      styles.saveBtn,
                      saving && { opacity: 0.6 },
                      pressed && { opacity: 0.8 },
                    ]}
                    onPress={handleSave}
                    disabled={saving}
                  >
                    <Text style={styles.saveBtnText}>
                      {saving ? 'Guardando…' : 'Guardar'}
                    </Text>
                  </Pressable>
                </View>
              )}
            </>
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
  pencilBtn: {
    width: 34, height: 34, borderRadius: radii.sm,
    backgroundColor: colors.surfaceContainerHigh,
    alignItems: 'center', justifyContent: 'center',
  },

  container: { padding: spacing.lg, paddingBottom: 40, gap: 16 },
  hint: { ...typography.bodyMd, lineHeight: 20 },

  card: {
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.lg,
    paddingBottom: 20,
    ...shadow.sm,
  },

  fieldLabel: { ...typography.labelSm, marginTop: 16, marginBottom: 6 },
  readValue: { ...typography.titleMd, color: colors.onSurface },

  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.outlineVariant,
    marginTop: 16,
  },

  input: {
    backgroundColor: colors.inputSurface,
    borderWidth: 1,
    borderColor: colors.outline,
    borderRadius: radii.sm,
    paddingHorizontal: 12,
    paddingVertical: Platform.select({ ios: 12, android: 10 }),
    ...typography.bodyLg,
    color: colors.onSurface,
  },

  editActions: { flexDirection: 'row', gap: 12 },
  cancelBtn: {
    flex: 1, borderRadius: radii.md, paddingVertical: 15,
    alignItems: 'center', backgroundColor: colors.inputSurface,
    borderWidth: 1, borderColor: colors.outline,
  },
  cancelBtnText: { ...typography.titleMd },
  saveBtn: {
    flex: 1, backgroundColor: colors.primary, borderRadius: radii.md,
    paddingVertical: 15, alignItems: 'center', ...shadow.sm,
  },
  saveBtnText: { ...typography.titleMd, color: colors.onPrimary },
});
