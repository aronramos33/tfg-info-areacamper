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
import { useAuth } from '@/providers/AuthProvider';
import RequireAuthCard from '@/components/RequireAuthCard';
import NfcAccessModal from '@/components/NfcAccessModal';

type Reservation = {
  id: number;
  user_id: string;
  start_date: string;
  end_date: string;
  status: string | null;
  payment_status: string | null;
  total_amount_cents: number | null;
  access_code: string | null;
  access_expires_at: string | null;
  created_at: string;
  modified_at: string | null;
  cancelled_at: string | null;
};

function formatEuro(cents?: number | null) {
  const v = Number(cents ?? 0);
  return `${(v / 100).toFixed(2)} €`;
}

function formatRange(start: string, end: string) {
  const s = dayjs(start).format('DD/MM/YYYY');
  const e = dayjs(end).format('DD/MM/YYYY');
  return `${s} → ${e}`;
}

export default function QrScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const params = useLocalSearchParams<{ reservation_id?: string }>();

  const [loading, setLoading] = useState(true);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(
    params.reservation_id ? Number(params.reservation_id) : null,
  );
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showPast, setShowPast] = useState(false);
  const [showCancelled, setShowCancelled] = useState(false);
  const [nfcVisible, setNfcVisible] = useState(false);

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
          'id,user_id,start_date,end_date,status,payment_status,total_amount_cents,access_code,access_expires_at,created_at,modified_at,cancelled_at',
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

  const { active, upcoming, past, cancelled } = useMemo(() => {
    const active: Reservation[] = [];
    const upcoming: Reservation[] = [];
    const past: Reservation[] = [];
    const cancelled: Reservation[] = [];

    for (const r of reservations) {
      // ✅ Cancelada va a su propia sección sin importar la fecha
      if (r.status === 'cancelled') {
        cancelled.push(r);
        continue;
      }

      const s = dayjs(r.start_date);
      const e = dayjs(r.end_date).endOf('day');

      const isInDateWindow = dayjs().isAfter(s) && dayjs().isBefore(e);
      const isPast = e.isBefore(dayjs());
      const isPaid = r.payment_status === 'paid';

      if (isPast) {
        past.push(r);
        continue;
      }

      // ✅ Activas SOLO si está en fechas Y pagada
      if (isInDateWindow && isPaid) {
        active.push(r);
        continue;
      }

      // ✅ Todo lo demás que no sea pasado va a próximas
      upcoming.push(r);
    }

    upcoming.sort(
      (a, b) => dayjs(a.start_date).valueOf() - dayjs(b.start_date).valueOf(),
    );
    active.sort(
      (a, b) => dayjs(a.start_date).valueOf() - dayjs(b.start_date).valueOf(),
    );
    past.sort(
      (a, b) => dayjs(b.start_date).valueOf() - dayjs(a.start_date).valueOf(),
    );
    // Canceladas ordenadas por fecha de cancelación (más recientes primero), fallback a start_date
    cancelled.sort((a, b) => {
      const da = a.cancelled_at
        ? dayjs(a.cancelled_at).valueOf()
        : dayjs(a.start_date).valueOf();
      const db = b.cancelled_at
        ? dayjs(b.cancelled_at).valueOf()
        : dayjs(b.start_date).valueOf();
      return db - da;
    });

    return { active, upcoming, past, cancelled };
  }, [reservations]);

  // ✅ NUEVO: si no hay nada en ninguna lista, mostramos estado vacío con CTA
  const hasAnyReservations =
    active.length > 0 ||
    upcoming.length > 0 ||
    past.length > 0 ||
    cancelled.length > 0;

  const qrAvailability = useMemo(() => {
    if (!selected)
      return { canShow: false, message: 'Selecciona una reserva.' };

    if (selected.payment_status !== 'paid') {
      return {
        canShow: false,
        message: 'El QR estará disponible cuando el pago esté confirmado.',
      };
    }

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
        message: `El QR estará disponible a partir de ${windowStart.format(
          'DD/MM/YYYY HH:mm',
        )}.`,
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

  // ✅ QR ahora usa qr_pass rotativo
  const qrValue = useMemo(() => {
    if (!selected?.id || !qrPass) return '';
    return JSON.stringify({
      reservation_id: selected.id,
      qr_pass: qrPass,
    });
  }, [selected?.id, qrPass]);

  const ReservationItem = ({ r }: { r: Reservation }) => {
    const isSelected = r.id === selectedId;
    const cancelled = r.status === 'cancelled';
    const wasModified = !!r.modified_at && !cancelled;

    return (
      <Pressable
        onLongPress={() => setSelectedId(r.id)}
        onPress={() => router.push(`/(main)/qr/${r.id}`)}
        style={[styles.item, isSelected && styles.itemActive]}
      >
        <View style={styles.itemHeader}>
          <Text style={styles.itemTitle}>
            {formatRange(r.start_date, r.end_date)}
          </Text>
          <Text style={styles.itemChevron}>›</Text>
        </View>
        <Text style={styles.itemSub}>{formatEuro(r.total_amount_cents)}</Text>
        {(cancelled || wasModified) && (
          <View style={styles.badgeRow}>
            {cancelled && (
              <View style={[styles.badge, styles.badgeCancelled]}>
                <Text style={styles.badgeText}>Cancelada</Text>
              </View>
            )}
            {wasModified && (
              <View style={[styles.badge, styles.badgeModified]}>
                <Text style={styles.badgeText}>Modificada</Text>
              </View>
            )}
          </View>
        )}
      </Pressable>
    );
  };

  if (!session) {
    return (
      <SafeAreaView style={styles.safe}>
        <RequireAuthCard />
      </SafeAreaView>
    );
  }

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
            onPress={() => router.push('/search')}
            style={({ pressed }) => [
              styles.newReservationBtn,
              pressed && styles.newReservationBtnPressed,
            ]}
          >
            <Text style={styles.newReservationBtnText}>+ Nueva reserva</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  // ✅ Estado vacío: no hay reservas en ninguna categoría
  if (!hasAnyReservations) {
    return (
      <SafeAreaView style={[styles.safe]}>
        <ScrollView
          contentContainerStyle={[
            styles.container,
            { paddingBottom: insets.bottom + 24, flexGrow: 1 },
          ]}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.title}>Acceso</Text>

          <View style={[styles.card, { marginTop: 8 }]}>
            <Text style={[styles.cardTitle, { textAlign: 'center' }]}>
              No tienes reservas actualmente
            </Text>
            <Text
              style={[styles.subtle, { marginTop: 10, textAlign: 'center' }]}
            >
              Cuando tengas una reserva activa o próxima, aquí verás tu QR de
              acceso.
            </Text>
          </View>

          <View style={{ flex: 1 }} />

          <Pressable
            onPress={() => router.push('/reservations')}
            style={({ pressed }) => [
              styles.newReservationBtn,
              pressed && styles.newReservationBtnPressed,
            ]}
          >
            <Text style={styles.newReservationBtnText}>+ Nueva reserva</Text>
          </Pressable>
        </ScrollView>
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
              <Text style={styles.cardTitle}>
                Periodo: {formatRange(selected.start_date, selected.end_date)}
              </Text>
              <Text style={styles.cardSub}>
                Total: {formatEuro(selected.total_amount_cents)}
              </Text>

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
                      Muestra este QR en el acceso.
                    </Text>
                    <Pressable
                      onPress={() => setNfcVisible(true)}
                      style={({ pressed }) => [
                        styles.nfcBtn,
                        pressed && { opacity: 0.7 },
                      ]}
                    >
                      <Text style={styles.nfcBtnText}>📡 Acceso por NFC</Text>
                    </Pressable>
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

        {/* Activas (solo si hay) */}
        {active.length > 0 && (
          <>
            <Text style={styles.section}>Activas</Text>
            <View style={styles.listCard}>
              {active.map((r) => (
                <ReservationItem key={r.id} r={r} />
              ))}
            </View>
          </>
        )}

        {/* Próximas (solo si hay) */}
        {upcoming.length > 0 && (
          <>
            <Text style={styles.section}>Próximas</Text>
            <View style={styles.listCard}>
              {upcoming.map((r) => (
                <ReservationItem key={r.id} r={r} />
              ))}
            </View>
          </>
        )}

        {/* Canceladas (solo si hay) */}
        {cancelled.length > 0 && (
          <>
            <Pressable
              style={[styles.sectionRow, { marginTop: 18 }]}
              onPress={() => setShowCancelled((v) => !v)}
            >
              <Text style={styles.section}>Canceladas</Text>
              <Text style={styles.sectionToggle}>
                {showCancelled ? 'Ocultar' : 'Mostrar'}
              </Text>
            </Pressable>

            {showCancelled ? (
              <View style={styles.listCard}>
                {cancelled.map((r) => (
                  <ReservationItem key={r.id} r={r} />
                ))}
              </View>
            ) : null}
          </>
        )}

        {/* Anteriores (solo si hay) */}
        {past.length > 0 && (
          <>
            <Pressable
              style={[styles.sectionRow, { marginTop: 18 }]}
              onPress={() => setShowPast((v) => !v)}
            >
              <Text style={styles.section}>Anteriores</Text>
              <Text style={styles.sectionToggle}>
                {showPast ? 'Ocultar' : 'Mostrar'}
              </Text>
            </Pressable>

            {showPast ? (
              <View style={styles.listCard}>
                {past.map((r) => (
                  <ReservationItem key={r.id} r={r} />
                ))}
              </View>
            ) : null}
          </>
        )}

        <Pressable
          onPress={() => router.push('/reservations')}
          style={({ pressed }) => [
            styles.newReservationBtn,
            pressed && styles.newReservationBtnPressed,
          ]}
        >
          <Text style={styles.newReservationBtnText}>+ Nueva reserva</Text>
        </Pressable>
      </ScrollView>

      <NfcAccessModal
        visible={nfcVisible}
        onClose={() => setNfcVisible(false)}
        kind="reservation"
      />
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
  itemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  itemTitle: { fontWeight: '800' },
  itemSub: { color: '#666', marginTop: 4 },
  itemChevron: { color: '#999', fontSize: 20, fontWeight: '700' },
  badgeRow: { flexDirection: 'row', gap: 6, marginTop: 8 },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
  },
  badgeCancelled: { backgroundColor: '#fdecea' },
  badgeModified: { backgroundColor: '#e3f2fd' },
  badgeText: { fontSize: 11, fontWeight: '700', color: '#333' },

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
  payBtn: {
    marginTop: 8,
    backgroundColor: '#1A73E8',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  payBtnText: {
    color: 'white',
    fontWeight: '700',
    fontSize: 13,
  },
  newReservationBtn: {
    marginTop: 24,
    backgroundColor: '#007AFF',
    paddingVertical: 16,
    paddingHorizontal: 40,
    borderRadius: 16,
    alignItems: 'center',
    shadowColor: '#007AFF',
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  newReservationBtnPressed: {
    backgroundColor: '#0062CC',
  },
  newReservationBtnText: {
    color: 'white',
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  nfcBtn: {
    marginTop: 14,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    backgroundColor: '#EEF4FF',
    borderWidth: 1,
    borderColor: '#1A73E8',
  },
  nfcBtnText: { color: '#1A73E8', fontWeight: '700', fontSize: 14 },
});
