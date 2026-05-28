import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Pressable,
  Alert,
  BackHandler,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import dayjs from 'dayjs';
import { supabase } from '../../../lib/supabase';
import { nightsBetween } from '../../../components/utils/dates';

type VehicleSnapshot = {
  place_index: number;
  vehicle_id: number | null;
  brand: string;
  model: string;
  plate: string;
  alias?: string | null;
};

type ReservationDetail = {
  id: number;
  full_name: string | null;
  dni: string | null;
  phone: string | null;
  vehicle_brand: string | null;
  vehicle_model: string | null;
  vehicle_plate: string | null;
  vehicle_alias: string | null;
  vehicles_snapshot: VehicleSnapshot[];
  start_date: string;
  end_date: string;
  place_ids: number[] | null;
  num_places: number | null;
  nightly_amount_cents: number | null;
  total_amount_cents: number | null;
  refund_amount_cents: number | null;
  payment_status: string;
  status: string;
  modified_at: string | null;
  created_at: string;
};

type ExtraLine = {
  place_index: number | null;
  quantity: number;
  unit_amount_cents: number;
  line_total_cents: number;
  extras: { code: string; name_es: string } | null;
};

type TravelerRow = {
  id: number;
  place_index: number | null;
  full_name: string;
  doc_type: string;
  doc_number: string;
  doc_support_number: string | null;
  nationality: string;
  birth_date: string;
  gender: string;
  country_of_residence: string | null;
  city_of_residence: string | null;
  phone: string | null;
  email: string | null;
};

function formatEuro(cents: number | null) {
  return `${((cents ?? 0) / 100).toFixed(2)} €`;
}
function formatDate(d: string | null) {
  if (!d) return '—';
  return dayjs(d).format('DD/MM/YYYY');
}

