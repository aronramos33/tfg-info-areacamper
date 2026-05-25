import React, { useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
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
};

function formatEuro(cents: number) {
  return `${(cents / 100).toFixed(2)} €`;
}

// Converts DD/MM/YYYY or YYYY-MM-DD to YYYY-MM-DD for Supabase date column
function normalizeBirthDate(raw: string): string | null {
  if (!raw) return null;
  const ddmmyyyy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
  const m = raw.match(ddmmyyyy);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  // Si ya está en formato YYYY-MM-DD lo devolvemos tal cual
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  return null; // formato inválido → null
}
function formatDate(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('es-ES');
}

export default function SuccessPage() {
  const router = useRouter();
  const params = useLocalSearchParams<{ session_id?: string; mode?: string }>();
  const isModify = params.mode === 'modify';
  const { pending, resetPending } = usePendingReservation();
  const travelersSaved = useRef(false);

  // Tercer fallback: AsyncStorage, sobrevive recargas de bundle (OTA updates en Expo Go)
  const [asyncSessionId, setAsyncSessionId] = useState<string | undefined>(
    undefined,
  );
  useEffect(() => {
    AsyncStorage.getItem('pending_checkout_session_id').then((id) => {
      if (id) setAsyncSessionId(id);
    });
  }, []);

  const session_id =
    params.session_id ||
    pending.checkoutSessionId ||
    asyncSessionId ||
    undefined;

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
    // Si no hay session_id en ninguna fuente → no hay pago pendiente, detener carga
    if (!session_id) {
      setLoading(false);
      return;
    }
    // Si hay session_id pero la sesión aún no está lista → esperar (mantener spinner)
    if (!sessionReady) {
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
          const { data: r, error: rErr } = await supabase
            .from('reservations')
            .select(
              'id,start_date,end_date,total_amount_cents,payment_status,access_code,full_name,vehicle_brand,vehicle_model,vehicle_plate,vehicle_alias',
            )
            .eq('id', pay.reservation_id)
            .maybeSingle();
          if (rErr) console.warn('[success] modify lookup error:', rErr);
          if (r) setReservation(r as unknown as ReservationRow);
          setLoading(false);
          clearInterval(timer);
          return;
        }
      } else {
        const { data, error: pollErr } = await supabase
          .from('reservations')
          .select(
            'id,start_date,end_date,total_amount_cents,payment_status,access_code,full_name,vehicle_brand,vehicle_model,vehicle_plate,vehicle_alias',
          )
          .eq('checkout_session_id', session_id)
          .maybeSingle();

        if (pollErr)
          console.warn('[success] poll error:', JSON.stringify(pollErr));
        if (!data)
          console.log(
            '[success] tick',
            ticks,
            'session_id:',
            session_id,
            'no data yet',
          );

        if (!isMounted) return;

        if (data) {
          const reservationRow = data as unknown as ReservationRow;
          setReservation(reservationRow);
          setLoading(false);
          clearInterval(timer);
          // Save travelers + extras (client-side; extras avoid Stripe metadata size limits)
          if (!isModify && !travelersSaved.current) {
            travelersSaved.current = true;
            (async () => {
              try {
                // Travelers
                if (pending.placeConfigs.length > 0) {
                  const rows = pending.placeConfigs.flatMap((cfg, placeIndex) =>
                    (cfg.guests ?? [])
                      .filter((g) => g.full_name?.trim())
                      .map((g, guestIndex) => ({
                        reservation_id: reservationRow.id,
                        full_name: g.full_name || null,
                        doc_type: g.doc_type || null,
                        doc_number: g.doc_number || null,
                        doc_support_number: g.doc_support_number || null,
                        nationality: g.nationality || null,
                        birth_date: g.birth_date
                          ? normalizeBirthDate(g.birth_date)
                          : null,
                        gender: g.gender || null,
                        country_of_residence: g.country_of_residence || null,
                        city_of_residence: g.city_of_residence || null,
                        phone: g.phone || null,
                        email: g.email || null,
                        place_index: placeIndex,
                        is_main_traveler: placeIndex === 0 && guestIndex === 0,
                      })),
                  );
                  if (rows.length > 0)
                    await supabase.from('travelers').insert(rows);
                }
                // Extras (calculados en reservation-summary y guardados en context)
                const pendingExtras = pending.pendingExtras ?? [];
                if (pendingExtras.length > 0) {
                  await supabase.from('reservation_extras').insert(
                    pendingExtras.map((e: any) => ({
                      reservation_id: reservationRow.id,
                      extra_id: e.extra_id,
                      quantity: e.quantity,
                      pricing_type: e.pricing_type ?? 'per_night',
                      unit_amount_cents: e.unit_amount_cents,
                      line_total_cents: e.line_total_cents,
                      place_index: e.place_index ?? null,
                    })),
                  );
                }
              } catch (e) {
                console.warn('post-payment insert error:', e);
              } finally {
                AsyncStorage.removeItem('pending_checkout_session_id');
                resetPending();
              }
            })();
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
                <Text style={styles.value}>
                  {formatDate(reservation.start_date)}
                </Text>
              </View>
              <View style={styles.row}>
                <Text style={styles.label}>Salida</Text>
                <Text style={styles.value}>
                  {formatDate(reservation.end_date)}
                </Text>
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
                  <Text style={styles.value} numberOfLines={1}>
                    {reservation.full_name}
                  </Text>
                </View>
              )}
              {(reservation.vehicle_brand || reservation.vehicle_plate) && (
                <View style={styles.row}>
                  <Text style={styles.label}>Vehículo</Text>
                  <Text style={styles.value} numberOfLines={1}>
                    {[
                      reservation.vehicle_alias ??
                        `${reservation.vehicle_brand ?? ''} ${reservation.vehicle_model ?? ''}`.trim(),
                      reservation.vehicle_plate,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
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
  value: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111',
    flexShrink: 1,
    textAlign: 'right',
  },
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
