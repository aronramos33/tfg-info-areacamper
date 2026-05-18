import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import dayjs from 'dayjs';

import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/AuthProvider';
import RequireAuthCard from '@/components/RequireAuthCard';
import { nightsBetween } from '@/components/utils/dates';
import {
  computeRefundAmountCents,
  computeRefundTier,
  describeRefundPolicy,
} from '@/components/utils/refund';
import {
  isCancellable,
  isModifiable,
} from '@/components/utils/reservationModification';

type ReservationDetail = {
  id: number;
  start_date: string;
  end_date: string;
  status: string;
  payment_status: string;
  num_places: number | null;
  place_ids: number[] | null;
  nightly_amount_cents: number | null;
  total_amount_cents: number | null;
  refund_amount_cents: number | null;
  refund_id: string | null;
  modified_at: string | null;
  cancelled_at: string | null;
  access_code: string | null;
  vehicle_brand: string | null;
  vehicle_model: string | null;
  vehicle_plate: string | null;
  vehicle_alias: string | null;
  vehicle_length_m: number | null;
};

type ExtraLine = {
  quantity: number;
  unit_amount_cents: number;
  line_total_cents: number;
  pricing_type: string;
  extras: { code: string; name_es: string } | null;
};

type TravelerRow = {
  id: number;
  place_index: number | null;
  full_name: string;
  doc_type: string;
  doc_number: string;
  nationality: string;
  birth_date: string;
  gender: string;
  country_of_residence: string | null;
  city_of_residence: string | null;
  phone: string | null;
  email: string | null;
  vehicle_plate: string | null;
  vehicle_brand: string | null;
  vehicle_model: string | null;
};

function formatEuro(cents?: number | null) {
  return `${(Number(cents ?? 0) / 100).toFixed(2)} €`;
}
function formatDate(d?: string | null) {
  if (!d) return '—';
  return dayjs(d).format('DD/MM/YYYY');
}

