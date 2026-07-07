import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import QRCode from 'react-native-qrcode-svg';
import dayjs from 'dayjs';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/AuthProvider';
import RequireAuthCard from '@/components/RequireAuthCard';
import NfcAccessModal from '@/components/NfcAccessModal';
import { colors, radii, shadow, spacing, typography } from '@/lib/theme';

type Reservation = {
  id: number;
  user_id: string;
  start_date: string;
  end_date: string;
  status: string | null;
  payment_status: string | null;
  place_ids: number[] | null;
  access_code: string | null;
  access_expires_at: string | null;
  created_at: string;
  modified_at: string | null;
  cancelled_at: string | null;
};

function formatDate(d: string) {
  return dayjs(d).format('DD/MM/YYYY');
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
  const selectedIdRef = useRef(selectedId);
  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showPast, setShowPast] = useState(false);
  const [showCancelled, setShowCancelled] = useState(false);
  const [nfcVisible, setNfcVisible] = useState(false);

  const [qrPass, setQrPass] = useState<string>('');
  const [placeNames, setPlaceNames] = useState<string[]>([]);

  const now = useMemo(() => dayjs(), []);

  useFocusEffect(
    useCallback(() => {
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
            'id,user_id,start_date,end_date,status,payment_status,place_ids,access_code,access_expires_at,created_at,modified_at,cancelled_at',
          )
          .eq('user_id', userId)
          .neq('status', 'pending')
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

        if (!selectedIdRef.current && rows.length > 0) {
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
    }, []),
  );

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
      if (isInDateWindow && isPaid) {
        active.push(r);
        continue;
      }
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

  const hasAnyReservations =
    active.length > 0 ||
    upcoming.length > 0 ||
    past.length > 0 ||
    cancelled.length > 0;

  const CHECKIN_HOUR = 14;
  const CHECKOUT_HOUR = 12;

  const qrAvailability = useMemo(() => {
    if (!selected)
      return { canShow: false, message: 'Selecciona una reserva.' };
    if (selected.payment_status !== 'paid') {
      return {
        canShow: false,
        message: 'El QR estará disponible cuando el pago esté confirmado.',
      };
    }
    const windowStart = dayjs(selected.start_date)
      .hour(CHECKIN_HOUR)
      .minute(0)
      .second(0)
      .millisecond(0);
    const windowEnd = selected.access_expires_at
      ? dayjs(selected.access_expires_at)
      : dayjs(selected.end_date)
          .hour(CHECKOUT_HOUR)
          .minute(0)
          .second(0)
          .millisecond(0);
    if (dayjs().isBefore(windowStart)) {
      return {
        canShow: false,
        message: `El QR estará disponible a partir de las ${windowStart.format('HH:mm')} del ${windowStart.format('DD/MM/YYYY')}.`,
      };
    }
    if (dayjs().isAfter(windowEnd)) {
      return { canShow: false, message: 'Este QR ya no está disponible.' };
    }
    return { canShow: true, message: '' };
  }, [selected]);

  useEffect(() => {
    const ids = selected?.place_ids;
    if (!ids?.length) {
      setPlaceNames([]);
      return;
    }
    supabase
      .from('places')
      .select('id, name')
      .in('id', ids)
      .then(({ data }) => {
        if (!data) return;
        const map: Record<number, string> = {};
        for (const p of data) map[p.id as number] = p.name as string;
        setPlaceNames(ids.map((id) => map[id] ?? `#${id}`));
      });
  }, [selected?.id]);

  useEffect(() => {
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
      setQrPass(String(data?.qr_pass ?? ''));
    };
    refresh();
    const t = setInterval(refresh, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [selected?.id, qrAvailability.canShow]);

  const qrValue = useMemo(() => {
    if (!selected?.id || !qrPass) return '';
    return JSON.stringify({ reservation_id: selected.id, qr_pass: qrPass });
  }, [selected?.id, qrPass]);

  const ReservationItem = ({ r }: { r: Reservation }) => {
    const isSelected = r.id === selectedId;
    const isCancelled = r.status === 'cancelled';
    const wasModified = !!r.modified_at && !isCancelled;

    return (
      <Pressable
        onPress={() =>
          isSelected ? router.push(`/(main)/qr/${r.id}`) : setSelectedId(r.id)
        }
        style={[styles.item, isSelected && styles.itemActive]}
      >
        <View style={styles.itemHeader}>
          <Text
            style={[styles.itemTitle, isSelected && styles.itemTitleActive]}
          >
            {formatDate(r.start_date)} → {formatDate(r.end_date)}
          </Text>
          <Text style={styles.itemChevron}>›</Text>
        </View>
        {(isCancelled || wasModified) && (
          <View style={styles.badgeRow}>
            {isCancelled && (
              <View
                style={[styles.badge, { backgroundColor: colors.cancelledBg }]}
              >
                <Text
                  style={[styles.badgeText, { color: colors.cancelledText }]}
                >
                  Cancelada
                </Text>
              </View>
            )}
            {wasModified && (
              <View
                style={[styles.badge, { backgroundColor: colors.modifiedBg }]}
              >
                <Text
                  style={[styles.badgeText, { color: colors.modifiedText }]}
                >
                  Modificada
                </Text>
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
          <ActivityIndicator color={colors.primary} />
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
              pressed && { opacity: 0.75 },
            ]}
          >
            <Text style={styles.newReservationBtnText}>+ Nueva reserva</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (!hasAnyReservations) {
    return (
      <SafeAreaView style={styles.safe}>
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
              pressed && { opacity: 0.75 },
            ]}
          >
            <Text style={styles.newReservationBtnText}>+ Nueva reserva</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        contentContainerStyle={[
          styles.container,
          { paddingBottom: insets.bottom + 24 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>Acceso</Text>

        <View style={styles.card}>
          {!selected ? (
            <Text style={styles.subtle}>No hay reservas.</Text>
          ) : (
            <>
              <View style={styles.infoRow}>
                <View style={styles.infoCell}>
                  <Text style={styles.infoLabel}>Entrada</Text>
                  <Text style={styles.infoValue}>
                    {formatDate(selected.start_date)}
                  </Text>
                </View>
                <View style={styles.infoDivider} />
                <View style={styles.infoCell}>
                  <Text style={styles.infoLabel}>Salida</Text>
                  <Text style={styles.infoValue}>
                    {formatDate(selected.end_date)}
                  </Text>
                </View>
              </View>

              <View style={{ marginTop: 14, alignItems: 'center' }}>
                {qrAvailability.canShow && qrValue ? (
                  <>
                    <View style={styles.qrWrapper}>
                      <QRCode
                        value={qrValue}
                        size={200}
                        backgroundColor={colors.background}
                      />
                    </View>
                    <Text
                      style={[
                        styles.subtle,
                        { marginTop: 10, textAlign: 'center' },
                      ]}
                    >
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
                      {qrAvailability.message}
                    </Text>
                  </>
                )}

                {placeNames.length > 0 && (
                  <View style={styles.plazasBadge}>
                    <Text style={styles.plazasLabel}>
                      {placeNames.length > 1 ? 'Plazas' : 'Plaza'}
                    </Text>
                    <Text style={styles.plazasValue}>
                      {placeNames.join(' · ')}
                    </Text>
                  </View>
                )}

                {qrAvailability.canShow && qrValue && (
                  <Pressable
                    onPress={() => setNfcVisible(true)}
                    style={({ pressed }) => [
                      styles.nfcBtn,
                      pressed && { opacity: 0.75 },
                    ]}
                  >
                    <Ionicons name="radio-outline" size={16} color={colors.secondary} />
                    <Text style={styles.nfcBtnText}>Acceso por NFC</Text>
                  </Pressable>
                )}
              </View>
            </>
          )}
        </View>

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
            {showCancelled && (
              <View style={styles.listCard}>
                {cancelled.map((r) => (
                  <ReservationItem key={r.id} r={r} />
                ))}
              </View>
            )}
          </>
        )}

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
            {showPast && (
              <View style={styles.listCard}>
                {past.map((r) => (
                  <ReservationItem key={r.id} r={r} />
                ))}
              </View>
            )}
          </>
        )}

        <Pressable
          onPress={() => router.push('/reservations')}
          style={({ pressed }) => [
            styles.newReservationBtn,
            pressed && { opacity: 0.75 },
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
  safe: { flex: 1, backgroundColor: colors.background },
  container: { padding: 18 },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },

  title: { ...typography.headlineLg, marginBottom: 14, textAlign: 'center' },
  subtle: { ...typography.bodyMd, marginTop: 4 },

  card: {
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: radii.xl,
    padding: spacing.lg,
    ...shadow.sm,
    marginBottom: spacing.md,
  },
  cardTitle: { ...typography.titleMd },

  sectionRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  section: {
    marginTop: 18,
    marginBottom: 10,
    ...typography.titleMd,
  },
  sectionToggle: {
    ...typography.titleSm,
    color: colors.secondary,
  },

  listCard: {
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: radii.lg,
    padding: 8,
    ...shadow.sm,
  },

  item: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: radii.md,
  },
  itemActive: {
    backgroundColor: colors.surfaceContainerHigh,
  },
  itemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  itemTitle: { ...typography.titleSm, color: colors.onSurfaceVariant },
  itemTitleActive: { color: colors.onSurface },
  itemChevron: { color: colors.onSurfaceVariant, fontSize: 20 },
  badgeRow: { flexDirection: 'row', gap: 6, marginTop: 8 },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: radii.full },
  badgeText: { ...typography.labelSm, letterSpacing: 0 },

  qrWrapper: {
    padding: 16,
    backgroundColor: colors.background,
    borderRadius: radii.lg,
  },
  qrPlaceholder: {
    width: 220,
    height: 220,
    borderRadius: radii.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.outline,
    justifyContent: 'center',
    alignItems: 'center',
  },
  qrPlaceholderText: { ...typography.titleSm, color: colors.onSurfaceVariant },

  newReservationBtn: {
    marginTop: 24,
    backgroundColor: colors.primary,
    paddingVertical: 16,
    paddingHorizontal: 40,
    borderRadius: radii.lg,
    alignItems: 'center',
    ...shadow.md,
  },
  newReservationBtnText: {
    ...typography.titleMd,
    color: colors.onPrimary,
  },

  infoRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 4 },
  infoCell: { flex: 1, alignItems: 'center' },
  infoLabel: { ...typography.labelSm },
  infoValue: { ...typography.titleMd, marginTop: 2 },
  infoDivider: {
    width: 1,
    backgroundColor: colors.outlineVariant,
    alignSelf: 'stretch',
    marginHorizontal: 4,
  },

  plazasBadge: {
    marginTop: 16,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceContainerHigh,
    alignItems: 'center',
    minWidth: 160,
  },
  plazasLabel: { ...typography.labelSm, color: colors.primary },
  plazasValue: { ...typography.titleLg, color: colors.primary, marginTop: 2 },

  nfcBtn: {
    marginTop: 14,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceContainerHigh,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  nfcBtnText: { ...typography.titleSm, color: colors.secondary, lineHeight: 18 },
});
