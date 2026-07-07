import { useEffect, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/AuthProvider';
import {
  usePendingReservation,
  emptyPlaceConfig,
} from '@/providers/PendingReservationContext';
import { NIGHTLY_CENTS } from '@/components/utils/money';
import { colors, radii, shadow, spacing, typography } from '@/lib/theme';
import StepProgress from '@/components/StepProgress';

export default function ReservationsScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const { setPending } = usePendingReservation();

  const [maxPlaces, setMaxPlaces] = useState(28);
  const [numPlaces, setNumPlaces] = useState(1);
  const [nightlyCents, setNightlyCents] = useState(NIGHTLY_CENTS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [placesRes, pricingRes] = await Promise.all([
        supabase
          .from('places')
          .select('id', { count: 'exact', head: true })
          .eq('is_active', true),
        supabase
          .from('pricing')
          .select('nightly_amount_cents')
          .eq('active', true)
          .single(),
      ]);
      if (placesRes.count) setMaxPlaces(placesRes.count);
      if (pricingRes.data)
        setNightlyCents(pricingRes.data.nightly_amount_cents);
      setLoading(false);
    }
    load();
  }, []);

  const handleContinue = () => {
    if (!session) {
      router.push('/(auth)/sign-in');
      return;
    }
    setPending((prev) => ({
      ...prev,
      numPlaces,
      nightlyCents,
      placeConfigs: Array.from(
        { length: numPlaces },
        (_, i) => prev.placeConfigs[i] ?? emptyPlaceConfig(),
      ),
    }));
    router.push('/(main)/reservations/configure-places');
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StepProgress current={1} />
      <View style={styles.body}>
        <Text style={styles.title}>¿Cuántas plazas necesitas?</Text>
        <Text style={styles.subtitle}>
          Cada plaza está pensada para una autocaravana o caravana.
        </Text>

        {loading ? (
          <ActivityIndicator
            size="large"
            color={colors.primary}
            style={{ marginBottom: 48 }}
          />
        ) : (
          <View style={styles.stepper}>
            <Pressable
              onPress={() => setNumPlaces((n) => Math.max(1, n - 1))}
              disabled={numPlaces <= 1}
              style={({ pressed }) => [
                styles.stepBtn,
                numPlaces <= 1 && styles.stepBtnDisabled,
                { opacity: pressed ? 0.7 : 1 },
              ]}
            >
              <Ionicons
                name="remove"
                size={28}
                color={
                  numPlaces <= 1 ? colors.onSurfaceVariant : colors.onPrimary
                }
              />
            </Pressable>

            <Text style={styles.counter}>{numPlaces}</Text>

            <Pressable
              onPress={() => setNumPlaces((n) => Math.min(maxPlaces, n + 1))}
              disabled={numPlaces >= maxPlaces}
              style={({ pressed }) => [
                styles.stepBtn,
                numPlaces >= maxPlaces && styles.stepBtnDisabled,
                { opacity: pressed ? 0.7 : 1 },
              ]}
            >
              <Ionicons
                name="add"
                size={28}
                color={
                  numPlaces >= maxPlaces
                    ? colors.onSurfaceVariant
                    : colors.onPrimary
                }
              />
            </Pressable>
          </View>
        )}

        <Text style={styles.maxLabel}>
          {loading
            ? 'Cargando disponibilidad…'
            : `Máximo disponible: ${maxPlaces} plaza${maxPlaces !== 1 ? 's' : ''}`}
        </Text>
      </View>

      <View style={styles.footer}>
        <Pressable
          onPress={handleContinue}
          disabled={loading}
          style={({ pressed }) => [
            styles.continueBtn,
            { opacity: pressed || loading ? 0.75 : 1 },
          ]}
        >
          <Text style={styles.continueBtnText}>
            Continuar con {numPlaces} plaza{numPlaces !== 1 ? 's' : ''}
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  body: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing['2xl'],
  },
  title: {
    ...typography.headlineMd,
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    ...typography.bodyMd,
    marginBottom: 48,
    textAlign: 'center',
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 36,
    marginBottom: 24,
  },
  stepBtn: {
    width: 56,
    height: 56,
    borderRadius: radii.full,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.sm,
  },
  stepBtnDisabled: {
    backgroundColor: colors.surfaceContainerHighest,
  },
  counter: {
    ...typography.display,
    fontSize: 72,
    minWidth: 90,
    textAlign: 'center',
  },
  maxLabel: {
    ...typography.labelMd,
    textAlign: 'center',
  },
  footer: { padding: spacing.xl },
  continueBtn: {
    backgroundColor: colors.primary,
    paddingVertical: 16,
    borderRadius: radii.md,
    alignItems: 'center',
    ...shadow.sm,
  },
  continueBtnText: {
    ...typography.titleMd,
    color: colors.onPrimary,
  },
});