export default function AdminReservationDetailScreen() {
  const { reservationId, from } = useLocalSearchParams<{
    reservationId: string;
    from?: string;
  }>();
  const router = useRouter();

  const [reservation, setReservation] = useState<ReservationDetail | null>(null);
  const [extras, setExtras] = useState<ExtraLine[]>([]);
  const [travelers, setTravelers] = useState<TravelerRow[]>([]);
  const [placeNames, setPlaceNames] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);

  const goBack = useCallback(() => {
    if (from === 'reservas') {
      router.replace('/admin/places/reservas');
    } else {
      router.replace('/admin/places');
    }
  }, [from, router]);

  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        goBack();
        return true;
      });
      return () => sub.remove();
    }, [goBack]),
  );

  useFocusEffect(
    useCallback(() => {
      if (!reservationId) return;
      let alive = true;

      const load = async () => {
        setLoading(true);
        const { data: r, error } = await supabase
          .from('reservations')
          .select(
            'id,full_name,dni,phone,vehicle_brand,vehicle_model,vehicle_plate,vehicle_alias,vehicles_snapshot,start_date,end_date,place_ids,num_places,nightly_amount_cents,total_amount_cents,refund_amount_cents,payment_status,status,modified_at,created_at',
          )
          .eq('id', Number(reservationId))
          .single();

        if (!alive) return;
        if (error || !r) {
          Alert.alert('Error', 'No se pudo cargar la reserva.');
          goBack();
          return;
        }
        const typed = r as ReservationDetail;
        setReservation(typed);

        if (typed.place_ids?.length) {
          const { data: placesData } = await supabase
            .from('places')
            .select('id, name')
            .in('id', typed.place_ids);
          if (placesData && alive) {
            const map: Record<number, string> = {};
            for (const p of placesData) map[p.id as number] = p.name as string;
            setPlaceNames(map);
          }
        }

        const [extrasRes, travelersRes] = await Promise.all([
          supabase
            .from('reservation_extras')
            .select('place_index, quantity, unit_amount_cents, line_total_cents, extras(code, name_es)')
            .eq('reservation_id', Number(reservationId))
            .order('place_index', { ascending: true }),
          supabase
            .from('travelers')
            .select('id, place_index, full_name, doc_type, doc_number, doc_support_number, nationality, birth_date, gender, country_of_residence, city_of_residence, phone, email')
            .eq('reservation_id', Number(reservationId))
            .order('place_index', { ascending: true }),
        ]);

        if (!alive) return;

        setExtras(((extrasRes.data ?? []) as unknown) as ExtraLine[]);
        setTravelers((travelersRes.data ?? []) as TravelerRow[]);
        setLoading(false);
      };

      load();
      return () => { alive = false; };
    }, [reservationId, goBack]),
  );

  if (loading)
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator size="large" />
      </SafeAreaView>
    );
  if (!reservation) return null;

  const nights = nightsBetween(reservation.start_date, reservation.end_date);
  const numPlaces = reservation.num_places ?? 1;
  const refunded = (reservation.refund_amount_cents ?? 0) > 0;
  const hasPlaceIndex = extras.some(e => e.place_index !== null);

  const allPlacesLabel = reservation.place_ids?.length
    ? reservation.place_ids.map((id) => placeNames[id] ?? `#${id}`).join(', ')
    : null;

  const placeLabel = (i: number) => {
    const id = reservation.place_ids?.[i];
    return id != null && placeNames[id] ? placeNames[id] : `Plaza ${i + 1}`;
  };

  // Per-plaza data (misma lógica que vista usuario)
  const plazaData = Array.from({ length: numPlaces }, (_, i) => {
    const snap = reservation.vehicles_snapshot?.find(s => s.place_index === i);
    const vehicle = snap ?? (i === 0 ? {
      place_index: 0,
      vehicle_id: null,
      brand: reservation.vehicle_brand ?? '',
      model: reservation.vehicle_model ?? '',
      plate: reservation.vehicle_plate ?? '',
      alias: reservation.vehicle_alias,
    } : null);
    const plazaTravelers = travelers.filter(t => (t.place_index ?? 0) === i);
    const plazaExtras = hasPlaceIndex
      ? extras.filter(e => (e.place_index ?? 0) === i)
      : (i === 0 ? extras : []);
    const extrasTotal = plazaExtras.reduce((s, e) => s + e.line_total_cents, 0);
    const baseTotal = (reservation.nightly_amount_cents ?? 0) * nights;
    return { vehicle, plazaTravelers, plazaExtras, extrasTotal, baseTotal };
  });

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F7F8FB' }}>
      <ScrollView contentContainerStyle={styles.container}>
        <Pressable onPress={goBack} style={styles.backBtn}>
          <Text style={styles.backBtnText}>‹ Volver</Text>
        </Pressable>

        <Text style={styles.pageTitle}>Reserva #{reservation.id}</Text>

        <View style={styles.badgeRow}>
          <View style={[styles.badge, reservation.payment_status === 'paid' ? styles.badgePaid : styles.badgeRefunded]}>
            <Text style={styles.badgeText}>
              {reservation.payment_status === 'paid' ? '✅ Pagada' : '↩️ Reembolsada'}
            </Text>
          </View>
          {reservation.modified_at && (
            <View style={[styles.badge, styles.badgeModified]}>
              <Text style={styles.badgeText}>Modificada</Text>
            </View>
          )}
        </View>

        {/* Huésped (titular) — info exclusiva admin */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>👤 Titular</Text>
          <Row label="Nombre" value={reservation.full_name ?? '—'} />
          <Row label="DNI/NIE" value={reservation.dni ?? '—'} />
          <Row label="Teléfono" value={reservation.phone ?? '—'} />
        </View>

        {/* Estancia */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>🏕️ Estancia</Text>
          <Row label="Entrada" value={formatDate(reservation.start_date)} />
          <Row label="Salida" value={formatDate(reservation.end_date)} />
          <Row label="Noches" value={String(nights)} />
          {allPlacesLabel && (
            <Row label={numPlaces > 1 ? 'Plazas' : 'Plaza'} value={allPlacesLabel} />
          )}
        </View>

        {/* Por plaza: vehículo + viajeros + extras */}
        {plazaData.map(({ vehicle, plazaTravelers, plazaExtras }, i) => (
          <View key={i}>
            {numPlaces > 1 && (
              <Text style={styles.plazaLabel}>{placeLabel(i)}</Text>
            )}

            {/* Vehículo */}
            {vehicle && (vehicle.plate || vehicle.brand) && (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>🚐 Vehículo</Text>
                {vehicle.alias ? <Row label="Alias" value={vehicle.alias} /> : null}
                <Row
                  label="Vehículo"
                  value={[vehicle.brand, vehicle.model].filter(Boolean).join(' ') || '—'}
                />
                <Row label="Matrícula" value={vehicle.plate || '—'} />
              </View>
            )}

            {/* Viajeros */}
            {plazaTravelers.length > 0 && (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>🪪 Viajeros</Text>
                {plazaTravelers.map((t, ti) => (
                  <View
                    key={t.id}
                    style={ti > 0 ? { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#f5f5f5' } : undefined}
                  >
                    <Text style={{ fontWeight: '700', fontSize: 14, marginBottom: 4 }}>
                      {ti === 0 && i === 0 ? '(Titular) ' : ''}{t.full_name}
                    </Text>
                    <Row label="Documento" value={`${t.doc_type.toUpperCase()} ${t.doc_number}`} />
                    {t.doc_support_number ? <Row label="Nº soporte" value={t.doc_support_number} /> : null}
                    <Row label="Nacionalidad" value={t.nationality} />
                    {t.birth_date ? <Row label="Nacimiento" value={formatDate(t.birth_date)} /> : null}
                    <Row label="Género" value={t.gender === 'm' ? 'Hombre' : t.gender === 'f' ? 'Mujer' : 'Otro'} />
                    {t.country_of_residence ? <Row label="País residencia" value={t.country_of_residence} /> : null}
                    {t.city_of_residence ? <Row label="Localidad" value={t.city_of_residence} /> : null}
                    {t.phone ? <Row label="Teléfono" value={t.phone} /> : null}
                    {t.email ? <Row label="Email" value={t.email} /> : null}
                  </View>
                ))}
              </View>
            )}

            {/* Aviso si no hay viajeros */}
            {plazaTravelers.length === 0 && (
              <View style={[styles.card, { borderLeftWidth: 3, borderLeftColor: '#FF9500' }]}>
                <Text style={{ fontSize: 13, color: '#7a4f00', fontWeight: '600' }}>
                  ⚠️ Sin datos de viajeros registrados
                </Text>
              </View>
            )}

            {/* Extras de esta plaza */}
            {plazaExtras.length > 0 && (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>✨ Extras</Text>
                {plazaExtras.map((e, ei) => (
                  <Row
                    key={ei}
                    label={`${e.extras?.name_es ?? '—'}${e.quantity > 1 ? ` ×${e.quantity}` : ''}`}
                    value={formatEuro(e.line_total_cents)}
                  />
                ))}
              </View>
            )}
          </View>
        ))}

        {/* Desglose */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>💰 Desglose</Text>
          {numPlaces > 1 ? (
            plazaData.map(({ extrasTotal, baseTotal }, i) => (
              <View key={i} style={{ marginBottom: 10 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: '#555', marginBottom: 4 }}>
                  {placeLabel(i)}
                </Text>
                <Row
                  label={`${nights} noche${nights !== 1 ? 's' : ''} × ${formatEuro(reservation.nightly_amount_cents)}`}
                  value={formatEuro(baseTotal)}
                />
                {extrasTotal > 0 && (
                  <Row label="Extras" value={formatEuro(extrasTotal)} />
                )}
                <View style={[styles.row, { borderBottomWidth: 0, paddingTop: 2 }]}>
                  <Text style={{ color: '#444', fontWeight: '600', flex: 1 }}>
                    Subtotal {placeLabel(i)}
                  </Text>
                  <Text style={{ fontWeight: '700', color: '#111', flex: 1, textAlign: 'right' }}>
                    {formatEuro(baseTotal + extrasTotal)}
                  </Text>
                </View>
              </View>
            ))
          ) : (
            <>
              <Row
                label={`Estancia (${nights} noche${nights !== 1 ? 's' : ''})`}
                value={formatEuro((reservation.nightly_amount_cents ?? 0) * nights)}
              />
              {extras.length > 0 && (
                <Row
                  label="Extras"
                  value={formatEuro(extras.reduce((s, e) => s + e.line_total_cents, 0))}
                />
              )}
            </>
          )}
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total pagado</Text>
            <Text style={styles.totalValue}>{formatEuro(reservation.total_amount_cents)}</Text>
          </View>
          {refunded && (
            <View style={[styles.totalRow, { paddingTop: 4 }]}>
              <Text style={[styles.totalLabel, { color: '#c0392b' }]}>Reembolsado</Text>
              <Text style={[styles.totalValue, { color: '#c0392b' }]}>
                −{formatEuro(reservation.refund_amount_cents)}
              </Text>
            </View>
          )}
        </View>

        {/* Info — exclusiva admin */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>📋 Info</Text>
          <Row label="ID reserva" value={`#${reservation.id}`} />
          <Row label="Creada el" value={formatDate(reservation.created_at)} />
          {reservation.modified_at && (
            <Row label="Modificada el" value={formatDate(reservation.modified_at)} />
          )}
        </View>
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

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  container: { padding: 16, paddingBottom: 48 },

  backBtn: { marginBottom: 12 },
  backBtnText: { color: '#007AFF', fontWeight: '700', fontSize: 16 },

  pageTitle: { fontSize: 26, fontWeight: '800', color: '#111', marginBottom: 8 },

  badgeRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  badge: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 999 },
  badgePaid: { backgroundColor: '#e8f5e9' },
  badgeRefunded: { backgroundColor: '#e3f2fd' },
  badgeModified: { backgroundColor: '#fff3cd' },
  badgeText: { fontWeight: '700', fontSize: 13 },

  plazaLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: '#1A73E8',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 8,
    marginTop: 4,
    paddingHorizontal: 2,
  },

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

  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: '#f5f5f5',
  },
  rowLabel: { fontSize: 14, color: '#888', flex: 1 },
  rowValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111',
    textAlign: 'right',
    flex: 1,
  },

  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 12,
    marginTop: 4,
    borderTopWidth: 1.5,
    borderTopColor: '#E5E7EB',
  },
  totalLabel: { fontSize: 16, fontWeight: '800' },
  totalValue: { fontSize: 16, fontWeight: '800', color: '#111' },
});
