import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Pressable,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import dayjs from 'dayjs';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../../lib/supabase';
import { AppAlert } from '../../../components/AppAlert';
import { nightsBetween } from '../../../components/utils/dates';
import { colors, radii, shadow, spacing, typography } from '@/lib/theme';

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
  const { reservationId } = useLocalSearchParams<{ reservationId: string }>();
  const router = useRouter();

  const [reservation, setReservation] = useState<ReservationDetail | null>(null);
  const [extras, setExtras] = useState<ExtraLine[]>([]);
  const [travelers, setTravelers] = useState<TravelerRow[]>([]);
  const [placeNames, setPlaceNames] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);

  const goBack = useCallback(() => router.back(), [router]);

  useFocusEffect(
    useCallback(() => {
      if (!reservationId) return;
      let alive = true;

      const load = async () => {
        setLoading(true);
        const { data: r, error } = await supabase
          .from('reservations')
          .select('id,full_name,dni,phone,vehicle_brand,vehicle_model,vehicle_plate,vehicle_alias,vehicles_snapshot,start_date,end_date,place_ids,num_places,nightly_amount_cents,total_amount_cents,refund_amount_cents,payment_status,status,modified_at,created_at')
          .eq('id', Number(reservationId))
          .single();

        if (!alive) return;
        if (error || !r) { AppAlert.alert('Error', 'No se pudo cargar la reserva.'); goBack(); return; }
        const typed = r as ReservationDetail;
        setReservation(typed);

        if (typed.place_ids?.length) {
          const { data: placesData } = await supabase.from('places').select('id, name').in('id', typed.place_ids);
          if (placesData && alive) {
            const map: Record<number, string> = {};
            for (const p of placesData) map[p.id as number] = p.name as string;
            setPlaceNames(map);
          }
        }

        const [extrasRes, travelersRes] = await Promise.all([
          supabase.from('reservation_extras')
            .select('place_index, quantity, unit_amount_cents, line_total_cents, extras(code, name_es)')
            .eq('reservation_id', Number(reservationId))
            .order('place_index', { ascending: true }),
          supabase.from('travelers')
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
        <ActivityIndicator size="large" color={colors.primary} />
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

  const plazaData = Array.from({ length: numPlaces }, (_, i) => {
    const snap = reservation.vehicles_snapshot?.find(s => s.place_index === i);
    const vehicle = snap ?? (i === 0 ? { place_index: 0, vehicle_id: null, brand: reservation.vehicle_brand ?? '', model: reservation.vehicle_model ?? '', plate: reservation.vehicle_plate ?? '', alias: reservation.vehicle_alias } : null);
    const plazaTravelers = travelers.filter(t => (t.place_index ?? 0) === i);
    const plazaExtras = hasPlaceIndex ? extras.filter(e => (e.place_index ?? 0) === i) : (i === 0 ? extras : []);
    const extrasTotal = plazaExtras.reduce((s, e) => s + e.line_total_cents, 0);
    const baseTotal = (reservation.nightly_amount_cents ?? 0) * nights;
    return { vehicle, plazaTravelers, plazaExtras, extrasTotal, baseTotal };
  });

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView contentContainerStyle={styles.container}>
        <Pressable onPress={goBack} style={styles.backBtn}>
          <Text style={styles.backBtnText}>‹ Volver</Text>
        </Pressable>

        <Text style={styles.pageTitle}>Reserva #{reservation.id}</Text>

        <View style={styles.badgeRow}>
          <View style={[styles.badge, reservation.payment_status === 'paid' ? styles.badgePaid : styles.badgeRefunded]}>
            <Text style={[styles.badgeText, reservation.payment_status === 'paid' ? { color: colors.confirmedText } : { color: '#2c3e82' }]}>
              {reservation.payment_status === 'paid' ? 'Pagada' : 'Reembolsada'}
            </Text>
          </View>
          {reservation.modified_at && (
            <View style={[styles.badge, styles.badgeModified]}>
              <Text style={[styles.badgeText, { color: colors.modifiedText }]}>Modificada</Text>
            </View>
          )}
        </View>

        <View style={styles.card}>
          <CardTitle name="person-outline" label="Titular" />
          <Row label="Nombre" value={reservation.full_name ?? '—'} />
          <Row label="DNI/NIE" value={reservation.dni ?? '—'} />
          <Row label="Teléfono" value={reservation.phone ?? '—'} />
        </View>

        <View style={styles.card}>
          <CardTitle name="leaf-outline" label="Estancia" />
          <Row label="Entrada" value={formatDate(reservation.start_date)} />
          <Row label="Salida" value={formatDate(reservation.end_date)} />
          <Row label="Noches" value={String(nights)} />
          {allPlacesLabel && <Row label={numPlaces > 1 ? 'Plazas' : 'Plaza'} value={allPlacesLabel} />}
        </View>

        {plazaData.map(({ vehicle, plazaTravelers, plazaExtras }, i) => (
          <View key={i}>
            {numPlaces > 1 && <Text style={styles.plazaLabel}>{placeLabel(i)}</Text>}

            {vehicle && (vehicle.plate || vehicle.brand) && (
              <View style={styles.card}>
                <CardTitle name="car-outline" label="Vehículo" />
                {vehicle.alias ? <Row label="Alias" value={vehicle.alias} /> : null}
                <Row label="Vehículo" value={[vehicle.brand, vehicle.model].filter(Boolean).join(' ') || '—'} />
                <Row label="Matrícula" value={vehicle.plate || '—'} />
              </View>
            )}

            {plazaTravelers.length > 0 && (
              <View style={styles.card}>
                <CardTitle name="id-card-outline" label="Viajeros" />
                {plazaTravelers.map((t, ti) => (
                  <View key={t.id} style={ti > 0 ? { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.outlineVariant } : undefined}>
                    <Text style={{ fontFamily: 'PlusJakartaSans_700Bold', fontSize: 14, color: colors.onSurface, marginBottom: 4 }}>
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

            {plazaTravelers.length === 0 && (
              <View style={[styles.card, { borderLeftWidth: 3, borderLeftColor: colors.warning }]}>
                <Text style={{ ...typography.labelMd, color: colors.warningText, fontFamily: 'Inter_400Regular', letterSpacing: 0 }}>
                  Sin datos de viajeros registrados
                </Text>
              </View>
            )}

            {plazaExtras.length > 0 && (
              <View style={styles.card}>
                <CardTitle name="star-outline" label="Extras" />
                {plazaExtras.map((e, ei) => (
                  <Row key={ei} label={`${e.extras?.name_es ?? '—'}${e.quantity > 1 ? ` ×${e.quantity}` : ''}`} value={formatEuro(e.line_total_cents)} />
                ))}
              </View>
            )}
          </View>
        ))}

        <View style={styles.card}>
          <CardTitle name="cash-outline" label="Desglose" />
          {numPlaces > 1 ? (
            plazaData.map(({ extrasTotal, baseTotal }, i) => (
              <View key={i} style={{ marginBottom: 10 }}>
                <Text style={{ ...typography.labelSm, color: colors.secondary, marginBottom: 4 }}>{placeLabel(i)}</Text>
                <Row label={`${nights} noche${nights !== 1 ? 's' : ''} × ${formatEuro(reservation.nightly_amount_cents)}`} value={formatEuro(baseTotal)} />
                {extrasTotal > 0 && <Row label="Extras" value={formatEuro(extrasTotal)} />}
                <View style={[styles.row, { borderBottomWidth: 0, paddingTop: 2 }]}>
                  <Text style={{ ...typography.titleSm, color: colors.onSurface, flex: 1 }}>Subtotal {placeLabel(i)}</Text>
                  <Text style={{ fontFamily: 'PlusJakartaSans_700Bold', fontSize: 14, color: colors.onSurface, flex: 1, textAlign: 'right' }}>{formatEuro(baseTotal + extrasTotal)}</Text>
                </View>
              </View>
            ))
          ) : (
            <>
              <Row label={`Estancia (${nights} noche${nights !== 1 ? 's' : ''})`} value={formatEuro((reservation.nightly_amount_cents ?? 0) * nights)} />
              {extras.length > 0 && <Row label="Extras" value={formatEuro(extras.reduce((s, e) => s + e.line_total_cents, 0))} />}
            </>
          )}
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total pagado</Text>
            <Text style={styles.totalValue}>{formatEuro(reservation.total_amount_cents)}</Text>
          </View>
          {refunded && (
            <View style={[styles.totalRow, { paddingTop: 4 }]}>
              <Text style={[styles.totalLabel, { color: colors.error }]}>Reembolsado</Text>
              <Text style={[styles.totalValue, { color: colors.error }]}>−{formatEuro(reservation.refund_amount_cents)}</Text>
            </View>
          )}
        </View>

        <View style={styles.card}>
          <CardTitle name="information-circle-outline" label="Info" />
          <Row label="ID reserva" value={`#${reservation.id}`} />
          <Row label="Creada el" value={formatDate(reservation.created_at)} />
          {reservation.modified_at && <Row label="Modificada el" value={formatDate(reservation.modified_at)} />}
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

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];
function CardTitle({ name, label }: { name: IoniconsName; label: string }) {
  return (
    <View style={styles.cardTitleRow}>
      <Ionicons name={name} size={20} color={colors.onSurface} />
      <Text style={styles.cardTitle}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background },
  container: { padding: spacing.lg, paddingBottom: 48 },

  backBtn: { marginBottom: 12 },
  backBtnText: { ...typography.titleMd, color: colors.secondary },

  pageTitle: { ...typography.headlineMd, marginBottom: 8 },

  badgeRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  badge: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: radii.full },
  badgePaid: { backgroundColor: colors.confirmedBg },
  badgeRefunded: { backgroundColor: colors.modifiedBg },
  badgeModified: { backgroundColor: colors.checkedInBg },
  badgeText: { fontFamily: 'Inter_700Bold', fontSize: 13 },

  plazaLabel: { ...typography.labelSm, color: colors.secondary, marginBottom: 8, marginTop: 4, paddingHorizontal: 2 },

  card: {
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: radii.lg,
    padding: spacing.lg,
    marginBottom: 14,
    ...shadow.sm,
  },
  cardTitleRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8, marginBottom: 10 },
  cardTitle: { ...typography.titleLg, lineHeight: 22 },

  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: colors.outlineVariant,
  },
  rowLabel: { ...typography.bodyMd, flex: 1 },
  rowValue: { ...typography.titleSm, color: colors.onSurface, textAlign: 'right', flex: 1 },

  totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 12, marginTop: 4, borderTopWidth: 1, borderTopColor: colors.outline },
  totalLabel: { ...typography.titleLg },
  totalValue: { ...typography.titleLg, color: colors.onSurface },
});
