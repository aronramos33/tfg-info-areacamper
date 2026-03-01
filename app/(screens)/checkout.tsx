import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  Alert,
  Pressable,
  TextInput,
  Platform,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import dayjs from 'dayjs';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as WebBrowser from 'expo-web-browser';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/AuthProvider';
import RequireAuthCard from '@/components/RequireAuthCard';
import { nightsBetween } from '@/components/utils/dates';
import { formatCents, NIGHTLY_CENTS } from '@/components/utils/money';

type UserProfile = {
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  dni: string | null;
  license_plate: string | null;
};

type Extra = {
  id: number;
  code: string;
  name_es: string;
  unit_amount_cents: number;
  is_active: boolean;
  pricing_type: string;
};

const EXTRA_ORDER: Record<string, number> = { PERSON: 0, PET: 1, POWER: 2 };

export default function CheckoutScreen() {
  const { session } = useAuth();
  const { startDate, endDate } = useLocalSearchParams<{
    startDate?: string;
    endDate?: string;
  }>();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [extras, setExtras] = useState<Extra[]>([]);
  const [extraQuantities, setExtraQuantities] = useState<
    Record<number, number>
  >({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Solo estos dos son editables
  const [phone, setPhone] = useState('');
  const [licensePlate, setLicensePlate] = useState('');

  const start = startDate ? dayjs(startDate) : null;
  const end = endDate ? dayjs(endDate) : null;
  const nights =
    start && end && end.isAfter(start)
      ? nightsBetween(startDate!, endDate!)
      : 0;

  const baseTotal = nights * NIGHTLY_CENTS;

  const isToggleExtra = (e: Extra) => e.code === 'POWER';
  const maxUnitsForExtra = (e: Extra) => (isToggleExtra(e) ? 1 : 4);
  const lineTotalCents = (e: Extra, units: number) =>
    units * nights * e.unit_amount_cents;

  const extrasTotal = useMemo(
    () =>
      extras.reduce((sum, e) => {
        const units = extraQuantities[e.id] ?? 0;
        return sum + units * nights * e.unit_amount_cents;
      }, 0),
    [extras, extraQuantities, nights],
  );

  const finalTotal = baseTotal + extrasTotal;

  useEffect(() => {
    if (!session?.user?.id) {
      setLoading(false);
      return;
    }
    const loadData = async () => {
      try {
        const { data: profileData } = await supabase
          .from('user_profiles')
          .select('full_name, first_name, last_name, phone, dni, license_plate')
          .eq('user_id', session.user.id)
          .single();

        if (profileData) {
          setProfile(profileData);
          setPhone(profileData.phone ?? '');
          setLicensePlate(profileData.license_plate ?? '');
        }

        const { data: extrasData } = await supabase
          .from('extras')
          .select(
            'id, code, name_es, unit_amount_cents, is_active, pricing_type',
          )
          .eq('is_active', true)
          .order('id');

        if (extrasData) {
          // Ordenar: Acompañante → Mascota → Electricidad
          const sorted = [...(extrasData as Extra[])].sort((a, b) => {
            const oa = EXTRA_ORDER[a.code] ?? 99;
            const ob = EXTRA_ORDER[b.code] ?? 99;
            return oa - ob;
          });
          setExtras(sorted);
        }
      } catch (e) {
        console.warn(e);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [session?.user?.id]);

  if (!session) return <RequireAuthCard />;
  if (loading)
    return (
      <SafeAreaView
        style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}
      >
        <ActivityIndicator />
      </SafeAreaView>
    );
  if (!profile)
    return (
      <SafeAreaView
        style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}
      >
        <Text>No se pudo cargar tu perfil.</Text>
      </SafeAreaView>
    );

  // Nombre completo: usar full_name si existe, si no construirlo
  const displayName =
    profile.full_name?.trim() ||
    [profile.first_name, profile.last_name].filter(Boolean).join(' ') ||
    '';

  const handleConfirm = async () => {
    if (!start || !end || nights <= 0) {
      Alert.alert('Fechas no válidas', 'Vuelve a seleccionar tus fechas.');
      return;
    }

    const cleanPhone = phone.trim();
    const cleanPlate = licensePlate.trim();

    if (!displayName) {
      Alert.alert(
        'Perfil incompleto',
        'Añade tu nombre en el perfil antes de reservar.',
      );
      return;
    }
    if (!profile.dni) {
      Alert.alert(
        'Perfil incompleto',
        'Añade tu DNI en el perfil antes de reservar.',
      );
      return;
    }
    if (!cleanPhone) {
      Alert.alert('Teléfono requerido', 'Introduce tu teléfono.');
      return;
    }
    if (!cleanPlate) {
      Alert.alert('Matrícula requerida', 'Introduce tu matrícula.');
      return;
    }

    // Guardar teléfono y matrícula actualizados si han cambiado
    if (
      cleanPhone !== (profile.phone ?? '') ||
      cleanPlate !== (profile.license_plate ?? '')
    ) {
      await supabase
        .from('user_profiles')
        .update({ phone: cleanPhone, license_plate: cleanPlate })
        .eq('user_id', session.user.id);
    }

    setSaving(true);
    try {
      const extrasToSend = extras
        .filter((e) => (extraQuantities[e.id] ?? 0) > 0)
        .map((e) => {
          const units = extraQuantities[e.id] ?? 0;
          return {
            extra_id: e.id,
            quantity: units,
            pricing_type: 'per_night',
            unit_amount_cents: e.unit_amount_cents,
            line_total_cents: lineTotalCents(e, units),
          };
        });

      const { data: fnData, error: fnError } = await supabase.functions.invoke(
        'create-checkout-session',
        {
          body: {
            start_date: startDate,
            end_date: endDate,
            full_name: displayName,
            phone: cleanPhone,
            dni: profile.dni,
            license_plate: cleanPlate,
            nightly_amount_cents: NIGHTLY_CENTS,
            extras: extrasToSend,
          },
        },
      );

      if (fnError || !fnData?.url) {
        Alert.alert('Error', fnError?.message ?? 'No se pudo iniciar el pago.');
        return;
      }

      await WebBrowser.openBrowserAsync(fnData.url);
    } catch (e) {
      console.warn(e);
      Alert.alert('Error', 'Ha ocurrido un problema al iniciar el pago.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingTop: 20,
          paddingBottom: 32,
          backgroundColor: '#F8F9FC',
        }}
      >
        <Text style={styles.pageTitle}>Resumen de tu reserva</Text>

        {/* Estancia */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Estancia</Text>
          <Row label="Entrada" value={start?.format('DD/MM/YYYY') ?? '—'} />
          <Row label="Salida" value={end?.format('DD/MM/YYYY') ?? '—'} />
          <Row label="Noches" value={String(nights)} />
          <Row label="Precio/noche" value={formatCents(NIGHTLY_CENTS)} />
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total base</Text>
            <Text style={styles.totalValue}>{formatCents(baseTotal)}</Text>
          </View>
        </View>

        {/* Tus datos */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Tus datos</Text>

          {/* Solo lectura */}
          <Row label="Nombre" value={displayName || '—'} />
          <Row label="DNI" value={profile.dni ?? '—'} />

          {/* Editables */}
          <Text style={styles.fieldLabel}>Teléfono</Text>
          <TextInput
            value={phone}
            onChangeText={setPhone}
            style={styles.input}
            placeholder="+34 600 000 000"
            keyboardType="phone-pad"
          />

          <Text style={styles.fieldLabel}>Matrícula</Text>
          <TextInput
            value={licensePlate}
            onChangeText={setLicensePlate}
            style={styles.input}
            placeholder="1234ABC"
            autoCapitalize="characters"
          />
        </View>

        {/* Extras */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Extras adicionales</Text>
          {extras.map((extra) => {
            const qty = extraQuantities[extra.id] ?? 0;
            const isToggle = isToggleExtra(extra);
            const maxQty = maxUnitsForExtra(extra);
            const lineTotal = lineTotalCents(extra, qty);

            return (
              <View key={extra.id} style={styles.extraRow}>
                <View style={{ flex: 1, paddingRight: 12 }}>
                  <Text style={styles.extraName}>{extra.name_es}</Text>
                  <Text style={styles.extraPrice}>
                    {formatCents(extra.unit_amount_cents)} / noche
                  </Text>
                  {qty > 0 && (
                    <Text style={styles.extraDetail}>
                      {isToggle
                        ? `Activado × ${nights} noche(s) → ${formatCents(lineTotal)}`
                        : `${qty} × ${nights} noche(s) → ${formatCents(lineTotal)}`}
                    </Text>
                  )}
                </View>

                {isToggle ? (
                  <Pressable
                    onPress={() =>
                      setExtraQuantities((prev) => ({
                        ...prev,
                        [extra.id]: prev[extra.id] === 1 ? 0 : 1,
                      }))
                    }
                    style={styles.toggleExtra}
                  >
                    <View
                      style={[
                        styles.checkbox,
                        qty === 1 && styles.checkboxActive,
                      ]}
                    >
                      {qty === 1 && <Text style={styles.checkmark}>✓</Text>}
                    </View>
                    <Text style={styles.toggleLabel}>
                      {qty === 1 ? 'Sí' : 'No'}
                    </Text>
                  </Pressable>
                ) : (
                  <View style={styles.stepper}>
                    <Pressable
                      onPress={() =>
                        setExtraQuantities((prev) => ({
                          ...prev,
                          [extra.id]: Math.max(0, (prev[extra.id] ?? 0) - 1),
                        }))
                      }
                      style={styles.stepBtn}
                    >
                      <Text style={styles.stepBtnText}>−</Text>
                    </Pressable>
                    <Text style={styles.stepValue}>{qty}</Text>
                    <Pressable
                      onPress={() =>
                        setExtraQuantities((prev) => ({
                          ...prev,
                          [extra.id]: Math.min(
                            maxQty,
                            (prev[extra.id] ?? 0) + 1,
                          ),
                        }))
                      }
                      style={styles.stepBtn}
                    >
                      <Text style={styles.stepBtnText}>+</Text>
                    </Pressable>
                  </View>
                )}
              </View>
            );
          })}
        </View>

        {/* Total */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Total</Text>
          <Row label="Base" value={formatCents(baseTotal)} />
          <Row label="Extras" value={formatCents(extrasTotal)} />
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total final</Text>
            <Text style={styles.totalValue}>{formatCents(finalTotal)}</Text>
          </View>
        </View>

        <Pressable
          onPress={handleConfirm}
          disabled={saving}
          style={[styles.confirmBtn, saving && { opacity: 0.7 }]}
        >
          <Text style={styles.confirmBtnText}>
            {saving ? 'Procesando…' : 'Ir al pago'}
          </Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = {
  pageTitle: {
    fontSize: 26,
    fontWeight: '700' as const,
    marginBottom: 20,
    textAlign: 'center' as const,
  },
  card: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 16,
    marginBottom: 16,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700' as const,
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#f5f5f5',
  },
  rowLabel: { fontSize: 14, color: '#888' },
  rowValue: { fontSize: 14, fontWeight: '600' as const, color: '#111' },
  totalRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    paddingTop: 10,
    marginTop: 4,
  },
  totalLabel: { fontSize: 15, fontWeight: '700' as const },
  totalValue: { fontSize: 15, fontWeight: '800' as const, color: '#111' },

  fieldLabel: {
    fontSize: 12,
    fontWeight: '700' as const,
    color: '#888',
    marginTop: 12,
    marginBottom: 4,
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
  },

  extraRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f5f5f5',
  },
  extraName: { fontSize: 15, fontWeight: '600' as const },
  extraPrice: { fontSize: 13, color: '#888', marginTop: 2 },
  extraDetail: { fontSize: 12, color: '#007AFF', marginTop: 3 },

  toggleExtra: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: '#F2F4F8',
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#999',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  checkboxActive: { borderColor: '#1A73E8', backgroundColor: '#1A73E8' },
  checkmark: { color: '#fff', fontSize: 13, fontWeight: '700' as const },
  toggleLabel: { fontWeight: '600' as const, fontSize: 14 },

  stepper: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
  },
  stepBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#F2F4F8',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  stepBtnText: { fontSize: 18, fontWeight: '800' as const },
  stepValue: {
    minWidth: 20,
    textAlign: 'center' as const,
    fontSize: 15,
    fontWeight: '600' as const,
  },

  confirmBtn: {
    backgroundColor: '#1A73E8',
    paddingVertical: 15,
    borderRadius: 14,
    alignItems: 'center' as const,
    marginTop: 4,
  },
  confirmBtnText: { color: '#fff', fontWeight: '800' as const, fontSize: 16 },
};
