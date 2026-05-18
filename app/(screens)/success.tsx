import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { usePendingReservation } from '@/providers/PendingReservationContext';

type ReservationRow = {
  id: number;
  start_date: string | null;
  end_date: string | null;
  total_amount_cents: number | null;
  payment_status: string;
  access_code: string | null;
  full_name: string | null;
  vehicle_brand: string | null;
  vehicle_model: string | null;
  vehicle_plate: string | null;
  vehicle_alias: string | null;
  reservation_extras: Array<{
    quantity: number;
    extras: { name_es: string } | null;
  }>;
};

function formatEuro(cents: number) {
  return `${(cents / 100).toFixed(2)} €`;
}

// Converts DD/MM/YYYY or YYYY-MM-DD to YYYY-MM-DD for Supabase date column
function normalizeBirthDate(raw: string): string {
  if (!raw) return '';
  const ddmmyyyy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
  const m = raw.match(ddmmyyyy);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return raw; // assume already YYYY-MM-DD
}
function formatDate(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('es-ES');
}

export default function SuccessPage() {
  const router = useRouter();
  const { session_id, mode } = useLocalSearchParams<{
    session_id?: string;
    mode?: string;
  }>();
  const isModify = mode === 'modify';
  const { pending, resetPending } = usePendingReservation();
  const travelersSaved = useRef(false);

  const [reservation, setReservation] = useState<ReservationRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionReady, setSessionReady] = useState(false);
  const [timedOut, setTimedOut] = useState(false);

  // Esperar sesión de Supabase (deep link puede tardar en rehidratar)
  useEffect(() => {
    let alive = true;
    const init = async () => {
      const { data } = await supabase.auth.getSession();
      if (alive) setSessionReady(!!data.session);
      const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
        if (alive) setSessionReady(!!s);
      });
      return () => sub.subscription.unsubscribe();
    };
    const cleanup = init();
    return () => {
      alive = false;
      cleanup.then((fn) => fn?.());
    };
  }, []);

  // Polling hasta que el webhook cree la reserva
  useEffect(() => {
    if (!sessionReady || !session_id) {
      setLoading(false);
      return;
    }

    let isMounted = true;
    let ticks = 0;
    const MAX_TICKS = 30; // 60 segundos

    const timer = setInterval(async () => {
      ticks += 1;

      if (isModify) {
        const { data: pay } = await supabase
          .from('reservation_payments')
          .select('reservation_id, status')
          .eq('stripe_checkout_session_id', session_id)
          .maybeSingle();

        if (!isMounted) return;

        if (pay && pay.status === 'completed' && pay.reservation_id) {
          const { data: r } = await supabase
            .from('reservations')
            .select(
              'id,start_date,end_date,total_amount_cents,payment_status,access_code,full_name,vehicle_brand,vehicle_model,vehicle_plate,vehicle_alias,reservation_extras(quantity,extras(name_es))',
            )
            .eq('id', pay.reservation_id)
            .maybeSingle();
          if (r) setReservation(r as unknown as ReservationRow);
          setLoading(false);
          clearInterval(timer);
          return;
        }
      } else {
        const { data } = await supabase
          .from('reservations')
          .select(
            'id,start_date,end_date,total_amount_cents,payment_status,access_code,full_name,vehicle_brand,vehicle_model,vehicle_plate,vehicle_alias,reservation_extras(quantity,extras(name_es))',
          )
          .eq('checkout_session_id', session_id)
          .maybeSingle();

        if (!isMounted) return;

        if (data) {
          const reservationRow = data as unknown as ReservationRow;
          setReservation(reservationRow);
          setLoading(false);
          clearInterval(timer);
          // Save travelers if this is a new reservation and we have pending data
          if (!isModify && !travelersSaved.current && pending.placeConfigs.length > 0) {
            travelersSaved.current = true;
            const rows = pending.placeConfigs.map((cfg, placeIndex) => ({
              reservation_id: reservationRow.id,
              full_name: cfg.traveler.full_name,
              doc_type: cfg.traveler.doc_type,
              doc_number: cfg.traveler.doc_number,
              doc_support_number: cfg.traveler.doc_support_number || null,
              nationality: cfg.traveler.nationality,
              birth_date: normalizeBirthDate(cfg.traveler.birth_date),
              gender: cfg.traveler.gender,
              country_of_residence: cfg.traveler.country_of_residence || null,
              city_of_residence: cfg.traveler.city_of_residence || null,
              phone: cfg.traveler.phone || null,
              email: cfg.traveler.email || null,
              place_index: placeIndex,
              vehicle_id: cfg.vehicleSelection?.type === 'saved' ? cfg.vehicleSelection.vehicle.id : null,
              vehicle_brand: cfg.vehicleSelection?.type === 'saved' ? cfg.vehicleSelection.vehicle.brand : null,
              vehicle_model: cfg.vehicleSelection?.type === 'saved' ? cfg.vehicleSelection.vehicle.model : null,
              vehicle_plate: cfg.vehicleSelection?.type === 'saved' ? cfg.vehicleSelection.vehicle.plate : null,
              vehicle_alias: cfg.vehicleSelection?.type === 'saved' ? cfg.vehicleSelection.vehicle.alias : null,
              vehicle_length_m: cfg.vehicleSelection?.type === 'saved' ? cfg.vehicleSelection.vehicle.length_m : null,
            }));
            supabase.from('travelers').insert(rows).then(() => resetPending());
          }
          return;
        }
      }

      if (ticks >= MAX_TICKS) {
        setLoading(false);
        setTimedOut(true);
        clearInterval(timer);
      }
    }, 2000);

    return () => {
      isMounted = false;
      clearInterval(timer);
    };
  }, [session_id, sessionReady, isModify]);

  const isPaid = reservation?.payment_status === 'paid';

  return (
    <View style={styles.container}>
      {loading ? (
        <>
          <ActivityIndicator size="large" />
          <Text style={styles.subtle}>
            {isModify ? 'Aplicando tus cambios…' : 'Confirmando tu reserva…'}
          </Text>
          <Text style={[styles.subtle, { marginTop: 4 }]}>
            Esto puede tardar unos segundos.
          </Text>
        </>
      ) : timedOut && !reservation ? (
        <>
          <Ionicons name="time-outline" size={80} color="#FF9500" />
          <Text style={styles.title}>Pago recibido</Text>
          <Text style={[styles.subtle, { textAlign: 'center' }]}>
            El pago se ha procesado pero{' '}
            {isModify
              ? 'la modificación está tardando en aplicarse'
              : 'la reserva está tardando en confirmarse'}
            . Revisa tus reservas en unos minutos.
          </Text>
          <Pressable
            style={styles.primaryButton}
            onPress={() => router.replace('/(main)/qr')}
          >
            <Text style={styles.primaryText}>Ir a mis reservas</Text>
          </Pressable>
        </>
      ) : (
        <>
          <Ionicons
            name={isPaid ? 'checkmark-circle' : 'time'}
            size={90}
            color={isPaid ? '#4CAF50' : '#FF9500'}
          />
          <Text style={styles.title}>
            {isModify
              ? '¡Reserva actualizada!'
              : isPaid
                ? '¡Reserva confirmada!'
                : 'Procesando…'}
          </Text>

          {reservation && (
            <View style={styles.card}>
              <View style={styles.row}>
                <Text style={styles.label}>Entrada</Text>
                <Text style={styles.value}>{formatDate(reservation.start_date)}</Text>
              </View>
              <View style={styles.row}>
                <Text style={styles.label}>Salida</Text>
                <Text style={styles.value}>{formatDate(reservation.end_date)}</Text>
              </View>
              <View style={styles.row}>
                <Text style={styles.label}>Total</Text>
                <Text style={[styles.value, styles.valueHighlight]}>
                  {formatEuro(reservation.total_amount_cents ?? 0)}
                </Text>
              </View>

              <View style={styles.divider} />

              {reservation.full_name && (
                <View style={styles.row}>
                  <Text style={styles.label}>Titular</Text>
                  <Text style={styles.value} numberOfLines={1}>{reservation.full_name}</Text>
                </View>
              )}
              {(reservation.vehicle_brand || reservation.vehicle_plate) && (
                <View style={styles.row}>
                  <Text style={styles.label}>Vehículo</Text>
                  <Text style={styles.value} numberOfLines={1}>
                    {[reservation.vehicle_alias ?? `${reservation.vehicle_brand ?? ''} ${reservation.vehicle_model ?? ''}`.trim(), reservation.vehicle_plate]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                </View>
              )}
              {reservation.reservation_extras.length > 0 && (
                <View style={styles.row}>
                  <Text style={styles.label}>Extras</Text>
                  <Text style={styles.value} numberOfLines={2}>
                    {reservation.reservation_extras
                      .map((e) =>
                        e.quantity > 1
                          ? `${e.extras?.name_es} ×${e.quantity}`
                          : e.extras?.name_es,
                      )
                      .filter(Boolean)
                      .join(', ')}
                  </Text>
                </View>
              )}
            </View>
          )}

          <Pressable
            style={[styles.primaryButton, !isPaid && styles.primaryDisabled]}
            disabled={!isPaid}
            onPress={() =>
              router.replace({
                pathname: '/(main)/qr',
                params: reservation
                  ? { reservation_id: String(reservation.id) }
                  : {},
              })
            }
          >
            <Text style={styles.primaryText}>
              {isPaid ? 'Ver mi código QR' : 'Esperando confirmación…'}
            </Text>
          </Pressable>

          <Pressable
            style={styles.secondaryButton}
            onPress={() => router.replace('/(main)/qr')}
          >
            <Text style={styles.secondaryText}>Ir a mis reservas</Text>
          </Pressable>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    gap: 16,
  },
  title: { fontSize: 26, fontWeight: '700', textAlign: 'center' },
  subtle: { fontSize: 13, color: '#888', textAlign: 'center' },
  card: {
    width: '100%',
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 16,
    elevation: 3,
    gap: 10,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  label: { fontSize: 13, color: '#888', flexShrink: 0 },
  value: { fontSize: 14, fontWeight: '600', color: '#111', flexShrink: 1, textAlign: 'right' },
  valueHighlight: { color: '#007AFF', fontSize: 15 },
  divider: { height: 1, backgroundColor: '#f0f0f0' },
  primaryButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 14,
    width: '100%',
    borderRadius: 12,
    alignItems: 'center',
  },
  primaryDisabled: { opacity: 0.5 },
  primaryText: { color: 'white', fontSize: 15, fontWeight: '700' },
  secondaryButton: {
    paddingVertical: 12,
    width: '100%',
    borderRadius: 12,
    alignItems: 'center',
  },
  secondaryText: { color: '#007AFF', fontSize: 15, fontWeight: '600' },
});
