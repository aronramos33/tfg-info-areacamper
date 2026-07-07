import { useEffect, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { usePendingReservation } from '@/providers/PendingReservationContext';
import ParkingMapPicker, { hasIsolatedGap } from '@/components/ParkingMapPicker';
import { colors, radii, shadow, spacing, typography } from '@/lib/theme';
import StepProgress from '@/components/StepProgress';
import { AppAlert } from '@/components/AppAlert';

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
      const [placesRes, occupiedRes, maintenanceRes] = await Promise.all([
        supabase
          .from('places')
          .select('id, name')
          .eq('is_active', true)
          .order('id'),
        supabase
          .from('reservations')
          .select('place_ids')
          .neq('status', 'cancelled')
          .eq('payment_status', 'paid')
          .lt('start_date', endDate)
          .gt('end_date', startDate),
        supabase
          .from('maintenance_blocks')
          .select('place_id')
          .lt('starts_on', endDate)
          .gt('ends_on', startDate),
      ]);

      setPlaces((placesRes.data ?? []) as Place[]);

      const occ = new Set<number>();
      for (const r of occupiedRes.data ?? []) {
        for (const pid of (r.place_ids as number[]) ?? []) occ.add(pid);
      }
      for (const b of (maintenanceRes.data ?? []) as { place_id: number }[]) {
        occ.add(b.place_id);
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
      const next = selectedIds.filter((x) => x !== id);
      const topGap = hasIsolatedGap(topRow, occupiedIds, next);
      const botGap = hasIsolatedGap(botRow, occupiedIds, next);
      if (topGap || botGap) {
        AppAlert.alert(
          'Plaza aislada',
          'Deseleccionar esta plaza dejaría otra plaza totalmente aislada entre reservas. Ajusta tu selección.',
        );
        return;
      }
      setSelectedIds(next);
    } else {
      if (selectedIds.length >= numPlaces) {
        AppAlert.alert(
          'Límite alcanzado',
          `Solo puedes seleccionar ${numPlaces} plaza${numPlaces !== 1 ? 's' : ''}.`,
        );
        return;
      }
      const next = [...selectedIds, id];
      const topGap = hasIsolatedGap(topRow, occupiedIds, next);
      const botGap = hasIsolatedGap(botRow, occupiedIds, next);
      if (topGap || botGap) {
        AppAlert.alert(
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
    router.push('/(main)/reservations/reservation-summary');
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StepProgress current={4} />
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={{ paddingVertical: 4, alignSelf: 'flex-start' }}>
          <Text style={{ ...typography.titleSm, color: colors.secondary }}>‹ Volver</Text>
        </Pressable>
        <Text style={[styles.title, { marginTop: 4 }]}>Elige tus plazas</Text>
        <Text style={styles.subtitle}>
          Selecciona exactamente {numPlaces} plaza
          {numPlaces !== 1 ? 's' : ''} contigua{numPlaces !== 1 ? 's' : ''}.
        </Text>
        {selectedIds.length > 0 && (
          <Text style={styles.selectionHint}>
            Seleccionadas:{' '}
            {selectedIds
              .sort((a, b) => a - b)
              .map((id) => `P${id}`)
              .join(', ')}{' '}
            ({selectedIds.length}/{numPlaces})
          </Text>
        )}
      </View>

      <View style={styles.map}>
        {loading ? (
          <View style={styles.loader}>
            <ActivityIndicator size="large" color={colors.primary} />
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

      <View style={styles.footer}>
        <Pressable
          onPress={handleConfirm}
          disabled={!canConfirm}
          style={({ pressed }) => [
            styles.btn,
            (!canConfirm || pressed) && styles.btnDisabled,
          ]}
        >
          <Text style={styles.btnText}>
            {canConfirm
              ? `Confirmar ${numPlaces} plaza${numPlaces !== 1 ? 's' : ''} →`
              : `Selecciona ${numPlaces - selectedIds.length} más`}
          </Text>
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
    paddingBottom: spacing.md,
  },
  title: { ...typography.headlineMd, marginBottom: spacing.xs },
  subtitle: { ...typography.bodyMd },
  selectionHint: {
    ...typography.titleSm,
    color: colors.primary,
    marginTop: spacing.xs,
  },
  map: { flex: 1, paddingHorizontal: spacing.md },
  loader: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  footer: { padding: spacing['2xl'] },
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
