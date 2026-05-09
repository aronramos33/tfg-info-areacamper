import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as WebBrowser from 'expo-web-browser';
import dayjs from 'dayjs';

import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/AuthProvider';
import RequireAuthCard from '@/components/RequireAuthCard';
import {
  Vehicle,
  vehicleDisplayName,
} from '@/components/utils/vehicle';
import {
  ExtraLine,
  computeReservationTotalCents,
  isModifiable,
} from '@/components/utils/reservationModification';
import { nightsBetween } from '@/components/utils/dates';

type Reservation = {
  id: number;
  user_id: string;
  start_date: string;
  end_date: string;
  status: string;
  num_places: number;
  nightly_amount_cents: number;
  total_amount_cents: number;
  vehicle_id: number | null;
};

type Extra = {
  id: number;
  code: string;
  name_es: string;
  unit_amount_cents: number;
  pricing_type: 'per_night' | 'per_stay' | string;
  is_active: boolean;
};

function formatEuro(cents: number) {
  return `${(cents / 100).toFixed(2)} €`;
}

export default function EditReservationScreen() {
  const { reservationId } = useLocalSearchParams<{ reservationId: string }>();
  const router = useRouter();
  const { session } = useAuth();

  const [loading, setLoading] = useState(true);
  const [reservation, setReservation] = useState<Reservation | null>(null);
  const [extras, setExtras] = useState<Extra[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);

  const [endDate, setEndDate] = useState<string>('');
  const [extraQuantities, setExtraQuantities] = useState<Record<number, number>>(
    {},
  );
  const [vehicleId, setVehicleId] = useState<number | null>(null);

  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!reservationId || !session?.user?.id) return;

    const load = async () => {
      setLoading(true);
      const uid = session.user.id;

      const { data: r } = await supabase
        .from('reservations')
        .select(
          'id,user_id,start_date,end_date,status,num_places,nightly_amount_cents,total_amount_cents,vehicle_id',
        )
        .eq('id', Number(reservationId))
        .eq('user_id', uid)
        .maybeSingle();

      if (!r) {
        setLoading(false);
        Alert.alert(
          'No encontrada',
          'No se pudo cargar la reserva.',
        );
        router.back();
        return;
      }

      setReservation(r as Reservation);
      setEndDate(r.end_date);
      setVehicleId(r.vehicle_id);

      const { data: extraRows } = await supabase
        .from('extras')
        .select('id, code, name_es, unit_amount_cents, pricing_type, is_active')
        .eq('is_active', true)
        .order('id');
      setExtras((extraRows ?? []) as Extra[]);

      const { data: existingExtras } = await supabase
        .from('reservation_extras')
        .select('extra_id, quantity')
        .eq('reservation_id', Number(reservationId));
      const map: Record<number, number> = {};
      for (const row of existingExtras ?? []) {
        map[row.extra_id] = row.quantity;
      }
      setExtraQuantities(map);

      const { data: vehiclesData } = await supabase
        .from('vehicles')
        .select('*')
        .eq('user_id', uid)
        .order('created_at', { ascending: true });
      setVehicles((vehiclesData ?? []) as Vehicle[]);

      setLoading(false);
    };

    void load();
  }, [reservationId, session?.user?.id, router]);

  const isToggle = (e: Extra) => e.code === 'POWER';
  const maxUnits = (e: Extra) => (isToggle(e) ? 1 : 4);

  const newExtrasLines = useMemo<ExtraLine[]>(() => {
    return extras
      .filter((e) => (extraQuantities[e.id] ?? 0) > 0)
      .map((e) => ({
        extra_id: e.id,
        quantity: extraQuantities[e.id] ?? 0,
        pricing_type: e.pricing_type,
        unit_amount_cents: e.unit_amount_cents,
      }));
  }, [extras, extraQuantities]);

  const newTotal = useMemo(() => {
    if (!reservation) return 0;
    return computeReservationTotalCents({
      start_date: reservation.start_date,
      end_date: endDate || reservation.end_date,
      num_places: reservation.num_places,
      nightly_amount_cents: reservation.nightly_amount_cents,
      extras: newExtrasLines,
      vehicle_id: vehicleId,
    });
  }, [reservation, endDate, newExtrasLines, vehicleId]);

  const delta = useMemo(() => {
    if (!reservation) return 0;
    return newTotal - reservation.total_amount_cents;
  }, [newTotal, reservation]);

  if (!session) return <RequireAuthCard />;
  if (loading || !reservation) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator />
      </SafeAreaView>
    );
  }

  const canModify = isModifiable(reservation.start_date, reservation.status);
  if (!canModify) {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.title}>No editable</Text>
        <Text style={styles.subtle}>
          Esta reserva ya no se puede modificar.
        </Text>
        <Pressable
          onPress={() => router.back()}
          style={[styles.actionBtn, styles.cancelBtn, { marginTop: 16 }]}
        >
          <Text style={styles.cancelBtnText}>Volver</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const newNights = nightsBetween(reservation.start_date, endDate);

  const submit = async () => {
    if (newNights <= 0) {
      Alert.alert(
        'Fechas inválidas',
        'La fecha de salida debe ser posterior a la de entrada.',
      );
      return;
    }
    setSubmitting(true);
    try {
      const body: Record<string, unknown> = {
        reservation_id: reservation.id,
        end_date: endDate,
        extras: newExtrasLines.map((l) => ({
          extra_id: l.extra_id,
          quantity: l.quantity,
        })),
      };
      if (vehicleId != null && vehicleId !== reservation.vehicle_id) {
        body.vehicle_id = vehicleId;
      }

      const { data, error } = await supabase.functions.invoke(
        'modify-reservation',
        { body },
      );
      if (error) {
        Alert.alert('Error', error.message ?? 'No se pudo modificar.');
        return;
      }

      const mode = data?.mode as 'free' | 'refunded' | 'checkout';
      if (mode === 'checkout' && data?.url) {
        await WebBrowser.openBrowserAsync(String(data.url));
        return;
      }
      if (mode === 'refunded') {
        Alert.alert(
          'Cambios aplicados',
          `Hemos iniciado un reembolso parcial de ${formatEuro(Number(data?.refund_amount_cents ?? 0))} en tu método de pago.\n\nTu banco lo reflejará en tu cuenta en los próximos 5-10 días laborables.`,
          [{ text: 'OK', onPress: () => router.back() }],
        );
        return;
      }
      // free
      Alert.alert('Cambios aplicados', 'Tu reserva se ha actualizado.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'No se pudo modificar.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F7F8FB' }}>
      <ScrollView contentContainerStyle={styles.container}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>‹ Volver</Text>
        </Pressable>

        <Text style={styles.title}>Modificar reserva</Text>
        <Text style={styles.subtle}>
          Reserva #{reservation.id} · entrada {dayjs(reservation.start_date).format('DD/MM/YYYY')}
        </Text>

        {/* Fechas */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>📅 Estancia</Text>
          <Text style={styles.helper}>
            La entrada queda fija. Ajusta el número de noches.
          </Text>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Entrada</Text>
            <Text style={styles.rowValue}>
              {dayjs(reservation.start_date).format('DD/MM/YYYY')}
            </Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Salida</Text>
            <Text style={styles.rowValue}>
              {dayjs(endDate).format('DD/MM/YYYY')}
            </Text>
          </View>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginTop: 12,
            }}
          >
            <Text style={styles.rowLabel}>Noches</Text>
            <View style={styles.stepperRow}>
              <Pressable
                onPress={() => {
                  if (newNights <= 1) return;
                  setEndDate(
                    dayjs(endDate).subtract(1, 'day').format('YYYY-MM-DD'),
                  );
                }}
                style={[styles.stepBtn, newNights <= 1 && { opacity: 0.4 }]}
              >
                <Text style={styles.stepText}>−</Text>
              </Pressable>
              <Text style={[styles.stepValue, { fontSize: 18, minWidth: 28 }]}>
                {newNights}
              </Text>
              <Pressable
                onPress={() => {
                  setEndDate(
                    dayjs(endDate).add(1, 'day').format('YYYY-MM-DD'),
                  );
                }}
                style={styles.stepBtn}
              >
                <Text style={styles.stepText}>+</Text>
              </Pressable>
            </View>
          </View>
        </View>

        {/* Extras */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>✨ Extras</Text>
          {extras.map((extra) => {
            const qty = extraQuantities[extra.id] ?? 0;
            const toggle = isToggle(extra);
            const max = maxUnits(extra);
            return (
              <View key={extra.id} style={styles.extraRow}>
                <View style={{ flex: 1, paddingRight: 12 }}>
                  <Text style={styles.extraName}>{extra.name_es}</Text>
                  <Text style={styles.extraPrice}>
                    {formatEuro(extra.unit_amount_cents)} /{' '}
                    {extra.pricing_type === 'per_stay' ? 'estancia' : 'noche'}
                  </Text>
                </View>
                {toggle ? (
                  <Pressable
                    onPress={() =>
                      setExtraQuantities((prev) => ({
                        ...prev,
                        [extra.id]: prev[extra.id] === 1 ? 0 : 1,
                      }))
                    }
                    style={[
                      styles.toggleBtn,
                      qty === 1 && styles.toggleBtnActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.toggleText,
                        qty === 1 && { color: 'white' },
                      ]}
                    >
                      {qty === 1 ? 'Sí' : 'No'}
                    </Text>
                  </Pressable>
                ) : (
                  <View style={styles.stepperRow}>
                    <Pressable
                      onPress={() =>
                        setExtraQuantities((prev) => ({
                          ...prev,
                          [extra.id]: Math.max(0, (prev[extra.id] ?? 0) - 1),
                        }))
                      }
                      style={styles.stepBtn}
                    >
                      <Text style={styles.stepText}>−</Text>
                    </Pressable>
                    <Text style={styles.stepValue}>{qty}</Text>
                    <Pressable
                      onPress={() =>
                        setExtraQuantities((prev) => ({
                          ...prev,
                          [extra.id]: Math.min(max, (prev[extra.id] ?? 0) + 1),
                        }))
                      }
                      style={styles.stepBtn}
                    >
                      <Text style={styles.stepText}>+</Text>
                    </Pressable>
                  </View>
                )}
              </View>
            );
          })}
        </View>

        {/* Vehículo */}
        {vehicles.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>🚐 Vehículo</Text>
            {vehicles.map((v) => {
              const selected = vehicleId === v.id;
              return (
                <Pressable
                  key={v.id}
                  onPress={() => setVehicleId(v.id)}
                  style={[
                    styles.vehicleCard,
                    selected && styles.vehicleCardActive,
                  ]}
                >
                  <Text style={styles.vehicleName}>{vehicleDisplayName(v)}</Text>
                  <Text style={styles.vehicleMeta}>
                    {v.brand} {v.model}
                  </Text>
                  <Text style={styles.plate}>{v.plate}</Text>
                </Pressable>
              );
            })}
          </View>
        )}

        {/* Resumen del cambio */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>💰 Cambios</Text>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Total original</Text>
            <Text style={styles.rowValue}>
              {formatEuro(reservation.total_amount_cents)}
            </Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Total nuevo</Text>
            <Text style={styles.rowValue}>{formatEuro(newTotal)}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text
              style={[
                styles.totalLabel,
                delta > 0 && { color: '#1A73E8' },
                delta < 0 && { color: '#c0392b' },
              ]}
            >
              {delta > 0
                ? 'A pagar ahora'
                : delta < 0
                  ? 'Se reembolsará'
                  : 'Sin coste adicional'}
            </Text>
            <Text
              style={[
                styles.totalValue,
                delta > 0 && { color: '#1A73E8' },
                delta < 0 && { color: '#c0392b' },
              ]}
            >
              {delta === 0
                ? '—'
                : (delta > 0 ? '+' : '−') + formatEuro(Math.abs(delta))}
            </Text>
          </View>
        </View>

        <Pressable
          onPress={submit}
          disabled={submitting}
          style={[
            styles.actionBtn,
            styles.confirmBtn,
            submitting && { opacity: 0.6 },
          ]}
        >
          <Text style={styles.confirmBtnText}>
            {submitting
              ? 'Procesando…'
              : delta > 0
                ? 'Pagar y aplicar'
                : delta < 0
                  ? 'Confirmar y reembolsar'
                  : 'Aplicar cambios'}
          </Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  container: { padding: 16, paddingBottom: 48 },
  backBtn: { marginBottom: 12 },
  backText: { color: '#007AFF', fontWeight: '700', fontSize: 16 },
  title: { fontSize: 26, fontWeight: '800', color: '#111' },
  subtle: { color: '#666', marginTop: 4, marginBottom: 12 },

  card: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.07,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  cardTitle: { fontSize: 15, fontWeight: '800', marginBottom: 10 },
  helper: { fontSize: 13, color: '#888', marginBottom: 8 },
  summaryText: { marginTop: 10, color: '#333', fontWeight: '600' },

  extraRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f3f3',
  },
  extraName: { fontWeight: '700' },
  extraPrice: { color: '#666', fontSize: 13 },
  toggleBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#ddd',
    backgroundColor: 'white',
  },
  toggleBtnActive: { backgroundColor: '#1A73E8', borderColor: '#1A73E8' },
  toggleText: { fontWeight: '700', color: '#333' },
  stepperRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#F2F4F8',
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepText: { fontSize: 18, fontWeight: '800' },
  stepValue: { minWidth: 18, textAlign: 'center', fontWeight: '700' },

  vehicleCard: {
    borderWidth: 2,
    borderColor: '#E5E7EB',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
  },
  vehicleCardActive: { borderColor: '#1A73E8', backgroundColor: '#EAF1FE' },
  vehicleName: { fontWeight: '700', fontSize: 15 },
  vehicleMeta: { color: '#555', fontSize: 13 },
  plate: {
    color: '#1A73E8',
    fontWeight: '700',
    marginTop: 2,
    letterSpacing: 1,
  },

  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  rowLabel: { color: '#666' },
  rowValue: { fontWeight: '600' },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 12,
    marginTop: 4,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  totalLabel: { fontSize: 16, fontWeight: '800' },
  totalValue: { fontSize: 16, fontWeight: '800' },

  actionBtn: {
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
  },
  confirmBtn: { backgroundColor: '#1A73E8' },
  confirmBtnText: { color: 'white', fontWeight: '800', fontSize: 15 },
  cancelBtn: {
    backgroundColor: 'white',
    borderWidth: 2,
    borderColor: '#888',
  },
  cancelBtnText: { color: '#333', fontWeight: '700', fontSize: 15 },
});
