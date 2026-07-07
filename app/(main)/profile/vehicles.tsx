import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
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
import { colors, radii, shadow, spacing, typography } from '@/lib/theme';
import { AppAlert } from '@/components/AppAlert';

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
      AppAlert.alert('Error', 'No se pudieron cargar tus vehículos.');
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
      AppAlert.alert('Datos inválidos', err);
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
            AppAlert.alert(
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
            AppAlert.alert(
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
      AppAlert.alert('Error', e?.message ?? 'No se pudo guardar el vehículo.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (v: Vehicle) => {
    AppAlert.alert(
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
              AppAlert.alert('Error', error.message);
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
              <ActivityIndicator color={colors.primary} />
              <Text style={[typography.bodyMd, { marginLeft: 10 }]}>Cargando…</Text>
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
                              style={[styles.actionText, { color: colors.error }]}
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
        placeholderTextColor={colors.onSurfaceVariant}
        style={styles.input}
        autoCapitalize="words"
      />

      <Text style={styles.label}>Modelo *</Text>
      <TextInput
        value={form.model}
        onChangeText={(t) => setField('model', t)}
        placeholder="Marco Polo, California…"
        placeholderTextColor={colors.onSurfaceVariant}
        style={styles.input}
      />

      <Text style={styles.label}>Matrícula *</Text>
      <TextInput
        value={form.plate}
        onChangeText={(t) => setField('plate', t)}
        placeholder="1234ABC"
        placeholderTextColor={colors.onSurfaceVariant}
        style={styles.input}
        autoCapitalize="characters"
        autoCorrect={false}
      />

      <Text style={styles.label}>Alias / apodo</Text>
      <TextInput
        value={form.alias}
        onChangeText={(t) => setField('alias', t)}
        placeholder="La furgo grande"
        placeholderTextColor={colors.onSurfaceVariant}
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
          <Text style={[styles.actionText, { color: colors.onPrimary }]}>
            {saving ? 'Guardando…' : 'Guardar'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  container: { padding: spacing.lg, paddingBottom: 40, gap: 14 },
  headerRow: { gap: 6 },
  backBtn: { paddingVertical: 4 },
  backText: { ...typography.titleMd, color: colors.secondary },
  title: { ...typography.headlineLg, marginTop: 4 },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
  },
  emptyCard: {
    padding: 18,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceContainerLow,
    ...shadow.sm,
  },
  emptyTitle: { ...typography.titleMd, marginBottom: 4 },
  emptyText: { ...typography.bodyMd, lineHeight: 20 },
  card: {
    padding: spacing.lg,
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: radii.md,
    gap: 4,
    ...shadow.sm,
  },
  vehicleName: { ...typography.titleMd },
  vehicleMeta: { ...typography.bodyMd },
  plate: {
    ...typography.titleSm,
    color: colors.secondary,
    marginTop: 2,
    fontFamily: Platform.select({ ios: 'Courier', android: 'monospace' }),
    letterSpacing: 1,
  },
  formTitle: { ...typography.titleMd, marginBottom: 4 },
  label: { ...typography.labelLg },
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
  rowButtons: { flexDirection: 'row', gap: 10, marginTop: 10 },
  actionBtn: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: radii.sm,
    alignItems: 'center',
    borderWidth: 1,
  },
  actionText: { ...typography.titleSm },
  editAction: { backgroundColor: colors.surfaceContainerHigh, borderColor: colors.outline },
  deleteAction: { backgroundColor: colors.errorContainer, borderColor: colors.errorContainer },
  cancelAction: { backgroundColor: colors.surfaceContainerHigh, borderColor: colors.outline },
  saveAction: { backgroundColor: colors.primary, borderColor: colors.primary },
  addBtn: {
    paddingVertical: 14,
    borderRadius: radii.md,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.secondary,
    borderStyle: 'dashed',
    backgroundColor: colors.surfaceContainerLow,
  },
  addBtnText: { ...typography.titleSm, color: colors.secondary },
});
