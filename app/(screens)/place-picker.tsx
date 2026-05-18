import { useEffect, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { usePendingReservation } from '@/providers/PendingReservationContext';
import ParkingMapPicker, { hasIsolatedGap } from '@/components/ParkingMapPicker';

type Place = { id: number; name: string };

export default function PlacePickerScreen() {
  const router = useRouter();
  const { pending, setPending } = usePendingReservation();

  const [places, setPlaces] = useState<Place[]>([]);
  const [occupiedIds, setOccupiedIds] = useState<Set<number>>(new Set());
  const [selectedIds, setSelectedIds] = useState<number[]>(
    pending.selectedPlaceIds,
  );
  const [loading, setLoading] = useState(true);

  const { numPlaces, startDate, endDate } = pending;
  const canConfirm = selectedIds.length === numPlaces;

  useEffect(() => {
    async function load() {
      const [placesRes, occupiedRes] = await Promise.all([
        supabase.from('places').select('id, name').eq('is_active', true).order('id'),
        supabase
          .from('reservations')
          .select('place_ids')
          .neq('status', 'cancelled')
          .eq('payment_status', 'paid')
          .lt('start_date', endDate)
          .gt('end_date', startDate),
      ]);

      setPlaces((placesRes.data ?? []) as Place[]);

      const occ = new Set<number>();
      for (const r of occupiedRes.data ?? []) {
        for (const pid of (r.place_ids as number[]) ?? []) occ.add(pid);
      }
      setOccupiedIds(occ);
      setLoading(false);
    }
    load();
  }, [startDate, endDate]);

  const sorted = [...places].sort((a, b) => a.id - b.id);
  const topRow = sorted.slice(0, 14).map((p) => p.id);
  const botRow = sorted.slice(14, 28).map((p) => p.id);

  const handleToggle = (id: number) => {
    const isSelected = selectedIds.includes(id);

    if (isSelected) {
      // Deselecting: check if removal creates a gap
      const next = selectedIds.filter((x) => x !== id);
      const topGap = hasIsolatedGap(topRow, occupiedIds, next);
      const botGap = hasIsolatedGap(botRow, occupiedIds, next);
      if (topGap || botGap) {
        Alert.alert(
          'Plaza aislada',
          'Deseleccionar esta plaza dejaría otra plaza totalmente aislada entre reservas. Ajusta tu selección.',
        );
        return;
      }
      setSelectedIds(next);
    } else {
      if (selectedIds.length >= numPlaces) {
        Alert.alert(
          'Límite alcanzado',
          `Solo puedes seleccionar ${numPlaces} plaza${numPlaces !== 1 ? 's' : ''}.`,
        );
        return;
      }
      // Selecting: check if addition creates a gap
      const next = [...selectedIds, id];
      const topGap = hasIsolatedGap(topRow, occupiedIds, next);
      const botGap = hasIsolatedGap(botRow, occupiedIds, next);
      if (topGap || botGap) {
        Alert.alert(
          'Plaza aislada',
          'Esta selección dejaría una plaza libre aislada entre dos reservas. Elige plazas contiguas.',
        );
        return;
      }
      setSelectedIds(next);
    }
  };

  const handleConfirm = () => {
    if (!canConfirm) return;
    setPending((prev) => ({ ...prev, selectedPlaceIds: selectedIds }));
    router.push('/(screens)/reservation-summary');
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F8F9FC' }}>
      <View style={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 12 }}>
        <Text style={{ fontSize: 22, fontWeight: '700', marginBottom: 4 }}>
          Elige tus plazas
        </Text>
        <Text style={{ fontSize: 13, color: '#888' }}>
          Selecciona exactamente {numPlaces} plaza{numPlaces !== 1 ? 's' : ''} contigua{numPlaces !== 1 ? 's' : ''}.
        </Text>
        {selectedIds.length > 0 && (
          <Text style={{ fontSize: 13, color: '#1A73E8', marginTop: 4, fontWeight: '600' }}>
            Seleccionadas: {selectedIds.sort((a, b) => a - b).map((id) => `P${id}`).join(', ')}
            {' '}({selectedIds.length}/{numPlaces})
          </Text>
        )}
      </View>

      <View style={{ flex: 1, paddingHorizontal: 12 }}>
        {loading ? (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <ActivityIndicator size="large" />
          </View>
        ) : (
          <ParkingMapPicker
            places={places}
            occupiedIds={occupiedIds}
            selectedIds={selectedIds}
            onToggle={handleToggle}
          />
        )}
      </View>

      <View style={{ padding: 20 }}>
        <Pressable
          onPress={handleConfirm}
          disabled={!canConfirm}
          style={({ pressed }) => ({
            backgroundColor: '#111',
            paddingVertical: 16,
            borderRadius: 14,
            alignItems: 'center',
            opacity: !canConfirm || pressed ? 0.4 : 1,
          })}
        >
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>
            {canConfirm
              ? `Confirmar ${numPlaces} plaza${numPlaces !== 1 ? 's' : ''} →`
              : `Selecciona ${numPlaces - selectedIds.length} más`}
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
