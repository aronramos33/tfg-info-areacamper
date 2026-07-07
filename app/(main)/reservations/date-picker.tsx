import { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import dayjs from 'dayjs';
import CalendarRangePaged from '@/components/CalendarRangePaged';
import { nightsBetween } from '@/components/utils/dates';
import { formatCents } from '@/components/utils/money';
import { usePendingReservation } from '@/providers/PendingReservationContext';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/AuthProvider';
import { colors, radii, shadow, spacing, typography } from '@/lib/theme';
import StepProgress from '@/components/StepProgress';

const MONTHS_WINDOW = 12;

type ActiveReservation = {
  start_date: string;
  end_date: string;
  num_places: number;
  user_id: string;
};

type MaintenanceBlock = {
  place_id: number;
  starts_on: string;
  ends_on: string;
};

function computeDisabledDates(
  reservations: ActiveReservation[],
  maintenanceBlocks: MaintenanceBlock[],
  totalPlaces: number,
  numPlaces: number,
  userId: string | undefined,
  todayStr: string,
  windowEndStr: string,
): string[] {
  const disabled = new Set<string>();
  let cur = dayjs(todayStr);
  const windowEnd = dayjs(windowEndStr);

  while (!cur.isAfter(windowEnd)) {
    const d = cur.format('YYYY-MM-DD');
    let occupiedCount = 0;
    let userHasReservation = false;

    for (const r of reservations) {
      if (r.start_date <= d && r.end_date > d) {
        occupiedCount += r.num_places;
        if (userId && r.user_id === userId) userHasReservation = true;
      }
    }

    for (const b of maintenanceBlocks) {
      if (b.starts_on <= d && b.ends_on > d) occupiedCount += 1;
    }

    const freePlaces = totalPlaces - occupiedCount;
    if (userHasReservation || freePlaces < numPlaces) {
      disabled.add(d);
    }
    cur = cur.add(1, 'day');
  }

  return [...disabled];
}

export default function DatePickerScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const { pending, setPending } = usePendingReservation();

  const [startId, setStartId] = useState<string | undefined>();
  const [endId, setEndId] = useState<string | undefined>();
  const [disabledDates, setDisabledDates] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const nights = useMemo(() => nightsBetween(startId, endId), [startId, endId]);
  const canContinue = Boolean(startId && endId && nights > 0);
  const estimatedTotal = nights * pending.nightlyCents * pending.numPlaces;

  useEffect(() => {
    const todayStr = dayjs().startOf('day').format('YYYY-MM-DD');
    const windowEndStr = dayjs()
      .startOf('day')
      .add(MONTHS_WINDOW - 1, 'month')
      .endOf('month')
      .format('YYYY-MM-DD');

    async function load() {
      const [placesRes, reservationsRes, maintenanceRes] = await Promise.all([
        supabase
          .from('places')
          .select('id', { count: 'exact', head: true })
          .eq('is_active', true),
        supabase
          .from('reservations')
          .select('start_date, end_date, num_places, user_id')
          .neq('status', 'cancelled')
          .eq('payment_status', 'paid')
          .lt('start_date', windowEndStr)
          .gt('end_date', todayStr),
        supabase
          .from('maintenance_blocks')
          .select('place_id, starts_on, ends_on')
          .lt('starts_on', windowEndStr)
          .gt('ends_on', todayStr),
      ]);

      const totalPlaces = placesRes.count ?? 0;
      const allReservations = (reservationsRes.data ?? []) as ActiveReservation[];
      const allBlocks = (maintenanceRes.data ?? []) as MaintenanceBlock[];

      setDisabledDates(
        computeDisabledDates(
          allReservations,
          allBlocks,
          totalPlaces,
          pending.numPlaces,
          session?.user.id,
          todayStr,
          windowEndStr,
        ),
      );
      setLoading(false);
    }

    load();
  }, [pending.numPlaces, session?.user.id]);

  const handleContinue = () => {
    setPending((prev) => ({
      ...prev,
      startDate: startId!,
      endDate: endId!,
    }));
    router.push('/(main)/reservations/place-picker');
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StepProgress current={3} />
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={{ paddingVertical: 4, alignSelf: 'flex-start' }}>
          <Text style={{ ...typography.titleSm, color: colors.secondary }}>‹ Volver</Text>
        </Pressable>
        <Text style={[styles.title, { marginTop: 4 }]}>Seleccionar fechas</Text>
        <Text style={styles.subtitle}>
          {pending.numPlaces} plaza{pending.numPlaces !== 1 ? 's' : ''} · Solo
          se muestran fechas con disponibilidad suficiente.
        </Text>
      </View>

      {loading ? (
        <View style={styles.loader}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <View style={styles.calendar}>
          <CalendarRangePaged
            monthsWindow={MONTHS_WINDOW}
            disabledDates={disabledDates}
            onChange={({ startId, endId }) => {
              setStartId(startId);
              setEndId(endId);
            }}
          />
        </View>
      )}

      <View style={styles.footer}>
        {canContinue && (
          <Text style={styles.nightsHint}>
            {nights} noche{nights !== 1 ? 's' : ''} · Base estimada:{' '}
            {formatCents(estimatedTotal)}
          </Text>
        )}
        <Pressable
          onPress={handleContinue}
          disabled={!canContinue || loading}
          style={({ pressed }) => [
            styles.btn,
            (!canContinue || loading || pressed) && styles.btnDisabled,
          ]}
        >
          <Text style={styles.btnText}>Elegir plazas concretas →</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: {
    paddingHorizontal: spacing['2xl'],
    paddingTop: spacing.xs,
    paddingBottom: spacing.sm,
  },
  title: { ...typography.headlineMd, marginBottom: spacing.xs },
  subtitle: { ...typography.bodyMd },
  loader: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  calendar: { flex: 1, paddingHorizontal: spacing.lg },
  footer: { padding: spacing['2xl'], gap: spacing.sm },
  nightsHint: { ...typography.bodyMd, textAlign: 'center' },
  btn: {
    backgroundColor: colors.primary,
    paddingVertical: 16,
    borderRadius: radii.md,
    alignItems: 'center',
    ...shadow.sm,
  },
  btnDisabled: { opacity: 0.4 },
  btnText: { ...typography.titleMd, color: colors.onPrimary },
});
