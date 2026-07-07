import { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TextInput,
  Pressable,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '../../../lib/supabase';
import { pickImage, uploadServiceImage } from '../../../lib/uploadServiceImage';
import { colors, radii, shadow, spacing, typography } from '@/lib/theme';

type Tab = 'internal' | 'external';

export default function AdminServiceNew() {
  const router = useRouter();
  const { type } = useLocalSearchParams<{ type?: Tab }>();

  const [saving, setSaving] = useState(false);

  const [id, setId] = useState('');
  const [name, setName] = useState('');
  const [shortDesc, setShortDesc] = useState('');
  const [longDesc, setLongDesc] = useState('');
  const [localImageUri, setLocalImageUri] = useState<string | null>(null);
  const [isExternal, setIsExternal] = useState(type === 'external');

  const handlePickImage = async () => {
    const uri = await pickImage();
    if (uri) setLocalImageUri(uri);
  };

  const isValid =
    id.trim() && name.trim() && shortDesc.trim() && longDesc.trim();

  const handleCreate = async () => {
    if (!isValid) return;

    const cleanId = id.trim().toLowerCase().replace(/\s+/g, '_');

    const { data: existing } = await supabase
      .from('services')
      .select('id')
      .eq('id', cleanId)
      .maybeSingle();

    if (existing) {
      Alert.alert(
        'ID duplicado',
        `Ya existe un servicio con el ID "${cleanId}".`,
      );
      return;
    }

    setSaving(true);
    try {
      let resolvedImageUrl: string | null = null;
      if (localImageUri) {
        resolvedImageUrl = await uploadServiceImage(localImageUri, cleanId);
      }

      const { data: all } = await supabase
        .from('services')
        .select('order_index')
        .order('order_index', { ascending: false })
        .limit(1);
      const maxOrder = all?.[0]?.order_index ?? 0;

      const { error } = await supabase.from('services').insert({
        id: cleanId,
        name_es: name.trim(),
        short_description_es: shortDesc.trim(),
        long_description_es: longDesc.trim(),
        image_url: resolvedImageUrl,
        is_external: isExternal,
        is_active: true,
        order_index: maxOrder + 1,
      });

      if (error) throw error;

      router.back();
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'No se pudo crear el servicio.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.select({ ios: 'padding', android: undefined })}
      >
        <ScrollView
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
        >
          {/* Cabecera */}
          <View style={styles.headerRow}>
            <Pressable onPress={() => router.back()} style={styles.backBtn}>
              <Text style={styles.backText}>‹ Volver</Text>
            </Pressable>
            <Text style={styles.pageTitle}>Nuevo servicio</Text>
            <View style={{ width: 70 }} />
          </View>

          {/* Ubicación */}
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Ubicación del servicio</Text>
            <View style={styles.toggleRow}>
              <Pressable
                onPress={() => setIsExternal(false)}
                style={[
                  styles.toggleBtn,
                  !isExternal && styles.toggleBtnActive,
                ]}
              >
                <Text
                  style={[
                    styles.toggleText,
                    !isExternal && styles.toggleTextActive,
                  ]}
                >
                  Dentro del camping
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setIsExternal(true)}
                style={[styles.toggleBtn, isExternal && styles.toggleBtnActive]}
              >
                <Text
                  style={[
                    styles.toggleText,
                    isExternal && styles.toggleTextActive,
                  ]}
                >
                  Servicio exterior
                </Text>
              </Pressable>
            </View>
          </View>

          {/* Campos */}
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Información</Text>

            <Text style={styles.fieldLabel}>ID único *</Text>
            <TextInput
              value={id}
              onChangeText={setId}
              placeholder="ej: bbq, laundry, pool"
              style={[styles.input, !id.trim() && styles.inputRequired]}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Text style={styles.hint}>
              Solo letras, números y guiones bajos. Se usará como identificador
              permanente.
            </Text>

            <Text style={styles.fieldLabel}>Nombre *</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Nombre visible del servicio"
              style={[styles.input, !name.trim() && styles.inputRequired]}
              autoCapitalize="sentences"
            />

            <Text style={styles.fieldLabel}>Descripción corta *</Text>
            <TextInput
              value={shortDesc}
              onChangeText={setShortDesc}
              placeholder="Una línea descriptiva para la lista"
              style={[styles.input, !shortDesc.trim() && styles.inputRequired]}
              autoCapitalize="sentences"
            />

            <Text style={styles.fieldLabel}>Descripción larga *</Text>
            <TextInput
              value={longDesc}
              onChangeText={setLongDesc}
              placeholder="Descripción completa del servicio"
              style={[
                styles.inputMultiline,
                !longDesc.trim() && styles.inputRequired,
              ]}
              autoCapitalize="sentences"
              multiline
              numberOfLines={5}
              textAlignVertical="top"
            />

            <Text style={styles.fieldLabel}>Imagen</Text>
            <Pressable onPress={handlePickImage} style={styles.imagePicker}>
              {localImageUri ? (
                <>
                  <Image
                    source={{ uri: localImageUri }}
                    style={styles.imagePickerPreview}
                  />
                  <View style={styles.imagePickerOverlay}>
                    <Text style={styles.imagePickerOverlayText}>
                      Cambiar imagen
                    </Text>
                  </View>
                </>
              ) : (
                <View style={styles.imagePickerEmpty}>
                  <Text style={styles.imagePickerEmptyIcon}>📷</Text>
                  <Text style={styles.imagePickerEmptyText}>
                    Toca para añadir imagen
                  </Text>
                </View>
              )}
            </Pressable>
          </View>

          {/* Botón crear */}
          <Pressable
            onPress={handleCreate}
            disabled={!isValid || saving}
            style={[
              styles.btnCreate,
              (!isValid || saving) && styles.btnDisabled,
            ]}
          >
            {saving ? (
              <ActivityIndicator color={colors.onPrimary} />
            ) : (
              <Text style={styles.btnCreateText}>Crear servicio</Text>
            )}
          </Pressable>

          {!isValid && (
            <Text style={styles.requiredNote}>
              * Todos los campos marcados son obligatorios
            </Text>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  container: { padding: spacing.lg, paddingBottom: 48, gap: 14 },

  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  backBtn: { width: 70, paddingVertical: 4 },
  backText: { ...typography.titleMd, color: colors.secondary },
  pageTitle: { ...typography.headlineMd },

  card: {
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: radii.lg,
    padding: spacing.lg,
    ...shadow.sm,
    gap: 4,
  },
  sectionTitle: { ...typography.titleMd, marginBottom: 8 },

  toggleRow: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceContainerHigh,
    borderRadius: radii.md,
    padding: 4,
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: radii.sm,
    alignItems: 'center',
  },
  toggleBtnActive: {
    backgroundColor: colors.surfaceContainerLow,
    ...shadow.sm,
  },
  toggleText: { ...typography.titleSm, color: colors.onSurfaceVariant },
  toggleTextActive: { color: colors.secondary },

  fieldLabel: { ...typography.labelMd, marginTop: 12, marginBottom: 4 },
  hint: { fontSize: 11, color: colors.onSurfaceVariant, marginTop: 2, fontFamily: 'Inter_400Regular' },

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
  inputMultiline: {
    backgroundColor: colors.inputSurface,
    borderWidth: 1,
    borderColor: colors.outline,
    borderRadius: radii.sm,
    paddingHorizontal: 12,
    paddingTop: 12,
    ...typography.bodyLg,
    color: colors.onSurface,
    minHeight: 120,
  },
  inputRequired: {
    borderColor: colors.error,
    backgroundColor: colors.errorContainer,
  },

  imagePicker: {
    height: 160,
    borderRadius: radii.sm,
    overflow: 'hidden',
    backgroundColor: colors.inputSurface,
    borderWidth: 1,
    borderColor: colors.outline,
  },
  imagePickerPreview: {
    width: '100%',
    height: '100%',
  },
  imagePickerOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.overlay,
    paddingVertical: 8,
    alignItems: 'center',
  },
  imagePickerOverlayText: {
    color: colors.onPrimary,
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
  },
  imagePickerEmpty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  imagePickerEmptyIcon: { fontSize: 28 },
  imagePickerEmptyText: { ...typography.bodyMd },

  btnCreate: {
    backgroundColor: colors.primary,
    paddingVertical: 15,
    borderRadius: radii.md,
    alignItems: 'center',
    marginTop: 4,
    ...shadow.sm,
  },
  btnDisabled: { backgroundColor: colors.surfaceContainerHigh, ...shadow.sm },
  btnCreateText: { ...typography.titleMd, color: colors.onPrimary },

  requiredNote: {
    textAlign: 'center',
    ...typography.labelMd,
    marginTop: 4,
  },
});