export default function ReservationDetailUserScreen() {
  const { reservationId } = useLocalSearchParams<{ reservationId: string }>();
  const router = useRouter();
  const { session } = useAuth();

  const [reservation, setReservation] = useState<ReservationDetail | null>(
    null,
  );
  const [extras, setExtras] = useState<ExtraLine[]>([]);
  const [travelers, setTravelers] = useState<TravelerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);

  const load = useCallback(async () => {
    if (!reservationId || !session?.user?.id) return;
    setLoading(true);
    const { data: r } = await supabase
      .from('reservations')
      .select(
        'id,start_date,end_date,status,payment_status,num_places,place_ids,nightly_amount_cents,total_amount_cents,refund_amount_cents,refund_id,modified_at,cancelled_at,access_code,vehicle_brand,vehicle_model,vehicle_plate,vehicle_alias,vehicle_length_m',
      )
      .eq('id', Number(reservationId))
      .eq('user_id', session.user.id)
      .maybeSingle();

    if (!r) {
      setLoading(false);
      Alert.alert('Reserva no encontrada', 'No tienes acceso a esta reserva.');
      router.back();
      return;
    }
    setReservation(r as ReservationDetail);

    const [extrasRes, travelersRes] = await Promise.all([
      supabase
        .from('reservation_extras')
        .select('quantity, unit_amount_cents, line_total_cents, pricing_type, extras(code, name_es)')
        .eq('reservation_id', Number(reservationId)),
      supabase
        .from('travelers')
        .select('id, place_index, full_name, doc_type, doc_number, nationality, birth_date, gender, country_of_residence, city_of_residence, phone, email, vehicle_plate, vehicle_brand, vehicle_model')
        .eq('reservation_id', Number(reservationId))
        .order('place_index', { ascending: true }),
    ]);

    setExtras(((extrasRes.data ?? []) as unknown) as ExtraLine[]);
    setTravelers((travelersRes.data ?? []) as TravelerRow[]);
    setLoading(false);
  }, [reservationId, session?.user?.id, router]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (!session) return <RequireAuthCard />;

  if (loading || !reservation) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator />
      </SafeAreaView>
    );
  }

  const nights = nightsBetween(reservation.start_date, reservation.end_date);
  const canModify = isModifiable(reservation.start_date, reservation.status);
  const canCancel = isCancellable(reservation.start_date, reservation.status);
  const cancelled = reservation.status === 'cancelled';
  const refunded = (reservation.refund_amount_cents ?? 0) > 0;

  const handleCancel = () => {
    if (!reservation) return;
    const tier = computeRefundTier(reservation.start_date);
    const refund = computeRefundAmountCents(
      reservation.total_amount_cents ?? 0,
      tier,
    );
    const policyText = describeRefundPolicy(tier);
    const message =
      refund > 0
        ? `${policyText}. Se te reembolsarán ${formatEuro(refund)}.\n\nEl reembolso se inicia al instante, pero tu banco puede tardar entre 5 y 10 días laborables en reflejarlo en tu cuenta.\n\n¿Confirmas la cancelación?`
        : `${policyText}. La cancelación NO genera reembolso (estás dentro de las 24h previas a la entrada).\n\n¿Confirmas la cancelación?`;
    Alert.alert('Cancelar reserva', message, [
      { text: 'No', style: 'cancel' },
      {
        text: 'Sí, cancelar',
        style: 'destructive',
        onPress: async () => {
          setCancelling(true);
          const { data, error } = await supabase.functions.invoke(
            'cancel-reservation',
            { body: { reservation_id: reservation.id } },
          );
          setCancelling(false);
          if (error) {
            Alert.alert(
              'Error',
              error.message ?? 'No se pudo cancelar la reserva.',
            );
            return;
          }
          const refundedCents = Number(data?.refund_amount_cents ?? 0);
          Alert.alert(
            'Reserva cancelada',
            refundedCents > 0
              ? `Hemos iniciado un reembolso de ${formatEuro(refundedCents)} en tu método de pago.\n\nTu banco lo reflejará en tu cuenta en los próximos 5-10 días laborables.`
              : 'La reserva ha sido cancelada.',
            [
              {
                text: 'OK',
                onPress: () => {
                  void load();
                },
              },
            ],
          );
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F7F8FB' }}>
      <ScrollView contentContainerStyle={styles.container}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>‹ Volver</Text>
        </Pressable>

        <Text style={styles.title}>Reserva #{reservation.id}</Text>

        <View style={styles.badgeRow}>
          <View
            style={[
              styles.badge,
              cancelled
                ? styles.badgeCancelled
                : reservation.payment_status === 'paid'
                  ? styles.badgePaid
                  : styles.badgePending,
            ]}
          >
            <Text style={styles.badgeText}>
              {cancelled
                ? 'Cancelada'
                : reservation.payment_status === 'paid'
                  ? 'Pagada'
                  : 'Pendiente'}
            </Text>
          </View>
          {reservation.modified_at && !cancelled && (
            <View style={[styles.badge, styles.badgeModified]}>
              <Text style={styles.badgeText}>Modificada</Text>
            </View>
          )}
        </View>

        {/* Estancia */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>🏕️ Estancia</Text>
          <Row label="Entrada" value={formatDate(reservation.start_date)} />
          <Row label="Salida" value={formatDate(reservation.end_date)} />
          <Row label="Noches" value={String(nights)} />
          {(reservation.num_places ?? 1) > 1 && (
            <Row label="Plazas" value={String(reservation.num_places)} />
          )}
          {reservation.access_code && !cancelled && (
            <Row label="Código de acceso" value={reservation.access_code} />
          )}
        </View>

        {/* Vehículo */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>🚐 Vehículo</Text>
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
        </View>

        {/* Extras */}
        {extras.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>✨ Extras</Text>
            {extras.map((e, i) => (
              <Row
                key={i}
                label={`${e.extras?.name_es ?? '—'}${e.quantity > 1 ? ` ×${e.quantity}` : ''}`}
                value={formatEuro(e.line_total_cents)}
              />
            ))}
          </View>
        )}

        {/* Viajeros */}
        {travelers.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>🪪 Viajeros registrados</Text>
            {travelers.map((t, i) => (
              <View key={t.id} style={{ marginBottom: i < travelers.length - 1 ? 12 : 0 }}>
                {travelers.length > 1 && (
                  <Text style={{ fontSize: 12, fontWeight: '700', color: '#888', marginBottom: 4 }}>
                    Plaza {(t.place_index ?? i) + 1}
                  </Text>
                )}
                <Row label="Nombre" value={t.full_name} />
                <Row label="Documento" value={`${t.doc_type.toUpperCase()} ${t.doc_number}`} />
                <Row label="Nacionalidad" value={t.nationality} />
                <Row label="Nacimiento" value={t.birth_date} />
                {t.vehicle_plate && (
                  <Row
                    label="Vehículo"
                    value={[t.vehicle_brand, t.vehicle_model, t.vehicle_plate].filter(Boolean).join(' · ')}
                  />
                )}
              </View>
            ))}
          </View>
        )}

        {travelers.length === 0 && !cancelled && (
          <View style={[styles.card, { borderLeftWidth: 3, borderLeftColor: '#FF9500' }]}>
            <Text style={{ fontSize: 13, color: '#7a4f00', fontWeight: '600' }}>
              ⚠️ Viajeros pendientes de registrar
            </Text>
            <Text style={{ fontSize: 12, color: '#5c4400', marginTop: 4 }}>
              Añade los datos de los viajeros para cumplir con la normativa de registro de viajeros.
            </Text>
          </View>
        )}

        {/* Desglose */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>💰 Desglose</Text>
          <Row
            label={`Estancia (${nights} noche${nights !== 1 ? 's' : ''})`}
            value={formatEuro(
              (reservation.nightly_amount_cents ?? 0) *
                nights *
                (reservation.num_places ?? 1),
            )}
          />
          {extras.length > 0 && (
            <Row
              label="Extras"
              value={formatEuro(
                extras.reduce((s, e) => s + e.line_total_cents, 0),
              )}
            />
          )}
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total pagado</Text>
            <Text style={styles.totalValue}>
              {formatEuro(reservation.total_amount_cents)}
            </Text>
          </View>
          {refunded && (
            <View style={[styles.totalRow, { paddingTop: 4 }]}>
              <Text style={[styles.totalLabel, { color: '#c0392b' }]}>
                Reembolsado
              </Text>
              <Text style={[styles.totalValue, { color: '#c0392b' }]}>
                −{formatEuro(reservation.refund_amount_cents)}
              </Text>
            </View>
          )}
        </View>

        {refunded && (
          <View style={styles.refundNote}>
            <Text style={styles.refundNoteTitle}>💸 Estado del reembolso</Text>
            <Text style={styles.refundNoteText}>
              El reembolso se inició al cancelar/modificar la reserva. Tu banco
              lo reflejará en tu cuenta en los próximos 5-10 días laborables.
            </Text>
          </View>
        )}

        {/* Acciones */}
        {(canModify || canCancel) && (
          <View style={styles.actionsRow}>
            {canModify && (
              <Pressable
                onPress={() =>
                  router.push(`/(main)/qr/${reservation.id}/edit`)
                }
                style={[styles.actionBtn, styles.modifyBtn]}
              >
                <Text style={styles.modifyBtnText}>Modificar reserva</Text>
              </Pressable>
            )}
            {canCancel && (
              <Pressable
                onPress={handleCancel}
                disabled={cancelling}
                style={[
                  styles.actionBtn,
                  styles.cancelBtn,
                  cancelling && { opacity: 0.5 },
                ]}
              >
                <Text style={styles.cancelBtnText}>
                  {cancelling ? 'Cancelando…' : 'Cancelar reserva'}
                </Text>
              </Pressable>
            )}
          </View>
        )}

        {!canModify && !cancelled && (
          <Text style={styles.infoText}>
            La reserva ya no se puede modificar (la estancia ha comenzado).
          </Text>
        )}
        {cancelled && (
          <Text style={styles.infoText}>
            Esta reserva fue cancelada el{' '}
            {formatDate(reservation.cancelled_at)}.
          </Text>
        )}
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
  backText: { color: '#007AFF', fontWeight: '700', fontSize: 16 },
  title: { fontSize: 26, fontWeight: '800', color: '#111', marginBottom: 8 },

  badgeRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  badge: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
  },
  badgePaid: { backgroundColor: '#e8f5e9' },
  badgePending: { backgroundColor: '#fff3cd' },
  badgeCancelled: { backgroundColor: '#fdecea' },
  badgeModified: { backgroundColor: '#e3f2fd' },
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

  actionsRow: { gap: 12, marginTop: 8 },
  actionBtn: {
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
  },
  modifyBtn: { backgroundColor: '#1A73E8' },
  modifyBtnText: { color: 'white', fontWeight: '700', fontSize: 15 },
  cancelBtn: {
    backgroundColor: 'white',
    borderWidth: 2,
    borderColor: '#c0392b',
  },
  cancelBtnText: { color: '#c0392b', fontWeight: '700', fontSize: 15 },

  infoText: {
    color: '#888',
    fontStyle: 'italic',
    marginTop: 8,
    textAlign: 'center',
  },
  refundNote: {
    backgroundColor: '#fff4e5',
    borderRadius: 12,
    padding: 14,
    marginBottom: 14,
    borderLeftWidth: 4,
    borderLeftColor: '#FF9500',
  },
  refundNoteTitle: {
    fontWeight: '800',
    marginBottom: 4,
    color: '#7a4f00',
  },
  refundNoteText: {
    color: '#5c4400',
    fontSize: 13,
    lineHeight: 18,
  },
});
