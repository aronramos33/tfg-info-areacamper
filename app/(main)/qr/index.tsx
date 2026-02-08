import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import QRCode from 'react-native-qrcode-svg';
import dayjs from 'dayjs';
import { supabase } from '@/lib/supabase';

type Reservation = {
  id: number;
  start_date: string;
  end_date: string;
  payment_status: string | null;
  total_amount_cents: number | null;
  access_code: string | null;
  access_expires_at: string | null;
  created_at: string;
};

function formatEuro(cents?: number | null) {
  const v = Number(cents ?? 0);
  return `${(v / 100).toFixed(2)} €`;
}

export default function QrScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ reservation_id?: string }>();
  const [loading, setLoading] = useState(true);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(
    params.reservation_id ? Number(params.reservation_id) : null,
  );
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Cargar reservas del usuario actual
  useEffect(() => {
    let alive = true;

    const run = async () => {
      setLoading(true);
      setErrorMsg(null);

      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user?.id;
      if (!userId) {
        if (!alive) return;
        setErrorMsg('No hay sesión iniciada.');
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from('reservations')
        .select(
          'id,start_date,end_date,payment_status,total_amount_cents,access_code,access_expires_at,created_at',
        )
        .eq('user_id', userId)
        .order('start_date', { ascending: true });

      if (!alive) return;

      if (error) {
        setErrorMsg(error.message);
        setReservations([]);
        setLoading(false);
        return;
      }

      const rows = (data ?? []) as Reservation[];
      setReservations(rows);

      // Si no hay seleccionada, selecciona la "más relevante":
      // 1) activa (hoy entre start/end)
      // 2) la próxima futura
      // 3) la última pasada
      if (!selectedId && rows.length > 0) {
        const now = dayjs();
        const active = rows.find(
          (r) =>
            now.isAfter(dayjs(r.start_date)) &&
            now.isBefore(dayjs(r.end_date).add(1, 'day')),
        );
        const upcoming = rows.find((r) => dayjs(r.start_date).isAfter(now));
        const past = [...rows]
          .reverse()
          .find((r) => dayjs(r.end_date).isBefore(now));
        setSelectedId((active ?? upcoming ?? past)?.id ?? rows[0].id);
      }

      setLoading(false);
    };

    run();
    return () => {
      alive = false;
    };
  }, [selectedId]);

  // Actualiza selectedId si llega por params
  useEffect(() => {
    if (params.reservation_id) setSelectedId(Number(params.reservation_id));
  }, [params.reservation_id]);

  const selected = useMemo(
    () => reservations.find((r) => r.id === selectedId) ?? null,
    [reservations, selectedId],
  );

  const now = useMemo(() => dayjs(), []);

  const availability = useMemo(() => {
    if (!selected) return { canShow: false, reason: 'Selecciona una reserva.' };

    if (selected.payment_status !== 'paid') {
      return {
        canShow: false,
        reason: 'El QR estará disponible cuando el pago esté confirmado.',
      };
    }

    if (!selected.access_code) {
      return {
        canShow: false,
        reason: 'Aún no se ha generado el código de acceso.',
      };
    }

    const start = dayjs(selected.start_date);
    const end = dayjs(selected.end_date);

    // Ventana: 2h antes del inicio hasta final de estancia (o access_expires_at si existe)
    const windowStart = start.subtract(2, 'hour');
    const windowEnd = selected.access_expires_at
      ? dayjs(selected.access_expires_at)
      : end.add(1, 'day');

    if (now.isBefore(windowStart)) {
      return {
        canShow: false,
        reason: `El QR estará disponible a partir de ${windowStart.format('DD/MM/YYYY HH:mm')}.`,
      };
    }

    if (now.isAfter(windowEnd)) {
      return {
        canShow: false,
        reason: 'Este QR ya no está disponible (reserva finalizada).',
      };
    }

    return { canShow: true, reason: '' };
  }, [selected, now]);

  const qrValue = useMemo(() => {
    if (!selected?.access_code) return '';
    // payload simple; si luego quieres, lo firmamos o lo hacemos JWT desde backend
    return JSON.stringify({
      reservation_id: selected.id,
      access_code: selected.access_code,
    });
  }, [selected]);

  const { upcoming, past } = useMemo(() => {
    const upcoming = reservations.filter((r) =>
      dayjs(r.end_date).isAfter(now.subtract(1, 'day')),
    );
    const past = reservations.filter((r) =>
      dayjs(r.end_date).isBefore(now.subtract(1, 'day')),
    );
    // upcoming orden asc, past desc
    upcoming.sort(
      (a, b) => dayjs(a.start_date).valueOf() - dayjs(b.start_date).valueOf(),
    );
    past.sort(
      (a, b) => dayjs(b.start_date).valueOf() - dayjs(a.start_date).valueOf(),
    );
    return { upcoming, past };
  }, [reservations, now]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
        <Text style={styles.subtle}>Cargando reservas…</Text>
      </View>
    );
  }

  if (errorMsg) {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>QR</Text>
        <Text style={{ marginTop: 8 }}>{errorMsg}</Text>
        <Pressable
          style={styles.linkBtn}
          onPress={() => router.replace('/(main)/reservations')}
        >
          <Text style={styles.linkText}>Volver a Reservas</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Tu acceso</Text>

      {/* Tarjeta QR */}
      <View style={styles.card}>
        {!selected ? (
          <Text style={styles.subtle}>No hay reserva seleccionada.</Text>
        ) : (
          <>
            <Text style={styles.h2}>Reserva #{selected.id}</Text>
            <Text style={styles.subtle}>
              {dayjs(selected.start_date).format('DD/MM/YYYY')} →{' '}
              {dayjs(selected.end_date).format('DD/MM/YYYY')}
            </Text>
            <Text style={[styles.subtle, { marginTop: 6 }]}>
              Total: {formatEuro(selected.total_amount_cents)}
            </Text>

            <View style={{ marginTop: 16, alignItems: 'center' }}>
              {availability.canShow ? (
                <>
                  <QRCode value={qrValue} size={220} />
                  <Text style={[styles.subtle, { marginTop: 10 }]}>
                    Muestra este QR en el acceso.
                  </Text>
                </>
              ) : (
                <>
                  <View style={styles.qrPlaceholder}>
                    <Text style={styles.qrPlaceholderText}>
                      QR no disponible
                    </Text>
                  </View>
                  <Text
                    style={[
                      styles.subtle,
                      { marginTop: 10, textAlign: 'center' },
                    ]}
                  >
                    {availability.reason}
                  </Text>
                </>
              )}
            </View>
          </>
        )}
      </View>

      {/* Próximas / activas */}
      <Text style={styles.section}>Activas y próximas</Text>
      <View style={styles.listCard}>
        {upcoming.length === 0 ? (
          <Text style={styles.subtle}>
            No tienes reservas activas o próximas.
          </Text>
        ) : (
          upcoming.map((r) => (
            <Pressable
              key={r.id}
              onPress={() => setSelectedId(r.id)}
              style={[styles.item, selectedId === r.id && styles.itemActive]}
            >
              <Text style={styles.itemTitle}>
                #{r.id} · {dayjs(r.start_date).format('DD/MM')} →{' '}
                {dayjs(r.end_date).format('DD/MM')}
              </Text>
              <Text style={styles.subtle}>
                Estado: {r.payment_status ?? '—'} ·{' '}
                {formatEuro(r.total_amount_cents)}
              </Text>
            </Pressable>
          ))
        )}
      </View>

      {/* Pasadas */}
      <Text style={styles.section}>Anteriores</Text>
      <View style={styles.listCard}>
        {past.length === 0 ? (
          <Text style={styles.subtle}>Aún no tienes reservas anteriores.</Text>
        ) : (
          past.map((r) => (
            <Pressable
              key={r.id}
              onPress={() => setSelectedId(r.id)}
              style={[styles.item, selectedId === r.id && styles.itemActive]}
            >
              <Text style={styles.itemTitle}>
                #{r.id} · {dayjs(r.start_date).format('DD/MM')} →{' '}
                {dayjs(r.end_date).format('DD/MM')}
              </Text>
              <Text style={styles.subtle}>
                Estado: {r.payment_status ?? '—'} ·{' '}
                {formatEuro(r.total_amount_cents)}
              </Text>
            </Pressable>
          ))
        )}
      </View>

      <Pressable
        style={styles.linkBtn}
        onPress={() => router.replace('/(main)/reservations')}
      >
        <Text style={styles.linkText}>Volver a Reservas</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 18, paddingBottom: 40, backgroundColor: '#F7F8FB' },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    marginBottom: 14,
    textAlign: 'center',
  },
  h2: { fontSize: 18, fontWeight: '800' },
  subtle: { color: '#666', marginTop: 4 },
  card: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 16,
    elevation: 2,
  },
  section: { marginTop: 18, marginBottom: 10, fontSize: 16, fontWeight: '800' },
  listCard: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 8,
    elevation: 1,
  },
  item: { padding: 12, borderRadius: 12 },
  itemActive: { backgroundColor: '#EEF4FF' },
  itemTitle: { fontWeight: '700' },
  qrPlaceholder: {
    width: 220,
    height: 220,
    borderRadius: 14,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: '#bbb',
    justifyContent: 'center',
    alignItems: 'center',
  },
  qrPlaceholderText: { color: '#777', fontWeight: '700' },
  linkBtn: { marginTop: 18, alignItems: 'center', paddingVertical: 12 },
  linkText: { color: '#007AFF', fontWeight: '800', fontSize: 16 },
});
