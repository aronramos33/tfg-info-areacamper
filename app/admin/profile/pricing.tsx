import React, { useEffect, useState } from 'react';
import {
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
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { formatCents } from '@/components/utils/money';

export default function AdminPricing() {
  const router = useRouter();
  const [pricingId, setPricingId] = useState<number | null>(null);
  const [savedCents, setSavedCents] = useState<number | null>(null);
  const [value, setValue] = useState('');
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      const { data } = await supabase
        .from('pricing')
        .select('id, nightly_amount_cents')
        .eq('active', true)
        .maybeSingle();
      if (data) {
        setPricingId(data.id);
        setSavedCents(data.nightly_amount_cents);
        setValue((data.nightly_amount_cents / 100).toFixed(2).replace('.', ','));
      }
      setLoading(false);
    })();
  }, []);

  const handleCancel = () => {
    if (savedCents != null) {
      setValue((savedCents / 100).toFixed(2).replace('.', ','));
    }
    setIsEditing(false);
  };

  const handleSave = async () => {
    if (pricingId == null) return;
    const euros = parseFloat(value.replace(',', '.').trim());
    if (isNaN(euros) || euros <= 0) {
      Alert.alert('Valor inválido', 'Introduce un precio mayor que 0.');
      return;
    }
    const cents = Math.round(euros * 100);
    setSaving(true);
    try {
      const { error } = await supabase
        .from('pricing')
        .update({ nightly_amount_cents: cents })
        .eq('id', pricingId);
      if (error) throw error;
      setSavedCents(cents);
      setIsEditing(false);
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'No se pudo guardar el precio.');
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
          <Text style={styles.headerTitle}>Precio por noche</Text>
          <View style={[styles.headerSide, { alignItems: 'flex-end' }]}>
            {!loading && !isEditing && (
              <Pressable onPress={() => setIsEditing(true)} hitSlop={8} style={styles.pencilBtn}>
                <Text style={styles.pencilText}>✏️</Text>
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
              <View style={styles.card}>
                <Text style={styles.fieldLabel}>Precio por noche</Text>

                {isEditing ? (
                  <View style={styles.inputRow}>
                    <TextInput
                      value={value}
                      onChangeText={setValue}
                      style={styles.input}
                      keyboardType="decimal-pad"
                      selectTextOnFocus
                      autoFocus
                      placeholder="15,00"
                    />
                    <Text style={styles.currency}>€ / noche</Text>
                  </View>
                ) : (
                  <View style={styles.readRow}>
                    <Text style={styles.readValue}>
                      {savedCents != null ? formatCents(savedCents) : '—'}
                    </Text>
                    <Text style={styles.readUnit}>por noche</Text>
                  </View>
                )}
              </View>

              {!isEditing && (
                <Text style={styles.hint}>
                  Este precio se aplica a todas las nuevas reservas. Los cambios no afectan a reservas ya confirmadas.
                </Text>
              )}

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
  safe: { flex: 1, backgroundColor: '#f2f2f7' },
  flex: { flex: 1 },
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
  pencilBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#eaeaea',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pencilText: { fontSize: 16 },
  container: { padding: 20, paddingBottom: 40, gap: 16 },
  hint: { fontSize: 14, color: '#8e8e93', lineHeight: 20 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#888',
    marginTop: 14,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 10,
  },
  readRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  readValue: { fontSize: 36, fontWeight: '700', color: '#111' },
  readUnit: { fontSize: 16, color: '#8e8e93' },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  input: {
    flex: 1,
    fontSize: 36,
    fontWeight: '700',
    color: '#111',
    paddingVertical: 4,
    borderBottomWidth: 1.5,
    borderBottomColor: '#007AFF',
  },
  currency: { fontSize: 16, color: '#8e8e93' },
  editActions: { flexDirection: 'row', gap: 12 },
  cancelBtn: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
    backgroundColor: '#e5e5ea',
  },
  cancelBtnText: { color: '#111', fontSize: 16, fontWeight: '600' },
  saveBtn: {
    flex: 1,
    backgroundColor: '#007AFF',
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
  },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
