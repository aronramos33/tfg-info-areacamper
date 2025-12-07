import { useMemo, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import CalendarRangePaged from '@/components/CalendarRangePaged';
import { nightsBetween } from '@/components/utils/dates';
import { formatCents, NIGHTLY_CENTS } from '@/components/utils/money';

export default function SearchScreen() {
  const router = useRouter();
  const [startId, setStartId] = useState<string | undefined>();
  const [endId, setEndId] = useState<string | undefined>();

  const nights = useMemo(() => nightsBetween(startId, endId), [startId, endId]);
  const totalCents = useMemo(() => nights * NIGHTLY_CENTS, [nights]);

  const canContinue = Boolean(startId && endId && nights > 0);

  return (
    <View style={{ flex: 1 }}>
      <View style={{ paddingHorizontal: 16, paddingTop: 40 }}>
        <Text style={{ fontSize: 20, fontWeight: '600' }}>
          Elige tus fechas
        </Text>
      </View>

      <View style={{ flex: 1, paddingHorizontal: 16, paddingTop: 16 }}>
        <CalendarRangePaged
          monthsWindow={12} // puedes bajar/subir
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
          onPress={() =>
            router.push({
              pathname: '/(screens)/checkout',
              params: { startDate: startId!, endDate: endId! },
            })
          }
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
