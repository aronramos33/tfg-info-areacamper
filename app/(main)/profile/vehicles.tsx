import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
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
import { Stack, useRouter } from 'expo-router';

import { useAuth } from '@/providers/AuthProvider';
import RequireAuthCard from '@/components/RequireAuthCard';
import { supabase } from '@/lib/supabase';
import {
  Vehicle,
  isValidSpanishPlate,
  normalizePlate,
  vehicleDisplayName,
} from '@/components/utils/vehicle';

type FormState = {
  brand: string;
  model: string;
  plate: string;
  alias: string;
};

const EMPTY_FORM: FormState = {
  brand: '',
  model: '',
  plate: '',
  alias: '',
};

export default function VehiclesScreen() {
  const { session } = useAuth();
  const router = useRouter();
  const userId = session?.user?.id;

  const [loading, setLoading] = useState(true);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [editingId, setEditingId] = useState<number | 'new' | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const loadVehicles = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('vehicles')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: true });
    if (error) {
      console.warn('[loadVehicles]', error);
      Alert.alert('Error', 'No se pudieron cargar tus vehículos.');
    } else {
      setVehicles((data ?? []) as Vehicle[]);
    }
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    void loadVehicles();
  }, [loadVehicles]);

  const setField = (key: keyof FormState, value: string) =>
    setForm((p) => ({ ...p, [key]: value }));

  const startNew = () => {
    setForm(EMPTY_FORM);
    setEditingId('new');
  };

  const startEdit = (v: Vehicle) => {
    setForm({
      brand: v.brand,
      model: v.model,
      plate: v.plate,
      alias: v.alias ?? '',
    });
    setEditingId(v.id);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
  };

  const validateForm = (): string | null => {
    if (!form.brand.trim()) return 'La marca es obligatoria.';
    if (!form.model.trim()) return 'El modelo es obligatorio.';
    if (!form.plate.trim()) return 'La matrícula es obligatoria.';
    if (!isValidSpanishPlate(form.plate))
      return 'Matrícula inválida. Formato esperado: 1234ABC.';
    return null;
  };

  const handleSave = async () => {
    if (!userId) return;
    const err = validateForm();
    if (err) {
      Alert.alert('Datos inválidos', err);
      return;
    }
    setSaving(true);
    const payload = {
      user_id: userId,
      brand: form.brand.trim(),
      model: form.model.trim(),
      plate: normalizePlate(form.plate),
      alias: form.alias.trim() || null,
      length_m: null,
    };
    try {
      if (editingId === 'new') {
        const { error } = await supabase.from('vehicles').insert(payload);
        if (error) {
          if ((error as any).code === '23505') {
            Alert.alert(
              'Matrícula duplicada',
              'Ya tienes un vehículo con esa matrícula.',
            );
            return;
          }
          throw error;
        }
      } else if (typeof editingId === 'number') {
        const { error } = await supabase
          .from('vehicles')
          .update(payload)
          .eq('id', editingId);
        if (error) {
          if ((error as any).code === '23505') {
            Alert.alert(
              'Matrícula duplicada',
              'Ya tienes otro vehículo con esa matrícula.',
            );
            return;
          }
          throw error;
        }
      }
      cancelEdit();
      await loadVehicles();
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'No se pudo guardar el vehículo.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (v: Vehicle) => {
    Alert.alert(
      'Eliminar vehículo',
      `¿Seguro que quieres eliminar ${vehicleDisplayName(v)}?\n\nLas reservas históricas conservarán los datos del vehículo.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            const { error } = await supabase
              .from('vehicles')
              .delete()
              .eq('id', v.id);
            if (error) {
              Alert.alert('Error', error.message);
              return;
            }
            await loadVehicles();
          },
        },
      ],
    );
  };

  if (!session) return <RequireAuthCard />;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <Stack.Screen options={{ title: 'Mis vehículos' }} />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.select({ ios: 'padding', android: undefined })}
      >
        <ScrollView
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.headerRow}>
            <Pressable onPress={() => router.back()} style={styles.backBtn}>
              <Text style={styles.backText}>‹ Atrás</Text>
            </Pressable>
            <Text style={styles.title}>Mis vehículos</Text>
          </View>

          {loading ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator />
              <Text style={{ marginLeft: 10 }}>Cargando…</Text>
            </View>
          ) : (
            <>
              {vehicles.length === 0 && editingId !== 'new' && (
                <View style={styles.emptyCard}>
                  <Text style={styles.emptyTitle}>
                    Todavía no tienes vehículos
                  </Text>
                  <Text style={styles.emptyText}>
                    Añade los vehículos que vayas a usar para acampar. Podrás
                    elegir uno cuando hagas una reserva.
                  </Text>
                </View>
              )}

              {vehicles.map((v) => {
                const isEditing = editingId === v.id;
                return (
                  <View key={v.id} style={styles.card}>
                    {isEditing ? (
                      <VehicleForm
                        form={form}
                        setField={setField}
                        saving={saving}
                        onCancel={cancelEdit}
                        onSave={handleSave}
                      />
                    ) : (
                      <>
                        <Text style={styles.vehicleName}>
                          {vehicleDisplayName(v)}
                        </Text>
                        <Text style={styles.vehicleMeta}>
                          {v.brand} {v.model}
                        </Text>
                        <Text style={styles.plate}>{v.plate}</Text>
                        <View style={styles.rowButtons}>
                          <Pressable
                            onPress={() => startEdit(v)}
                            style={[styles.actionBtn, styles.editAction]}
                            disabled={editingId !== null}
                          >
                            <Text style={styles.actionText}>Editar</Text>
                          </Pressable>
                          <Pressable
                            onPress={() => handleDelete(v)}
                            style={[styles.actionBtn, styles.deleteAction]}
                            disabled={editingId !== null}
                          >
                            <Text
                              style={[styles.actionText, { color: '#c0392b' }]}
                            >
                              Eliminar
                            </Text>
                          </Pressable>
                        </View>
                      </>
                    )}
                  </View>
                );
              })}

              {editingId === 'new' ? (
                <View style={styles.card}>
                  <Text style={styles.formTitle}>Nuevo vehículo</Text>
                  <VehicleForm
                    form={form}
                    setField={setField}
                    saving={saving}
                    onCancel={cancelEdit}
                    onSave={handleSave}
                  />
                </View>
              ) : (
                <Pressable
                  onPress={startNew}
                  disabled={editingId !== null}
                  style={[
                    styles.addBtn,
                    editingId !== null && { opacity: 0.4 },
                  ]}
                >
                  <Text style={styles.addBtnText}>+ Añadir vehículo</Text>
                </Pressable>
              )}
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function VehicleForm({
  form,
  setField,
  saving,
  onCancel,
  onSave,
}: {
  form: FormState;
  setField: (key: keyof FormState, value: string) => void;
  saving: boolean;
  onCancel: () => void;
  onSave: () => void;
}) {
  return (
    <View style={{ gap: 8 }}>
      <Text style={styles.label}>Marca *</Text>
      <TextInput
        value={form.brand}
        onChangeText={(t) => setField('brand', t)}
        placeholder="Mercedes, Volkswagen…"
        style={styles.input}
        autoCapitalize="words"
      />

      <Text style={styles.label}>Modelo *</Text>
      <TextInput
        value={form.model}
        onChangeText={(t) => setField('model', t)}
        placeholder="Marco Polo, California…"
        style={styles.input}
      />

      <Text style={styles.label}>Matrícula *</Text>
      <TextInput
        value={form.plate}
        onChangeText={(t) => setField('plate', t)}
        placeholder="1234ABC"
        style={styles.input}
        autoCapitalize="characters"
        autoCorrect={false}
      />

      <Text style={styles.label}>Alias / apodo</Text>
      <TextInput
        value={form.alias}
        onChangeText={(t) => setField('alias', t)}
        placeholder="La furgo grande"
        style={styles.input}
      />

      <View style={[styles.rowButtons, { marginTop: 12 }]}>
        <Pressable
          onPress={onCancel}
          disabled={saving}
          style={[styles.actionBtn, styles.cancelAction, { flex: 1 }]}
        >
          <Text style={styles.actionText}>Cancelar</Text>
        </Pressable>
        <Pressable
          onPress={onSave}
          disabled={saving}
          style={[styles.actionBtn, styles.saveAction, { flex: 1 }]}
        >
          <Text style={[styles.actionText, { color: 'white' }]}>
            {saving ? 'Guardando…' : 'Guardar'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  container: { padding: 16, paddingBottom: 40, gap: 14 },
  headerRow: { gap: 6 },
  backBtn: { paddingVertical: 4 },
  backText: { fontSize: 15, color: '#1a73e8', fontWeight: '600' },
  title: { fontSize: 28, fontWeight: 'bold', marginTop: 4 },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
  },
  emptyCard: {
    padding: 18,
    borderRadius: 14,
    backgroundColor: '#F7F8FB',
    borderWidth: 1,
    borderColor: '#eee',
  },
  emptyTitle: { fontSize: 16, fontWeight: '700', marginBottom: 4 },
  emptyText: { fontSize: 14, color: '#555', lineHeight: 20 },
  card: {
    padding: 16,
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    gap: 4,
  },
  vehicleName: { fontSize: 17, fontWeight: '700', color: '#111' },
  vehicleMeta: { fontSize: 14, color: '#555' },
  plate: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1a73e8',
    marginTop: 2,
    fontFamily: Platform.select({ ios: 'Courier', android: 'monospace' }),
  },
  formTitle: { fontSize: 17, fontWeight: '700', marginBottom: 4 },
  label: { fontSize: 13, fontWeight: '600', color: '#555' },
  input: {
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: Platform.select({ ios: 12, android: 10 }),
    fontSize: 16,
    color: '#111',
  },
  rowButtons: { flexDirection: 'row', gap: 10, marginTop: 10 },
  actionBtn: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 1,
  },
  actionText: { fontSize: 14, fontWeight: '600', color: '#333' },
  editAction: { backgroundColor: '#fff', borderColor: '#ddd' },
  deleteAction: { backgroundColor: '#fff', borderColor: '#f3c8c8' },
  cancelAction: { backgroundColor: '#fff', borderColor: '#ddd' },
  saveAction: { backgroundColor: '#1a73e8', borderColor: '#1a73e8' },
  addBtn: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#1a73e8',
    borderStyle: 'dashed',
    backgroundColor: '#fff',
  },
  addBtnText: { fontSize: 15, fontWeight: '700', color: '#1a73e8' },
});
