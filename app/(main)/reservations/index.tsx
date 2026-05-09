import { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import dayjs from 'dayjs';
import CalendarRangePaged from '@/components/CalendarRangePaged';
import { nightsBetween } from '@/components/utils/dates';
import { formatCents, NIGHTLY_CENTS } from '@/components/utils/money';
import { useAuth } from '@/providers/AuthProvider';
import { supabase } from '@/lib/supabase';

const MONTHS_WINDOW = 12;

type ActiveReservation = {
  start_date: string;
  end_date: string;
  num_places: number;
  user_id: string;
};

function computeDisabledDates(
  allReservations: ActiveReservation[],
  totalPlaces: number,
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

    for (const r of allReservations) {
      if (r.start_date <= d && r.end_date > d) {
        occupiedCount += r.num_places;
        if (userId && r.user_id === userId) userHasReservation = true;
      }
    }

    if (userHasReservation || occupiedCount >= totalPlaces) {
      disabled.add(d);
    }
    cur = cur.add(1, 'day');
  }

  return [...disabled];
}

export default function SearchScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const [startId, setStartId] = useState<string | undefined>();
  const [endId, setEndId] = useState<string | undefined>();
  const [disabledDates, setDisabledDates] = useState<string[]>([]);

  const nights = useMemo(() => nightsBetween(startId, endId), [startId, endId]);
  const totalCents = useMemo(() => nights * NIGHTLY_CENTS, [nights]);
  const canContinue = Boolean(startId && endId && nights > 0);

  useEffect(() => {
    const todayStr = dayjs().startOf('day').format('YYYY-MM-DD');
    const windowEndStr = dayjs()
      .startOf('day')
      .add(MONTHS_WINDOW - 1, 'month')
      .endOf('month')
      .format('YYYY-MM-DD');

    async function loadDisabledDates() {
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
          session?.user.id,
          todayStr,
          windowEndStr,
        ),
      );
    }

    loadDisabledDates();
  }, [session?.user.id]);

  return (
    <View style={{ flex: 1 }}>
      <View style={{ paddingHorizontal: 16, paddingTop: 40 }}>
        <Text style={{ fontSize: 20, fontWeight: '600' }}>
          Elige tus fechas
        </Text>
      </View>

      <View style={{ flex: 1, paddingHorizontal: 16, paddingTop: 16 }}>
        <CalendarRangePaged
          monthsWindow={MONTHS_WINDOW}
          disabledDates={disabledDates}
          onChange={({ startId, endId }) => {
            setStartId(startId);
            setEndId(endId);
          }}
        />
      </View>

      <View style={{ padding: 16, gap: 8 }}>
        <Text>Noches: {nights}</Text>
        <Text>Total estimado: {formatCents(totalCents)}</Text>

        <Pressable
          onPress={() => {
            if (!session) {
              router.push('/(auth)/sign-in');
              return;
            }
            router.push({
              pathname: '/(screens)/checkout',
              params: { startDate: startId!, endDate: endId! },
            });
          }}
          disabled={!canContinue}
          style={({ pressed }) => ({
            opacity: !canContinue ? 0.4 : pressed ? 0.7 : 1,
            backgroundColor: '#000',
            paddingVertical: 14,
            borderRadius: 8,
            alignItems: 'center',
            marginTop: 8,
          })}
        >
          <Text style={{ color: '#fff', fontWeight: '700' }}>CONTINUAR</Text>
        </Pressable>
      </View>
    </View>
  );
}
