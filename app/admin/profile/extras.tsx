import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { formatCents } from '@/components/utils/money';

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
      Alert.alert('Valor inválido', 'Introduce un precio válido (0 o mayor).');
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
      Alert.alert('Error', e?.message ?? 'No se pudo guardar.');
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
          <ActivityIndicator style={{ marginTop: 40 }} />
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

                    {/* Lápiz (solo cuando no estamos editando esta fila) */}
                    {!isExpanded && (
                      <Pressable
                        onPress={() => openEdit(extra)}
                        hitSlop={8}
                        style={styles.pencilBtn}
                      >
                        <Text style={styles.pencilText}>✏️</Text>
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
                          trackColor={{ true: '#34C759', false: '#e0e0e0' }}
                          thumbColor="#fff"
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
  safe: { flex: 1, backgroundColor: '#f2f2f7' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e0e0e0',
  },
  headerSide: { width: 70 },
  headerBack: { color: '#007AFF', fontSize: 16 },
  headerTitle: { fontSize: 17, fontWeight: '600', color: '#111' },
  container: { padding: 16, paddingBottom: 40 },
  card: { backgroundColor: '#fff', borderRadius: 12, overflow: 'hidden' },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#e0e0e0',
    marginLeft: 16,
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  rowMain: { flex: 1 },
  rowTopLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 3,
  },
  rowName: { fontSize: 16, fontWeight: '600', color: '#111' },
  rowSub: { fontSize: 13, color: '#8e8e93' },
  badge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  badgeActive: { backgroundColor: '#d4edda' },
  badgeInactive: { backgroundColor: '#f0f0f0' },
  badgeText: { fontSize: 11, fontWeight: '600' },
  badgeTextActive: { color: '#155724' },
  badgeTextInactive: { color: '#888' },
  pencilBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#eaeaea',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  pencilText: { fontSize: 15 },

  editArea: {
    backgroundColor: '#f9f9f9',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e0e0e0',
  },
  editRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  editLabel: { fontSize: 14, color: '#888', width: 56 },
  editInput: {
    flex: 1,
    fontSize: 20,
    fontWeight: '600',
    color: '#111',
    borderBottomWidth: 1.5,
    borderBottomColor: '#007AFF',
    paddingVertical: 4,
  },
  editUnit: { fontSize: 13, color: '#8e8e93' },
  editActions: { flexDirection: 'row', gap: 10 },
  cancelBtn: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: '#e5e5ea',
  },
  cancelBtnText: { color: '#111', fontSize: 15, fontWeight: '600' },
  saveBtn: {
    flex: 1,
    backgroundColor: '#007AFF',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  saveBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
});
