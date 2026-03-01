import React, { useEffect, useState } from 'react';
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

type ReservationRow = {
  id: number;
  start_date: string | null;
  end_date: string | null;
  total_amount_cents: number | null;
  payment_status: string;
  access_code: string | null;
};

function formatEuro(cents: number) {
  return `${(cents / 100).toFixed(2)} €`;
}
function formatDate(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('es-ES');
}

export default function SuccessPage() {
  const router = useRouter();
  const { session_id } = useLocalSearchParams<{ session_id?: string }>();

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

      const { data } = await supabase
        .from('reservations')
        .select(
          'id,start_date,end_date,total_amount_cents,payment_status,access_code',
        )
        .eq('checkout_session_id', session_id)
        .maybeSingle();

      if (!isMounted) return;

      if (data) {
        setReservation(data as ReservationRow);
        setLoading(false);
        clearInterval(timer);
        return;
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
  }, [session_id, sessionReady]);

  const isPaid = reservation?.payment_status === 'paid';

  return (
    <View style={styles.container}>
      {loading ? (
        <>
          <ActivityIndicator size="large" />
          <Text style={styles.subtle}>Confirmando tu reserva…</Text>
          <Text style={[styles.subtle, { marginTop: 4 }]}>
            Esto puede tardar unos segundos.
          </Text>
        </>
      ) : timedOut && !reservation ? (
        <>
          <Ionicons name="time-outline" size={80} color="#FF9500" />
          <Text style={styles.title}>Pago recibido</Text>
          <Text style={[styles.subtle, { textAlign: 'center' }]}>
            El pago se ha procesado pero la reserva está tardando en
            confirmarse. Revisa tus reservas en unos minutos.
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
            {isPaid ? '¡Reserva confirmada!' : 'Procesando…'}
          </Text>

          {reservation && (
            <View style={styles.card}>
              <Text style={styles.label}>Entrada</Text>
              <Text style={styles.value}>
                {formatDate(reservation.start_date)}
              </Text>

              <Text style={styles.label}>Salida</Text>
              <Text style={styles.value}>
                {formatDate(reservation.end_date)}
              </Text>

              <Text style={styles.label}>Total pagado</Text>
              <Text style={styles.value}>
                {formatEuro(reservation.total_amount_cents ?? 0)}
              </Text>
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
    padding: 20,
    borderRadius: 16,
    elevation: 3,
    gap: 4,
  },
  label: { fontSize: 13, color: '#888', marginTop: 8 },
  value: { fontSize: 16, fontWeight: '600' },
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
