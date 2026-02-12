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
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import QRCode from 'react-native-qrcode-svg';
import dayjs from 'dayjs';
import { supabase } from '@/lib/supabase';

type Reservation = {
  id: number;
  user_id: string;
  start_date: string;
  end_date: string;
  payment_status: string | null;
  total_amount_cents: number | null;
  access_code: string | null;
  access_expires_at: string | null;
  created_at: string;
};

export default function QrScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ reservation_id?: string }>();

  const [loading, setLoading] = useState(true);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(
    params.reservation_id ? Number(params.reservation_id) : null,
  );
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // ✅ NUEVO: token rotativo para el QR
  const [qrPass, setQrPass] = useState<string>('');

  // “ahora” estable (para evitar warnings/hooks)
  const now = useMemo(() => dayjs(), []);

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
          'id,user_id,start_date,end_date,payment_status,total_amount_cents,access_code,access_expires_at,created_at',
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

      // Selección por defecto:
      // 1) activa (ahora entre start/end)
      // 2) próxima
      // 3) última pasada
      if (!selectedId && rows.length > 0) {
        const active = rows.find((r) => {
          const s = dayjs(r.start_date);
          const e = dayjs(r.end_date).endOf('day');
          return now.isAfter(s) && now.isBefore(e);
        });

        const upcoming = rows.find((r) => dayjs(r.start_date).isAfter(now));
        const past = [...rows]
          .reverse()
          .find((r) => dayjs(r.end_date).endOf('day').isBefore(now));

        setSelectedId(
          (active ?? upcoming ?? past ?? rows[0])?.id ?? rows[0].id,
        );
      }

      setLoading(false);
    };

    run();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (params.reservation_id) setSelectedId(Number(params.reservation_id));
  }, [params.reservation_id]);

  const selected = useMemo(
    () => reservations.find((r) => r.id === selectedId) ?? null,
    [reservations, selectedId],
  );

  const qrAvailability = useMemo(() => {
    if (!selected)
      return { canShow: false, message: 'Selecciona una reserva.' };

    if (selected.payment_status !== 'paid') {
      return {
        canShow: false,
        message: 'El QR estará disponible cuando el pago esté confirmado.',
      };
    }

    // ✅ CAMBIO MÍNIMO: ya no dependemos de access_code para mostrar QR rotativo

    const start = dayjs(selected.start_date);
    const end = dayjs(selected.end_date).endOf('day');

    // Ventana: desde 2h antes del inicio hasta fin de estancia (o access_expires_at si existe)
    const windowStart = start.subtract(2, 'hour');
    const windowEnd = selected.access_expires_at
      ? dayjs(selected.access_expires_at)
      : end;

    if (dayjs().isBefore(windowStart)) {
      return {
        canShow: false,
        message: `El QR estará disponible a partir de ${windowStart.format('DD/MM/YYYY HH:mm')}.`,
      };
    }
    if (dayjs().isAfter(windowEnd)) {
      return { canShow: false, message: 'Este QR ya no está disponible.' };
    }

    return { canShow: true, message: '' };
  }, [selected]);

  // ✅ NUEVO: refresco automático del token QR (cada 45s)
  useEffect(() => {
    // Limpieza si no hay reserva o no se debe mostrar
    if (!selected?.id || !qrAvailability.canShow) {
      setQrPass('');
      return;
    }

    let cancelled = false;
    const REFRESH_MS = 45_000;

    const refresh = async () => {
      const { data, error } = await supabase.functions.invoke('issue-qr-pass', {
        body: { reservation_id: selected.id },
      });

      if (cancelled) return;

      if (error) {
        setQrPass('');
        return;
      }

      const pass = String(data?.qr_pass ?? '');
      setQrPass(pass);
    };

    refresh();
    const t = setInterval(refresh, REFRESH_MS);

    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [selected?.id, qrAvailability.canShow]);

  // ✅ CAMBIO: QR ahora usa qr_pass rotativo
  const qrValue = useMemo(() => {
    if (!selected?.id || !qrPass) return '';
    return JSON.stringify({
      reservation_id: selected.id,
      qr_pass: qrPass,
    });
  }, [selected?.id, qrPass]);

  if (loading) {
    return (
      <SafeAreaView style={[styles.safe, { paddingTop: insets.top }]}>
        <View style={styles.center}>
          <ActivityIndicator />
          <Text style={styles.subtle}>Cargando…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (errorMsg) {
    return (
      <SafeAreaView style={[styles.safe, { paddingTop: insets.top }]}>
        <View style={styles.center}>
          <Text style={styles.title}>Acceso</Text>
          <Text style={[styles.subtle, { marginTop: 10 }]}>{errorMsg}</Text>

          <Pressable
            style={styles.linkBtn}
            onPress={() => router.replace('/(main)/reservations')}
          >
            <Text style={styles.linkText}>Volver a Reservas</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe]}>
      <ScrollView
        contentContainerStyle={[
          styles.container,
          { paddingBottom: insets.bottom + 24 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>Acceso</Text>

        {/* Tarjeta QR */}
        <View style={styles.card}>
          {!selected ? (
            <Text style={styles.subtle}>No hay reservas.</Text>
          ) : (
            <>
              <View style={{ marginTop: 14, alignItems: 'center' }}>
                {qrAvailability.canShow && qrValue ? (
                  <>
                    <QRCode value={qrValue} size={220} />
                    <Text
                      style={[
                        styles.subtle,
                        { marginTop: 10, textAlign: 'center' },
                      ]}
                    >
                      Este QR te permite el acceso al recinto.
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
                      {qrAvailability.message}
                    </Text>
                  </>
                )}
              </View>
            </>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F7F8FB' },
  container: { padding: 18 },
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

  subtle: { color: '#666', marginTop: 4 },

  card: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 16,
    elevation: 2,
  },
  cardTitle: { fontSize: 16, fontWeight: '800' },
  cardSub: { marginTop: 6, color: '#666' },

  sectionRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  section: { marginTop: 18, marginBottom: 10, fontSize: 16, fontWeight: '800' },
  sectionToggle: { color: '#007AFF', fontWeight: '800' },

  listCard: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 8,
    elevation: 1,
  },

  item: { paddingVertical: 12, paddingHorizontal: 12, borderRadius: 12 },
  itemActive: { backgroundColor: '#EEF4FF' },
  itemTitle: { fontWeight: '800' },
  itemSub: { color: '#666', marginTop: 4 },

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
  qrPlaceholderText: { color: '#777', fontWeight: '800' },

  linkBtn: { marginTop: 18, alignItems: 'center', paddingVertical: 12 },
  linkText: { color: '#007AFF', fontWeight: '800', fontSize: 16 },
});
