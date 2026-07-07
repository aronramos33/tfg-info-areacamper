import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  View,
  Text,
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Image,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../../lib/supabase';
import { AppAlert } from '../../../components/AppAlert';
import { pickImage, uploadServiceImage } from '../../../lib/uploadServiceImage';
import { Ionicons } from '@expo/vector-icons';
import { colors, radii, shadow, spacing, typography } from '@/lib/theme';

type Service = {
  id: string;
  name_es: string;
  short_description_es: string | null;
  long_description_es: string | null;
  image_url: string | null;
  is_active: boolean;
  is_external: boolean;
  order_index: number;
};

export default function AdminServiceDetail() {
  const { serviceId } = useLocalSearchParams<{ serviceId: string }>();
  const router = useRouter();

  const [service, setService] = useState<Service | null>(null);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [name, setName] = useState('');
  const [shortDesc, setShortDesc] = useState('');
  const [longDesc, setLongDesc] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [localImageUri, setLocalImageUri] = useState<string | null>(null);
  const [isExternal, setIsExternal] = useState(false);

  const handlePickImage = async () => {
    const uri = await pickImage();
    if (uri) setLocalImageUri(uri);
  };

  const handleClearImage = () => {
    setLocalImageUri(null);
    setImageUrl('');
  };

  const load = async () => {
    if (!serviceId) return;
    const { data, error } = await supabase
      .from('services')
      .select('*')
      .eq('id', serviceId)
      .maybeSingle();
    if (error) console.warn('[admin service detail]', error);
    if (data) {
      setService(data);
      setName(data.name_es);
      setShortDesc(data.short_description_es ?? '');
      setLongDesc(data.long_description_es ?? '');
      setImageUrl(data.image_url ?? '');
      setIsExternal(data.is_external);
    }
    setLoading(false);
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serviceId]);

  const handleCancelEdit = () => {
    if (!service) return;
    setName(service.name_es);
    setShortDesc(service.short_description_es ?? '');
    setLongDesc(service.long_description_es ?? '');
    setImageUrl(service.image_url ?? '');
    setLocalImageUri(null);
    setIsExternal(service.is_external);
    setIsEditing(false);
  };

  const handleSave = async () => {
    if (!service) return;
    if (!name.trim() || !shortDesc.trim() || !longDesc.trim()) {
      AppAlert.alert(
        'Campos obligatorios',
        'Nombre, descripción corta y larga son obligatorios.',
      );
      return;
    }
    setSaving(true);
    try {
      let resolvedImageUrl = imageUrl.trim() || null;
      if (localImageUri) {
        resolvedImageUrl = await uploadServiceImage(localImageUri, service.id);
      }
      const { error } = await supabase
        .from('services')
        .update({
          name_es: name.trim(),
          short_description_es: shortDesc.trim(),
          long_description_es: longDesc.trim(),
          image_url: resolvedImageUrl,
          is_external: isExternal,
        })
        .eq('id', service.id);
      if (error) throw error;
      setLocalImageUri(null);
      await load();
      setIsEditing(false);
    } catch (e: any) {
      AppAlert.alert('Error', e?.message ?? 'No se pudo guardar.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async () => {
    if (!service) return;
    const next = !service.is_active;
    AppAlert.alert(
      next ? 'Activar servicio' : 'Desactivar servicio',
      next
        ? '¿Quieres activar este servicio? Será visible para los usuarios.'
        : '¿Quieres desactivar este servicio? Dejará de ser visible para los usuarios.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: next ? 'Activar' : 'Desactivar',
          style: next ? 'default' : 'destructive',
          onPress: async () => {
            setToggling(true);
            try {
              const { error } = await supabase
                .from('services')
                .update({ is_active: next })
                .eq('id', service.id);
              if (error) throw error;
              await load();
            } catch (e: any) {
              AppAlert.alert(
                'Error',
                e?.message ?? 'No se pudo cambiar el estado.',
              );
            } finally {
              setToggling(false);
            }
          },
        },
      ],
    );
  };

  const handleDelete = () => {
    if (!service) return;
    AppAlert.alert(
      'Eliminar servicio',
      `¿Estás seguro de que quieres eliminar "${service.name_es}"? Esta acción no se puede deshacer.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              const { error } = await supabase
                .from('services')
                .delete()
                .eq('id', service.id);
              if (error) throw error;
              router.back();
            } catch (e: any) {
              AppAlert.alert('Error', e?.message ?? 'No se pudo eliminar.');
              setDeleting(false);
            }
          },
        },
      ],
    );
  };

  const hasChanges =
    isEditing &&
    service !== null &&
    (name !== service.name_es ||
      shortDesc !== (service.short_description_es ?? '') ||
      longDesc !== (service.long_description_es ?? '') ||
      imageUrl !== (service.image_url ?? '') ||
      localImageUri !== null ||
      isExternal !== service.is_external);

  const confirmDiscardIfDirty = (onDiscard: () => void) => {
    if (!hasChanges) {
      onDiscard();
      return;
    }
    AppAlert.alert(
      'Cambios sin guardar',
      '¿Quieres descartar los cambios?',
      [
        { text: 'Seguir editando', style: 'cancel' },
        { text: 'Descartar', style: 'destructive', onPress: onDiscard },
      ],
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  if (!service) {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={typography.bodyMd}>No se ha encontrado este servicio.</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
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
            <Pressable
              onPress={() =>
                isEditing
                  ? confirmDiscardIfDirty(() => router.back())
                  : router.back()
              }
              style={styles.backBtn}
            >
              <Text style={styles.backText}>‹ Volver</Text>
            </Pressable>
            <Text style={styles.pageTitle} numberOfLines={1}>
              {service.name_es}
            </Text>
            <Pressable
              onPress={() =>
                isEditing
                  ? confirmDiscardIfDirty(handleCancelEdit)
                  : setIsEditing(true)
              }
              style={styles.editBtn}
            >
              <Ionicons name={isEditing ? 'close' : 'create-outline'} size={20} color={colors.secondary} />
            </Pressable>
          </View>

          {/* Imagen */}
          {isEditing ? (
            <View style={styles.image}>
              {localImageUri || imageUrl ? (
                <>
                  <Pressable
                    onPress={handlePickImage}
                    style={StyleSheet.absoluteFill}
                  >
                    <Image
                      source={{ uri: localImageUri ?? imageUrl }}
                      style={StyleSheet.absoluteFill}
                    />
                    <View style={styles.imageEditOverlay}>
                      <Text style={styles.imageEditOverlayText}>
                        Toca para cambiar imagen
                      </Text>
                    </View>
                  </Pressable>
                  <Pressable
                    onPress={handleClearImage}
                    style={styles.imageClearBtn}
                  >
                    <Ionicons name="close" size={16} color={colors.onPrimary} />
                  </Pressable>
                </>
              ) : (
                <Pressable
                  onPress={handlePickImage}
                  style={[styles.imagePlaceholder, { flex: 1 }]}
                >
                  <Ionicons name="camera-outline" size={28} color={colors.onSurfaceVariant} />
                  <Text style={styles.imageAddText}>Toca para añadir imagen</Text>
                </Pressable>
              )}
            </View>
          ) : service.image_url ? (
            <Image source={{ uri: service.image_url }} style={styles.image} />
          ) : (
            <View style={[styles.image, styles.imagePlaceholder]}>
              <Text style={typography.bodyMd}>Sin imagen</Text>
            </View>
          )}

          {/* Contenido */}
          <View style={styles.card}>
            {/* Ubicación — toggle solo en edición */}
            {isEditing && (
              <>
                <Text style={styles.fieldLabel}>Ubicación</Text>
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
                    style={[
                      styles.toggleBtn,
                      isExternal && styles.toggleBtnActive,
                    ]}
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
              </>
            )}

            {/* Nombre */}
            <Text style={styles.fieldLabel}>Nombre</Text>
            {isEditing ? (
              <TextInput
                value={name}
                onChangeText={setName}
                style={styles.input}
                autoCapitalize="sentences"
              />
            ) : (
              <Text style={styles.fieldValue}>{service.name_es}</Text>
            )}

            {/* Descripción corta */}
            <Text style={styles.fieldLabel}>Descripción corta</Text>
            {isEditing ? (
              <TextInput
                value={shortDesc}
                onChangeText={setShortDesc}
                style={styles.input}
                autoCapitalize="sentences"
              />
            ) : (
              <Text style={styles.fieldValue}>
                {service.short_description_es || '—'}
              </Text>
            )}

            {/* Descripción larga */}
            <Text style={styles.fieldLabel}>Descripción larga</Text>
            {isEditing ? (
              <TextInput
                value={longDesc}
                onChangeText={setLongDesc}
                style={styles.inputMultiline}
                autoCapitalize="sentences"
                multiline
                numberOfLines={5}
                textAlignVertical="top"
              />
            ) : (
              <Text style={styles.fieldValue}>
                {service.long_description_es || '—'}
              </Text>
            )}

            {/* Botones guardar/cancelar en modo edición */}
            {isEditing && (
              <View style={styles.editButtons}>
                <Pressable
                  onPress={() => confirmDiscardIfDirty(handleCancelEdit)}
                  style={styles.btnCancel}
                >
                  <Text style={styles.btnCancelText}>Cancelar</Text>
                </Pressable>
                <Pressable
                  onPress={handleSave}
                  disabled={saving}
                  style={[styles.btnSave, saving && { opacity: 0.6 }]}
                >
                  {saving ? (
                    <ActivityIndicator color={colors.onPrimary} />
                  ) : (
                    <Text style={styles.btnSaveText}>Guardar cambios</Text>
                  )}
                </Pressable>
              </View>
            )}
          </View>

          {/* Acciones — activar/desactivar + eliminar */}
          {!isEditing && (
            <View style={styles.actionsCard}>
              <Pressable
                onPress={handleToggleActive}
                disabled={toggling}
                style={[
                  styles.btnToggle,
                  service.is_active ? styles.btnDeactivate : styles.btnActivate,
                  toggling && { opacity: 0.6 },
                ]}
              >
                {toggling ? (
                  <ActivityIndicator color={service.is_active ? colors.warningText : colors.confirmedText} />
                ) : (
                  <View style={styles.btnContent}>
                    <Ionicons
                      name={service.is_active ? 'pause-circle-outline' : 'play-circle-outline'}
                      size={24}
                      color={service.is_active ? colors.warningText : colors.confirmedText}
                    />
                    <Text style={[styles.btnToggleText, service.is_active ? { color: colors.warningText } : { color: colors.confirmedText }]}>
                      {service.is_active ? 'Desactivar servicio' : 'Activar servicio'}
                    </Text>
                  </View>
                )}
              </Pressable>

              <Pressable
                onPress={handleDelete}
                disabled={deleting}
                style={[styles.btnDelete, deleting && { opacity: 0.6 }]}
              >
                {deleting ? (
                  <ActivityIndicator color={colors.error} />
                ) : (
                  <View style={styles.btnContent}>
                    <Ionicons name="trash-outline" size={24} color={colors.error} />
                    <Text style={styles.btnDeleteText}>Eliminar servicio</Text>
                  </View>
                )}
              </Pressable>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background },

  container: { paddingBottom: 48 },

  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: 12,
  },
  backBtn: { width: 70 },
  backText: { ...typography.titleMd, color: colors.secondary },
  pageTitle: { flex: 1, textAlign: 'center', ...typography.titleLg },
  editBtn: {
    width: 36,
    height: 36,
    borderRadius: radii.sm,
    backgroundColor: colors.surfaceContainerHigh,
    alignItems: 'center',
    justifyContent: 'center',
  },

  image: {
    width: '100%',
    height: 220,
    backgroundColor: colors.surfaceContainerHigh,
    overflow: 'hidden',
  },
  imagePlaceholder: { justifyContent: 'center', alignItems: 'center' },
  imageClearBtn: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
  },

  imageEditOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.overlay,
    paddingVertical: 10,
    alignItems: 'center',
  },
  imageEditOverlayText: { color: colors.onPrimary, fontFamily: 'PlusJakartaSans_700Bold', fontSize: 14 },
  imageAddText: { ...typography.bodyMd, marginTop: 8 },

  card: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: radii.lg,
    padding: spacing.lg,
    ...shadow.sm,
    gap: 4,
  },

  fieldLabel: { ...typography.labelMd, marginTop: 12 },
  fieldValue: { ...typography.bodyLg, marginTop: 4, lineHeight: 22 },

  input: {
    backgroundColor: colors.inputSurface,
    borderWidth: 1,
    borderColor: colors.outline,
    borderRadius: radii.sm,
    paddingHorizontal: 12,
    paddingVertical: Platform.select({ ios: 12, android: 10 }),
    ...typography.bodyLg,
    color: colors.onSurface,
    marginTop: 4,
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
    marginTop: 4,
  },

  toggleRow: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceContainerHigh,
    borderRadius: radii.md,
    padding: 4,
    marginTop: 6,
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

  editButtons: { flexDirection: 'row', gap: 10, marginTop: 16 },
  btnSave: {
    flex: 1,
    backgroundColor: colors.primary,
    paddingVertical: 12,
    borderRadius: radii.sm,
    alignItems: 'center',
    ...shadow.sm,
  },
  btnSaveText: { ...typography.titleSm, color: colors.onPrimary },
  btnCancel: {
    flex: 1,
    backgroundColor: colors.surfaceContainerHigh,
    paddingVertical: 12,
    borderRadius: radii.sm,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.outline,
  },
  btnCancelText: { ...typography.titleSm },

  actionsCard: {
    marginHorizontal: spacing.lg,
    marginTop: 14,
    gap: 10,
  },
  btnContent: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 10,
  },
  btnToggle: {
    paddingVertical: 14,
    borderRadius: radii.md,
    alignItems: 'center',
  },
  btnActivate: { backgroundColor: colors.confirmedBg },
  btnDeactivate: { backgroundColor: colors.warningContainer },
  btnToggleText: { ...typography.titleSm, lineHeight: 24 },

  btnDelete: {
    paddingVertical: 14,
    borderRadius: radii.md,
    alignItems: 'center',
    backgroundColor: colors.errorContainer,
  },
  btnDeleteText: { ...typography.titleSm, color: colors.error, lineHeight: 24 },
});
