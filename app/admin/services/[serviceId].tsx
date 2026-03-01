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
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../../lib/supabase';

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

  // Campos editables
  const [name, setName] = useState('');
  const [shortDesc, setShortDesc] = useState('');
  const [longDesc, setLongDesc] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [isExternal, setIsExternal] = useState(false);

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
    setIsExternal(service.is_external);
    setIsEditing(false);
  };

  const handleSave = async () => {
    if (!service) return;
    if (!name.trim() || !shortDesc.trim() || !longDesc.trim()) {
      Alert.alert(
        'Campos obligatorios',
        'Nombre, descripción corta y larga son obligatorios.',
      );
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase
        .from('services')
        .update({
          name_es: name.trim(),
          short_description_es: shortDesc.trim(),
          long_description_es: longDesc.trim(),
          image_url: imageUrl.trim() || null,
          is_external: isExternal,
        })
        .eq('id', service.id);
      if (error) throw error;
      await load();
      setIsEditing(false);
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'No se pudo guardar.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async () => {
    if (!service) return;
    const next = !service.is_active;
    Alert.alert(
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
              Alert.alert(
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
    Alert.alert(
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
              Alert.alert('Error', e?.message ?? 'No se pudo eliminar.');
              setDeleting(false);
            }
          },
        },
      ],
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator size="large" />
      </SafeAreaView>
    );
  }

  if (!service) {
    return (
      <SafeAreaView style={styles.center}>
        <Text>No se ha encontrado este servicio.</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F7F8FB' }}>
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
            <Text style={styles.pageTitle} numberOfLines={1}>
              {service.name_es}
            </Text>
            <Pressable
              onPress={() =>
                isEditing ? handleCancelEdit() : setIsEditing(true)
              }
              style={styles.editBtn}
            >
              <Text style={styles.editBtnText}>{isEditing ? '✕' : '✏️'}</Text>
            </Pressable>
          </View>

          {/* Imagen */}
          {service.image_url ? (
            <Image source={{ uri: service.image_url }} style={styles.image} />
          ) : (
            <View style={[styles.image, styles.imagePlaceholder]}>
              <Text style={{ color: '#aaa' }}>Sin imagen</Text>
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

            {/* URL imagen */}
            <Text style={styles.fieldLabel}>URL de imagen</Text>
            {isEditing ? (
              <TextInput
                value={imageUrl}
                onChangeText={setImageUrl}
                style={styles.input}
                autoCapitalize="none"
                keyboardType="url"
                placeholder="https://... (opcional)"
              />
            ) : (
              <Text style={styles.fieldValue}>{service.image_url || '—'}</Text>
            )}

            {/* Botones guardar/cancelar en modo edición */}
            {isEditing && (
              <View style={styles.editButtons}>
                <Pressable
                  onPress={handleSave}
                  disabled={saving}
                  style={[styles.btnSave, saving && { opacity: 0.6 }]}
                >
                  {saving ? (
                    <ActivityIndicator color="white" />
                  ) : (
                    <Text style={styles.btnSaveText}>Guardar cambios</Text>
                  )}
                </Pressable>
                <Pressable onPress={handleCancelEdit} style={styles.btnCancel}>
                  <Text style={styles.btnCancelText}>Cancelar</Text>
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
                <Text style={styles.btnToggleText}>
                  {toggling
                    ? 'Cambiando…'
                    : service.is_active
                      ? '⏸ Desactivar servicio'
                      : '▶ Activar servicio'}
                </Text>
              </Pressable>

              <Pressable
                onPress={handleDelete}
                disabled={deleting}
                style={[styles.btnDelete, deleting && { opacity: 0.6 }]}
              >
                <Text style={styles.btnDeleteText}>
                  {deleting ? 'Eliminando…' : '🗑 Eliminar servicio'}
                </Text>
              </Pressable>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  container: { paddingBottom: 48 },

  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backBtn: { width: 70 },
  backText: { color: '#007AFF', fontSize: 16, fontWeight: '600' },
  pageTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '700',
    color: '#111',
  },
  editBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#eaeaea',
    alignItems: 'center',
    justifyContent: 'center',
  },
  editBtnText: { fontSize: 16 },

  image: {
    width: '100%',
    height: 220,
    backgroundColor: '#eee',
  },
  imagePlaceholder: { justifyContent: 'center', alignItems: 'center' },

  card: {
    marginHorizontal: 16,
    marginTop: 16,
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.07,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    gap: 4,
  },

  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#888',
    marginTop: 12,
  },
  fieldValue: {
    fontSize: 15,
    color: '#111',
    marginTop: 4,
    lineHeight: 22,
  },

  input: {
    backgroundColor: '#F7F8FB',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: Platform.select({ ios: 12, android: 10 }),
    fontSize: 15,
    color: '#111',
    marginTop: 4,
  },
  inputMultiline: {
    backgroundColor: '#F7F8FB',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingTop: 12,
    fontSize: 15,
    color: '#111',
    minHeight: 120,
    marginTop: 4,
  },

  toggleRow: {
    flexDirection: 'row',
    backgroundColor: '#e8eaf0',
    borderRadius: 12,
    padding: 4,
    marginTop: 6,
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  toggleBtnActive: {
    backgroundColor: 'white',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  toggleText: { fontSize: 13, fontWeight: '600', color: '#888' },
  toggleTextActive: { color: '#007AFF' },

  editButtons: { flexDirection: 'row', gap: 10, marginTop: 16 },
  btnSave: {
    flex: 1,
    backgroundColor: '#007AFF',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  btnSaveText: { color: 'white', fontWeight: '700', fontSize: 14 },
  btnCancel: {
    flex: 1,
    backgroundColor: '#f0f0f0',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  btnCancelText: { color: '#333', fontWeight: '700', fontSize: 14 },

  actionsCard: {
    marginHorizontal: 16,
    marginTop: 14,
    gap: 10,
  },
  btnToggle: {
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
  },
  btnActivate: { backgroundColor: '#e8f5e9' },
  btnDeactivate: { backgroundColor: '#fff3e0' },
  btnToggleText: { fontWeight: '700', fontSize: 15, color: '#333' },

  btnDelete: {
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    backgroundColor: '#ffebee',
  },
  btnDeleteText: { fontWeight: '700', fontSize: 15, color: '#c62828' },
});
