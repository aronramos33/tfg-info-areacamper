import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { AppAlert } from '@/components/AppAlert';
import { formatCents } from '@/components/utils/money';
import { Ionicons } from '@expo/vector-icons';
import { colors, radii, shadow, spacing, typography } from '@/lib/theme';

type Extra = {
  id: number;
  name_es: string;
  pricing_type: 'per_night' | 'per_stay';
  unit_amount_cents: number;
  is_active: boolean;
};

type EditState = { price: string; is_active: boolean };

const PRICING_LABEL: Record<string, string> = {
  per_night: 'por noche',
  per_stay: 'por estancia',
};

export default function AdminExtras() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [extras, setExtras] = useState<Extra[]>([]);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [editValues, setEditValues] = useState<Record<number, EditState>>({});
  const [savingId, setSavingId] = useState<number | null>(null);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('extras')
        .select('id, name_es, pricing_type, unit_amount_cents, is_active')
        .order('id');
      if (!error && data) setExtras(data as Extra[]);
      setLoading(false);
    })();
  }, []);

  const openEdit = (extra: Extra) => {
    setExpandedId(extra.id);
    setEditValues((prev) => ({
      ...prev,
      [extra.id]: {
        price: (extra.unit_amount_cents / 100).toFixed(2).replace('.', ','),
        is_active: extra.is_active,
      },
    }));
  };

  const closeEdit = () => setExpandedId(null);

  const setField = (id: number, patch: Partial<EditState>) => {
    setEditValues((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  };

  const handleSave = async (extra: Extra) => {
    const ev = editValues[extra.id];
    if (!ev) return;
    const euros = parseFloat(ev.price.replace(',', '.').trim());
    if (isNaN(euros) || euros < 0) {
      AppAlert.alert('Valor inválido', 'Introduce un precio válido (0 o mayor).');
      return;
    }
    const cents = Math.round(euros * 100);
    setSavingId(extra.id);
    try {
      const { error } = await supabase
        .from('extras')
        .update({ unit_amount_cents: cents, is_active: ev.is_active })
        .eq('id', extra.id);
      if (error) throw error;
      setExtras((prev) =>
        prev.map((e) =>
          e.id === extra.id
            ? { ...e, unit_amount_cents: cents, is_active: ev.is_active }
            : e,
        ),
      );
      setExpandedId(null);
    } catch (e: any) {
      AppAlert.alert('Error', e?.message ?? 'No se pudo guardar.');
    } finally {
      setSavingId(null);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8} style={styles.headerSide}>
          <Text style={styles.headerBack}>‹ Atrás</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Extras</Text>
        <View style={styles.headerSide} />
      </View>

      <ScrollView contentContainerStyle={styles.container}>
        {loading ? (
          <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
        ) : (
          <View style={styles.card}>
            {extras.map((extra, i) => {
              const isExpanded = expandedId === extra.id;
              const ev = editValues[extra.id];
              const isSaving = savingId === extra.id;

              return (
                <React.Fragment key={extra.id}>
                  {i > 0 && <View style={styles.divider} />}

                  {/* Fila lectura */}
                  <View style={styles.row}>
                    <View style={styles.rowMain}>
                      <View style={styles.rowTopLine}>
                        <Text style={styles.rowName}>{extra.name_es}</Text>
                        <View
                          style={[
                            styles.badge,
                            extra.is_active ? styles.badgeActive : styles.badgeInactive,
                          ]}
                        >
                          <Text
                            style={[
                              styles.badgeText,
                              extra.is_active
                                ? styles.badgeTextActive
                                : styles.badgeTextInactive,
                            ]}
                          >
                            {extra.is_active ? 'Activo' : 'Inactivo'}
                          </Text>
                        </View>
                      </View>
                      <Text style={styles.rowSub}>
                        {formatCents(extra.unit_amount_cents)} ·{' '}
                        {PRICING_LABEL[extra.pricing_type] ?? extra.pricing_type}
                      </Text>
                    </View>

                    {!isExpanded && (
                      <Pressable
                        onPress={() => openEdit(extra)}
                        hitSlop={8}
                        style={styles.pencilBtn}
                      >
                        <Ionicons name="create-outline" size={18} color={colors.secondary} />
                      </Pressable>
                    )}
                  </View>

                  {/* Área de edición expandida */}
                  {isExpanded && ev && (
                    <View style={styles.editArea}>
                      <View style={styles.editRow}>
                        <Text style={styles.editLabel}>Precio</Text>
                        <TextInput
                          value={ev.price}
                          onChangeText={(t) => setField(extra.id, { price: t })}
                          style={styles.editInput}
                          keyboardType="decimal-pad"
                          selectTextOnFocus
                          autoFocus
                          placeholderTextColor={colors.onSurfaceVariant}
                        />
                        <Text style={styles.editUnit}>
                          € / {PRICING_LABEL[extra.pricing_type]}
                        </Text>
                      </View>

                      <View style={styles.editRow}>
                        <Text style={styles.editLabel}>Activo</Text>
                        <Switch
                          value={ev.is_active}
                          onValueChange={(v) => setField(extra.id, { is_active: v })}
                          trackColor={{ true: colors.primary, false: colors.surfaceContainerHigh }}
                          thumbColor={colors.onPrimary}
                        />
                      </View>

                      <View style={styles.editActions}>
                        <Pressable
                          style={({ pressed }) => [
                            styles.cancelBtn,
                            pressed && { opacity: 0.7 },
                          ]}
                          onPress={closeEdit}
                          disabled={isSaving}
                        >
                          <Text style={styles.cancelBtnText}>Cancelar</Text>
                        </Pressable>
                        <Pressable
                          style={({ pressed }) => [
                            styles.saveBtn,
                            isSaving && { opacity: 0.6 },
                            pressed && { opacity: 0.8 },
                          ]}
                          onPress={() => handleSave(extra)}
                          disabled={isSaving}
                        >
                          <Text style={styles.saveBtnText}>
                            {isSaving ? 'Guardando…' : 'Guardar'}
                          </Text>
                        </Pressable>
                      </View>
                    </View>
                  )}
                </React.Fragment>
              );
            })}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
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
  container: { padding: spacing.lg, paddingBottom: 40 },
  card: {
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: radii.lg,
    overflow: 'hidden',
    ...shadow.sm,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.outlineVariant,
    marginLeft: spacing.lg,
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: 14,
  },
  rowMain: { flex: 1 },
  rowTopLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 3,
  },
  rowName: { ...typography.titleSm },
  rowSub: { ...typography.bodyMd },
  badge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: radii.sm },
  badgeActive: { backgroundColor: colors.confirmedBg },
  badgeInactive: { backgroundColor: colors.surfaceContainerHigh },
  badgeText: { fontFamily: 'Inter_700Bold', fontSize: 11 },
  badgeTextActive: { color: colors.confirmedText },
  badgeTextInactive: { color: colors.onSurfaceVariant },
  pencilBtn: {
    width: 34, height: 34, borderRadius: radii.sm,
    backgroundColor: colors.surfaceContainerHigh,
    alignItems: 'center', justifyContent: 'center',
    marginLeft: 8,
  },

  editArea: {
    backgroundColor: colors.surfaceContainerHigh,
    paddingHorizontal: spacing.lg,
    paddingVertical: 14,
    gap: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.outlineVariant,
  },
  editRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  editLabel: { ...typography.bodyMd, width: 56 },
  editInput: {
    flex: 1,
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 20,
    color: colors.onSurface,
    borderBottomWidth: 2,
    borderBottomColor: colors.primary,
    paddingVertical: 4,
  },
  editUnit: { ...typography.bodyMd },
  editActions: { flexDirection: 'row', gap: 10 },
  cancelBtn: {
    flex: 1, borderRadius: radii.sm, paddingVertical: 10,
    alignItems: 'center', backgroundColor: colors.surfaceContainerLow,
    borderWidth: 1, borderColor: colors.outline,
  },
  cancelBtnText: { ...typography.titleSm },
  saveBtn: {
    flex: 1, backgroundColor: colors.primary, borderRadius: radii.sm,
    paddingVertical: 10, alignItems: 'center', ...shadow.sm,
  },
  saveBtnText: { ...typography.titleSm, color: colors.onPrimary },
});
