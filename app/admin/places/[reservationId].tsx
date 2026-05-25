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

type VehicleSnapshot = {
  place_index: number;
  vehicle_id: number | null;
  brand: string;
  model: string;
  plate: string;
  alias?: string | null;
  length_m?: number | null;
};

type ReservationDetail = {
  id: number;
  full_name: string | null;
  dni: string | null;
  phone: string | null;
  // Legacy single-vehicle fields (backward compat)
  vehicle_id: number | null;
  vehicle_brand: string | null;
  vehicle_model: string | null;
  vehicle_plate: string | null;
  vehicle_alias: string | null;
  vehicle_length_m: number | null;
  // Multi-vehicle snapshot (new reservations)
  vehicles_snapshot: VehicleSnapshot[];
  start_date: string;
  end_date: string;
  place_ids: number[] | null;
  num_places: number | null;
  nightly_amount_cents: number | null;
  total_amount_cents: number | null;
  payment_status: string;
  access_code: string | null;
  created_at: string;
};

type ExtraLine = {
  name_es: string;
  code: string;
  quantity: number;
  unit_amount_cents: number;
  line_total_cents: number;
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
function nightsBetween(start: string, end: string) {
  return Math.max(0, dayjs(end).diff(dayjs(start), 'day'));
}

export default function ReservationDetailScreen() {
  const { reservationId, from } = useLocalSearchParams<{
    reservationId: string;
    from?: string;
  }>();
  const router = useRouter();

  const [reservation, setReservation] = useState<ReservationDetail | null>(
    null,
  );
  const [extras, setExtras] = useState<ExtraLine[]>([]);
  const [travelers, setTravelers] = useState<TravelerRow[]>([]);
  const [loading, setLoading] = useState(true);

  const goBack = useCallback(() => {
    if (from === 'reservas') {
      router.replace('/admin/places/reservas');
    } else {
      router.replace('/admin/places');
    }
  }, [from, router]);

  // Interceptar botón atrás de Android
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
            'id,full_name,dni,phone,vehicle_id,vehicle_brand,vehicle_model,vehicle_plate,vehicle_alias,vehicle_length_m,vehicles_snapshot,start_date,end_date,place_ids,num_places,nightly_amount_cents,total_amount_cents,payment_status,access_code,created_at',
          )
          .eq('id', Number(reservationId))
          .single();

        if (!alive) return;

        if (error || !r) {
          Alert.alert('Error', 'No se pudo cargar la reserva.');
          goBack();
          return;
        }
        setReservation(r as ReservationDetail);

        const [extrasRes, travelersRes] = await Promise.all([
          supabase
            .from('reservation_extras')
            .select('quantity, unit_amount_cents, line_total_cents, extras(code, name_es)')
            .eq('reservation_id', Number(reservationId)),
          supabase
            .from('travelers')
            .select('id, place_index, full_name, doc_type, doc_number, doc_support_number, nationality, birth_date, gender, country_of_residence, city_of_residence, phone, email')
            .eq('reservation_id', Number(reservationId))
            .order('place_index', { ascending: true }),
        ]);

        if (!alive) return;

        if (extrasRes.data) {
          setExtras(
            extrasRes.data.map((row: any) => ({
              name_es: row.extras?.name_es ?? '—',
              code: row.extras?.code ?? '',
              quantity: row.quantity,
              unit_amount_cents: row.unit_amount_cents,
              line_total_cents: row.line_total_cents,
            })),
          );
        }
        setTravelers((travelersRes.data ?? []) as TravelerRow[]);

        setLoading(false);
      };

      load();
      return () => {
        alive = false;
      };
    }, [reservationId, goBack]),
  );

  if (loading)
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator size="large" />
      </SafeAreaView>
    );
  if (!reservation) return null;

  const n = nightsBetween(reservation.start_date, reservation.end_date);

  const extraIcon = (code: string) =>
    code === 'PERSON'
      ? '👥'
      : code === 'PET'
        ? '🐾'
        : code === 'POWER'
          ? '⚡'
          : '•';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F7F8FB' }}>
      <ScrollView contentContainerStyle={styles.container}>
        <Pressable onPress={goBack} style={styles.backBtn}>
          <Text style={styles.backBtnText}>‹ Volver</Text>
        </Pressable>

        <Text style={styles.pageTitle}>Reserva #{reservation.id}</Text>
        <View
          style={[
            styles.badge,
            reservation.payment_status === 'paid'
              ? styles.badgePaid
              : styles.badgeRefunded,
          ]}
        >
          <Text style={styles.badgeText}>
            {reservation.payment_status === 'paid'
              ? '✅ Pagada'
              : '↩️ Reembolsada'}
          </Text>
        </View>

        {/* Huésped */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>👤 Huésped</Text>
          <Row label="Nombre" value={reservation.full_name ?? '—'} />
          <Row label="DNI" value={reservation.dni ?? '—'} />
          <Row label="Teléfono" value={reservation.phone ?? '—'} />
        </View>

        {/* Vehículos */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>🚐 Vehículo{(reservation.vehicles_snapshot?.length ?? 0) > 1 ? 's' : ''}</Text>
          {(reservation.vehicles_snapshot?.length ?? 0) > 0 ? (
            reservation.vehicles_snapshot.map((v, i) => (
              <View key={i} style={{ marginBottom: i < reservation.vehicles_snapshot.length - 1 ? 10 : 0 }}>
                {reservation.vehicles_snapshot.length > 1 && (
                  <Text style={{ fontSize: 12, fontWeight: '800', color: '#444', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    Plaza {v.place_index + 1}
                  </Text>
                )}
                {v.alias ? <Row label="Alias" value={v.alias} /> : null}
                <Row
                  label="Marca y modelo"
                  value={[v.brand, v.model].filter(Boolean).join(' ') || '—'}
                />
                <Row label="Matrícula" value={v.plate || '—'} />
                {v.length_m != null && <Row label="Longitud" value={`${v.length_m} m`} />}
              </View>
            ))
          ) : (
            // Fallback para reservas antiguas sin vehicles_snapshot
            <>
              {reservation.vehicle_alias && (
                <Row label="Alias" value={reservation.vehicle_alias} />
              )}
              <Row
                label="Marca y modelo"
                value={
                  [reservation.vehicle_brand, reservation.vehicle_model]
                    .filter(Boolean)
                    .join(' ') || '—'
                }
              />
              <Row label="Matrícula" value={reservation.vehicle_plate ?? '—'} />
              {reservation.vehicle_length_m != null && (
                <Row label="Longitud" value={`${reservation.vehicle_length_m} m`} />
              )}
              {reservation.vehicle_id == null && (
                <Text style={{ color: '#888', fontSize: 12, marginTop: 6 }}>
                  ⚠️ El vehículo original ya no existe en el perfil del usuario.
                </Text>
              )}
            </>
          )}
        </View>

        {/* Estancia */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>🏕️ Estancia</Text>
          <Row label="Entrada" value={formatDate(reservation.start_date)} />
          <Row label="Salida" value={formatDate(reservation.end_date)} />
          <Row label="Noches" value={String(n)} />
          {(reservation.num_places ?? 1) > 1 && (
            <Row label="Nº de plazas" value={String(reservation.num_places)} />
          )}
          <Row
            label={`Plaza${(reservation.place_ids?.length ?? 0) > 1 ? 's' : ''}`}
            value={
              reservation.place_ids && reservation.place_ids.length > 0
                ? reservation.place_ids
                    .map((id: number) => `Nº ${id}`)
                    .join(', ')
                : '—'
            }
          />
          <Row label="Código acceso" value={reservation.access_code ?? '—'} />
        </View>

        {/* Viajeros */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>🪪 Viajeros</Text>
          {travelers.length === 0 ? (
            <Text style={{ color: '#FF9500', fontSize: 13, fontWeight: '600' }}>
              Sin datos de viajeros registrados
            </Text>
          ) : (
            travelers.map((t, i) => (
              <View key={t.id} style={{ marginBottom: i < travelers.length - 1 ? 14 : 0 }}>
                {travelers.length > 1 && (
                  <Text style={{ fontSize: 12, fontWeight: '800', color: '#444', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    Plaza {(t.place_index ?? i) + 1}
                  </Text>
                )}
                <Row label="Nombre" value={t.full_name} />
                <Row label="Documento" value={`${t.doc_type.toUpperCase()} ${t.doc_number}`} />
                {t.doc_support_number ? <Row label="Nº soporte" value={t.doc_support_number} /> : null}
                <Row label="Nacionalidad" value={t.nationality} />
                <Row label="Nacimiento" value={t.birth_date} />
                <Row label="Género" value={t.gender === 'm' ? 'Hombre' : t.gender === 'f' ? 'Mujer' : 'Otro'} />
                {t.country_of_residence ? <Row label="País residencia" value={t.country_of_residence} /> : null}
                {t.city_of_residence ? <Row label="Localidad" value={t.city_of_residence} /> : null}
                {t.phone ? <Row label="Teléfono" value={t.phone} /> : null}
                {t.email ? <Row label="Email" value={t.email} /> : null}
              </View>
            ))
          )}
        </View>

        {/* Desglose económico */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>💰 Desglose</Text>
          <Row
            label={`Estancia (${n} noche${n !== 1 ? 's' : ''} × ${formatEuro(reservation.nightly_amount_cents)}${(reservation.num_places ?? 1) > 1 ? ` × ${reservation.num_places} plazas` : ''})`}
            value={formatEuro(
              (reservation.nightly_amount_cents ?? 0) *
                n *
                (reservation.num_places ?? 1),
            )}
          />
          {extras.map((e, i) => (
            <Row
              key={i}
              label={`${extraIcon(e.code)} ${e.name_es}${e.quantity > 1 ? ` ×${e.quantity}` : ''}`}
              value={formatEuro(e.line_total_cents)}
            />
          ))}
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalValue}>
              {formatEuro(reservation.total_amount_cents)}
            </Text>
          </View>
        </View>

        {/* Meta */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>📋 Info</Text>
          <Row label="ID reserva" value={`#${reservation.id}`} />
          <Row label="Creada el" value={formatDate(reservation.created_at)} />
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

  pageTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: '#111',
    marginBottom: 8,
  },
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
    marginBottom: 16,
  },
  badgePaid: { backgroundColor: '#e8f5e9' },
  badgeRefunded: { backgroundColor: '#e3f2fd' },
  badgeText: { fontWeight: '700', fontSize: 13 },

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
  },
  totalLabel: { fontSize: 16, fontWeight: '800' },
  totalValue: { fontSize: 16, fontWeight: '800', color: '#111' },
});
