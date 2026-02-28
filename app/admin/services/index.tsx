import { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Image,
  StyleSheet,
  ActivityIndicator,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import React from 'react';
import { supabase } from '../../../lib/supabase';

type Service = {
  id: string;
  name_es: string;
  short_description_es: string | null;
  image_url: string | null;
  is_external: boolean;
  is_active: boolean;
};

export default function AdminServicesIndex() {
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const router = useRouter();

  // Campos nuevo servicio
  const [newId, setNewId] = useState('');
  const [newName, setNewName] = useState('');
  const [newShortDesc, setNewShortDesc] = useState('');
  const [newLongDesc, setNewLongDesc] = useState('');
  const [newImageUrl, setNewImageUrl] = useState('');
  const [newIsActive, setNewIsActive] = useState(true);
  const [newIsExternal, setNewIsExternal] = useState(false);

  const load = async () => {
    const { data, error } = await supabase
      .from('services')
      .select('*')
      .order('order_index', { ascending: true });
    if (error) console.warn('[admin services]', error);
    setServices(data ?? []);
    setLoading(false);
  };

  useFocusEffect(
    React.useCallback(() => {
      load();
    }, []),
  );

  const resetForm = () => {
    setNewId('');
    setNewName('');
    setNewShortDesc('');
    setNewLongDesc('');
    setNewImageUrl('');
    setNewIsActive(true);
    setNewIsExternal(false);
    setShowForm(false);
  };

  const handleCreate = async () => {
    const slugId = newId.trim().toLowerCase().replace(/\s+/g, '_');

    if (!slugId) {
      Alert.alert('Error', 'El ID es obligatorio.');
      return;
    }
    if (!newName.trim()) {
      Alert.alert('Error', 'El nombre es obligatorio.');
      return;
    }

    // Comprobar que el ID no existe ya
    const existing = services.find((s) => s.id === slugId);
    if (existing) {
      Alert.alert('Error', `Ya existe un servicio con el ID "${slugId}".`);
      return;
    }

    setSaving(true);
    try {
      const maxOrder = services.reduce(
        (max, s: any) => Math.max(max, s.order_index ?? 0),
        0,
      );

      const { error } = await supabase.from('services').insert({
        id: slugId,
        name_es: newName.trim(),
        short_description_es: newShortDesc.trim() || null,
        long_description_es: newLongDesc.trim() || null,
        image_url: newImageUrl.trim() || null,
        is_active: newIsActive,
        is_external: newIsExternal,
        order_index: maxOrder + 1,
      });

      if (error) throw error;

      Alert.alert(
        'Creado',
        `El servicio "${newName.trim()}" se ha añadido correctamente.`,
      );
      resetForm();
      load();
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'No se pudo crear el servicio.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator size="large" />
      </SafeAreaView>
    );
  }

  const internal = services.filter((s) => !s.is_external);
  const external = services.filter((s) => s.is_external);

  const renderSection = (title: string, items: Service[]) => {
    if (!items.length) return null;
    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {items.map((service) => (
          <Pressable
            key={service.id}
            onPress={() => router.push(`/admin/services/${service.id}`)}
            style={({ pressed }) => [styles.card, pressed && { opacity: 0.85 }]}
          >
            {service.image_url ? (
              <Image
                source={{ uri: service.image_url }}
                style={styles.cardImage}
              />
            ) : (
              <View style={[styles.cardImage, styles.cardImagePlaceholder]}>
                <Text style={{ color: '#666', fontSize: 11 }}>IMG</Text>
              </View>
            )}
            <View style={styles.cardContent}>
              <Text style={styles.cardTitle}>{service.name_es}</Text>
              {service.short_description_es && (
                <Text style={styles.cardSubtitle} numberOfLines={2}>
                  {service.short_description_es}
                </Text>
              )}
              <View style={styles.badgeRow}>
                <View
                  style={[
                    styles.badge,
                    service.is_active ? styles.badgeOn : styles.badgeOff,
                  ]}
                >
                  <Text style={styles.badgeText}>
                    {service.is_active ? 'Activo' : 'Desactivado'}
                  </Text>
                </View>
              </View>
            </View>
            <Text style={styles.arrow}>›</Text>
          </Pressable>
        ))}
      </View>
    );
  };

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.select({ ios: 'padding', android: undefined })}
      >
        <ScrollView
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.pageTitle}>Gestión de servicios</Text>

          {renderSection('Dentro del camping', internal)}
          {renderSection('Servicios exteriores', external)}

          {/* Botón añadir */}
          {!showForm && (
            <Pressable onPress={() => setShowForm(true)} style={styles.addBtn}>
              <Text style={styles.addBtnText}>+ Añadir servicio</Text>
            </Pressable>
          )}

          {/* Formulario nuevo servicio */}
          {showForm && (
            <View style={styles.form}>
              <Text style={styles.formTitle}>Nuevo servicio</Text>

              <Text style={styles.label}>
                ID único{' '}
                <Text style={styles.labelHint}>
                  (sin espacios, p.ej: "piscina")
                </Text>
              </Text>
              <TextInput
                value={newId}
                onChangeText={setNewId}
                style={styles.input}
                placeholder="piscina"
                autoCapitalize="none"
              />

              <Text style={styles.label}>
                Nombre <Text style={styles.required}>*</Text>
              </Text>
              <TextInput
                value={newName}
                onChangeText={setNewName}
                style={styles.input}
                placeholder="Nombre del servicio"
              />

              <Text style={styles.label}>Descripción corta</Text>
              <TextInput
                value={newShortDesc}
                onChangeText={setNewShortDesc}
                style={[styles.input, styles.inputMultiline]}
                placeholder="Subtítulo breve (se muestra en la lista)"
                multiline
                numberOfLines={2}
              />

              <Text style={styles.label}>Descripción larga</Text>
              <TextInput
                value={newLongDesc}
                onChangeText={setNewLongDesc}
                style={[
                  styles.input,
                  styles.inputMultiline,
                  { minHeight: 100 },
                ]}
                placeholder="Descripción completa del servicio"
                multiline
              />

              <Text style={styles.label}>URL de imagen</Text>
              <TextInput
                value={newImageUrl}
                onChangeText={setNewImageUrl}
                style={styles.input}
                placeholder="https://..."
                autoCapitalize="none"
                keyboardType="url"
              />

              <View style={styles.switchRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>Estado inicial</Text>
                  <Text style={styles.switchDesc}>
                    {newIsActive
                      ? 'Visible para los usuarios'
                      : 'Oculto para los usuarios'}
                  </Text>
                </View>
                <Switch
                  value={newIsActive}
                  onValueChange={setNewIsActive}
                  trackColor={{ false: '#ccc', true: '#4CAF50' }}
                  thumbColor={newIsActive ? '#fff' : '#f4f3f4'}
                />
              </View>

              <View style={styles.switchRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>Tipo</Text>
                  <Text style={styles.switchDesc}>
                    {newIsExternal ? 'Servicio exterior' : 'Dentro del camping'}
                  </Text>
                </View>
                <Switch
                  value={newIsExternal}
                  onValueChange={setNewIsExternal}
                  trackColor={{ false: '#ccc', true: '#007AFF' }}
                  thumbColor={newIsExternal ? '#fff' : '#f4f3f4'}
                />
              </View>

              <View style={styles.buttonRow}>
                <Pressable
                  onPress={handleCreate}
                  disabled={saving}
                  style={[styles.saveBtn, saving && { opacity: 0.6 }]}
                >
                  <Text style={styles.saveBtnText}>
                    {saving ? 'Creando…' : 'Crear servicio'}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={resetForm}
                  disabled={saving}
                  style={styles.cancelBtn}
                >
                  <Text style={styles.cancelBtnText}>Cancelar</Text>
                </Pressable>
              </View>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  container: { paddingHorizontal: 20, paddingBottom: 48 },
  pageTitle: {
    fontSize: 24,
    fontWeight: '800',
    marginTop: 16,
    marginBottom: 20,
  },
  section: { marginBottom: 24 },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 12,
    color: '#444',
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    backgroundColor: 'white',
    borderRadius: 14,
    marginBottom: 12,
    elevation: 3,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  cardImage: {
    width: 60,
    height: 60,
    borderRadius: 10,
    marginRight: 14,
    backgroundColor: '#eee',
  },
  cardImagePlaceholder: { justifyContent: 'center', alignItems: 'center' },
  cardContent: { flex: 1 },
  cardTitle: { fontSize: 16, fontWeight: '600', marginBottom: 4 },
  cardSubtitle: { fontSize: 13, color: '#555', marginBottom: 6 },
  badgeRow: { flexDirection: 'row', gap: 6 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  badgeOn: { backgroundColor: '#d4edda' },
  badgeOff: { backgroundColor: '#f8d7da' },
  badgeText: { fontSize: 11, fontWeight: '700', color: '#333' },
  arrow: { fontSize: 26, color: '#aaa', marginLeft: 10 },

  addBtn: {
    borderWidth: 2,
    borderColor: '#007AFF',
    borderStyle: 'dashed',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  addBtnText: { color: '#007AFF', fontWeight: '700', fontSize: 16 },

  form: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 18,
    marginTop: 8,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  formTitle: { fontSize: 18, fontWeight: '800', marginBottom: 4 },
  label: { fontSize: 13, fontWeight: '700', color: '#666', marginTop: 14 },
  labelHint: { fontWeight: '400', color: '#999' },
  required: { color: 'red' },
  input: {
    backgroundColor: '#F7F8FB',
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
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#F7F8FB',
    borderRadius: 12,
    padding: 14,
    marginTop: 12,
  },
  switchDesc: { fontSize: 13, color: '#888', marginTop: 2 },
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
});
