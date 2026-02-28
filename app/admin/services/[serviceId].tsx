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
  Switch,
  Alert,
  Pressable,
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
  is_external: boolean;
  is_active: boolean;
  order_index: number;
};

export default function AdminServiceDetail() {
  const { serviceId } = useLocalSearchParams<{ serviceId: string }>();
  const router = useRouter();

  const [service, setService] = useState<Service | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  const [nameEs, setNameEs] = useState('');
  const [shortDesc, setShortDesc] = useState('');
  const [longDesc, setLongDesc] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [isExternal, setIsExternal] = useState(false);

  useEffect(() => {
    if (!serviceId) return;
    const load = async () => {
      const { data, error } = await supabase
        .from('services')
        .select('*')
        .eq('id', serviceId)
        .maybeSingle();
      if (error) console.warn('[admin service detail]', error);
      if (data) {
        setService(data);
        populateFields(data);
      }
      setLoading(false);
    };
    load();
  }, [serviceId]);

  const populateFields = (s: Service) => {
    setNameEs(s.name_es ?? '');
    setShortDesc(s.short_description_es ?? '');
    setLongDesc(s.long_description_es ?? '');
    setImageUrl(s.image_url ?? '');
    setIsActive(s.is_active);
    setIsExternal(s.is_external);
  };

  const handleCancel = () => {
    if (service) populateFields(service);
    setIsEditing(false);
  };

  const handleSave = async () => {
    if (!service) return;
    if (!nameEs.trim()) {
      Alert.alert('Error', 'El nombre no puede estar vacío.');
      return;
    }
    setSaving(true);
    try {
      const { data, error } = await supabase
        .from('services')
        .update({
          name_es: nameEs.trim(),
          short_description_es: shortDesc.trim() || null,
          long_description_es: longDesc.trim() || null,
          image_url: imageUrl.trim() || null,
          is_active: isActive,
          is_external: isExternal,
        })
        .eq('id', service.id)
        .select()
        .single();

      if (error) throw error;
      setService(data);
      setIsEditing(false);
      Alert.alert('Guardado', 'El servicio se ha actualizado correctamente.');
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'No se pudo guardar.');
    } finally {
      setSaving(false);
    }
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
            try {
              const { error } = await supabase
                .from('services')
                .delete()
                .eq('id', service.id);
              if (error) throw error;
              router.back();
            } catch (e: any) {
              Alert.alert(
                'Error',
                e?.message ?? 'No se pudo eliminar el servicio.',
              );
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
          {/* Imagen */}
          {imageUrl ? (
            <Image source={{ uri: imageUrl }} style={styles.image} />
          ) : (
            <View style={[styles.image, styles.imagePlaceholder]}>
              <Text style={{ color: '#999', fontSize: 14 }}>Sin imagen</Text>
            </View>
          )}

          {/* Header */}
          <View style={styles.headerRow}>
            <Pressable onPress={() => router.back()} style={styles.backBtn}>
              <Text style={styles.backText}>‹ Volver</Text>
            </Pressable>
            {!isEditing && (
              <Pressable
                onPress={() => setIsEditing(true)}
                style={styles.editBtn}
              >
                <Text style={styles.editBtnText}>✏️ Editar</Text>
              </Pressable>
            )}
          </View>

          <View style={styles.content}>
            {/* Nombre */}
            <Text style={styles.label}>Nombre</Text>
            {isEditing ? (
              <TextInput
                value={nameEs}
                onChangeText={setNameEs}
                style={styles.input}
                placeholder="Nombre del servicio"
              />
            ) : (
              <Text style={styles.title}>{service.name_es}</Text>
            )}

            {/* Estado activo */}
            <View style={styles.switchRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Estado</Text>
                {isEditing ? (
                  <Text style={styles.switchDesc}>
                    {isActive
                      ? 'Visible para los usuarios'
                      : 'Oculto para los usuarios'}
                  </Text>
                ) : (
                  <View
                    style={[
                      styles.badge,
                      isActive ? styles.badgeOn : styles.badgeOff,
                    ]}
                  >
                    <Text style={styles.badgeText}>
                      {isActive ? 'Activo' : 'Desactivado'}
                    </Text>
                  </View>
                )}
              </View>
              {isEditing && (
                <Switch
                  value={isActive}
                  onValueChange={setIsActive}
                  trackColor={{ false: '#ccc', true: '#4CAF50' }}
                  thumbColor={isActive ? '#fff' : '#f4f3f4'}
                />
              )}
            </View>

            {/* Tipo externo/interno */}
            <View style={styles.switchRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Tipo</Text>
                {isEditing ? (
                  <Text style={styles.switchDesc}>
                    {isExternal ? 'Servicio exterior' : 'Dentro del camping'}
                  </Text>
                ) : (
                  <View
                    style={[
                      styles.badge,
                      isExternal ? styles.badgeExternal : styles.badgeInternal,
                    ]}
                  >
                    <Text style={styles.badgeText}>
                      {isExternal ? 'Servicio exterior' : 'Dentro del camping'}
                    </Text>
                  </View>
                )}
              </View>
              {isEditing && (
                <Switch
                  value={isExternal}
                  onValueChange={setIsExternal}
                  trackColor={{ false: '#ccc', true: '#007AFF' }}
                  thumbColor={isExternal ? '#fff' : '#f4f3f4'}
                />
              )}
            </View>

            {/* URL imagen */}
            <Text style={styles.label}>URL de imagen</Text>
            {isEditing ? (
              <TextInput
                value={imageUrl}
                onChangeText={setImageUrl}
                style={styles.input}
                placeholder="https://..."
                autoCapitalize="none"
                keyboardType="url"
              />
            ) : (
              <Text style={styles.value}>{service.image_url ?? '—'}</Text>
            )}

            {/* Descripción corta */}
            <Text style={styles.label}>Descripción corta</Text>
            {isEditing ? (
              <TextInput
                value={shortDesc}
                onChangeText={setShortDesc}
                style={[styles.input, styles.inputMultiline]}
                placeholder="Subtítulo breve (se muestra en la lista)"
                multiline
                numberOfLines={2}
              />
            ) : (
              <Text style={styles.value}>
                {service.short_description_es ?? '—'}
              </Text>
            )}

            {/* Descripción larga */}
            <Text style={styles.label}>Descripción larga</Text>
            {isEditing ? (
              <TextInput
                value={longDesc}
                onChangeText={setLongDesc}
                style={[
                  styles.input,
                  styles.inputMultiline,
                  { minHeight: 130 },
                ]}
                placeholder="Descripción completa del servicio"
                multiline
              />
            ) : (
              <Text style={styles.description}>
                {service.long_description_es ?? '—'}
              </Text>
            )}

            {/* Botones guardar/cancelar */}
            {isEditing && (
              <View style={styles.buttonRow}>
                <Pressable
                  onPress={handleSave}
                  disabled={saving}
                  style={[styles.saveBtn, saving && { opacity: 0.6 }]}
                >
                  <Text style={styles.saveBtnText}>
                    {saving ? 'Guardando…' : 'Guardar cambios'}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={handleCancel}
                  style={styles.cancelBtn}
                  disabled={saving}
                >
                  <Text style={styles.cancelBtnText}>Cancelar</Text>
                </Pressable>
              </View>
            )}

            {/* Botón eliminar */}
            <Pressable onPress={handleDelete} style={styles.deleteBtn}>
              <Text style={styles.deleteBtnText}>🗑 Eliminar servicio</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  container: { paddingBottom: 48 },
  image: {
    width: '100%',
    height: 220,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    backgroundColor: '#ddd',
  },
  imagePlaceholder: { justifyContent: 'center', alignItems: 'center' },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 14,
  },
  backBtn: { paddingVertical: 6, paddingRight: 12 },
  backText: { color: '#007AFF', fontSize: 16, fontWeight: '600' },
  editBtn: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
  },
  editBtnText: { color: 'white', fontWeight: '700', fontSize: 14 },
  content: { paddingHorizontal: 20, paddingTop: 16, gap: 8 },
  title: { fontSize: 24, fontWeight: '700', marginBottom: 8, color: '#111' },
  label: { fontSize: 13, fontWeight: '700', color: '#666', marginTop: 12 },
  value: { fontSize: 15, color: '#333', marginTop: 2 },
  description: { fontSize: 15, lineHeight: 22, color: '#444', marginTop: 2 },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 14,
    marginTop: 8,
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
  },
  switchDesc: { fontSize: 13, color: '#888', marginTop: 2 },
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    marginTop: 4,
  },
  badgeOn: { backgroundColor: '#d4edda' },
  badgeOff: { backgroundColor: '#f8d7da' },
  badgeExternal: { backgroundColor: '#d1ecf1' },
  badgeInternal: { backgroundColor: '#e8e8e8' },
  badgeText: { fontSize: 12, fontWeight: '700', color: '#333' },
  input: {
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: Platform.select({ ios: 12, android: 10 }),
    fontSize: 15,
    marginTop: 4,
    color: '#111',
  },
  inputMultiline: { textAlignVertical: 'top', paddingTop: 10 },
  buttonRow: { flexDirection: 'row', gap: 10, marginTop: 20 },
  saveBtn: {
    flex: 1,
    backgroundColor: '#007AFF',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  saveBtnText: { color: 'white', fontWeight: '800', fontSize: 15 },
  cancelBtn: {
    flex: 1,
    backgroundColor: '#eee',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  cancelBtnText: { color: '#333', fontWeight: '700', fontSize: 15 },
  deleteBtn: {
    marginTop: 20,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: '#fff0f0',
    borderWidth: 1,
    borderColor: '#ffcccc',
  },
  deleteBtnText: { color: '#cc0000', fontWeight: '700', fontSize: 15 },
});
