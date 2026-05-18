import { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import dayjs from 'dayjs';
import CalendarRangePaged from '@/components/CalendarRangePaged';
import { nightsBetween } from '@/components/utils/dates';
import { formatCents } from '@/components/utils/money';
import { usePendingReservation } from '@/providers/PendingReservationContext';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/AuthProvider';

const MONTHS_WINDOW = 12;

type ActiveReservation = {
  start_date: string;
  end_date: string;
  num_places: number;
  user_id: string;
};

function computeDisabledDates(
  reservations: ActiveReservation[],
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
      const [placesRes, reservationsRes] = await Promise.all([
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
      ]);

      const totalPlaces = placesRes.count ?? 0;
      const allReservations = (reservationsRes.data ?? []) as ActiveReservation[];

      setDisabledDates(
        computeDisabledDates(
          allReservations,
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
    router.push('/(screens)/place-picker');
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F8F9FC' }}>
      <View style={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 8 }}>
        <Text style={{ fontSize: 22, fontWeight: '700', marginBottom: 2 }}>
          Seleccionar fechas
        </Text>
        <Text style={{ fontSize: 13, color: '#888' }}>
          {pending.numPlaces} plaza{pending.numPlaces !== 1 ? 's' : ''} · Solo se muestran fechas con disponibilidad suficiente.
        </Text>
      </View>

      {loading ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" />
        </View>
      ) : (
        <View style={{ flex: 1, paddingHorizontal: 16 }}>
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

      <View style={{ padding: 20, gap: 8 }}>
        {canContinue && (
          <Text style={{ fontSize: 13, color: '#555', textAlign: 'center' }}>
            {nights} noche{nights !== 1 ? 's' : ''} · Base estimada:{' '}
            {formatCents(estimatedTotal)}
          </Text>
        )}
        <Pressable
          onPress={handleContinue}
          disabled={!canContinue || loading}
          style={({ pressed }) => ({
            backgroundColor: '#111',
            paddingVertical: 16,
            borderRadius: 14,
            alignItems: 'center',
            opacity: !canContinue || loading || pressed ? 0.4 : 1,
          })}
        >
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>
            Elegir plazas concretas →
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
