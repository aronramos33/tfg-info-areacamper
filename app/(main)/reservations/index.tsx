import { useEffect, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/AuthProvider';
import {
  usePendingReservation,
  emptyPlaceConfig,
} from '@/providers/PendingReservationContext';
import { NIGHTLY_CENTS } from '@/components/utils/money';

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
    router.push('/(screens)/configure-places');
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F8F9FC' }}>
      <View
        style={{
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          paddingHorizontal: 24,
        }}
      >
        <Text
          style={{
            fontSize: 26,
            fontWeight: '700',
            marginBottom: 8,
            textAlign: 'center',
          }}
        >
          ¿Cuántas plazas necesitas?
        </Text>
        <Text
          style={{
            fontSize: 14,
            color: '#888',
            marginBottom: 48,
            textAlign: 'center',
          }}
        >
          Cada plaza está pensada para una autocaravana o caravana.
        </Text>

        {loading ? (
          <ActivityIndicator size="large" style={{ marginBottom: 48 }} />
        ) : (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 36,
              marginBottom: 24,
            }}
          >
            <Pressable
              onPress={() => setNumPlaces((n) => Math.max(1, n - 1))}
              disabled={numPlaces <= 1}
              style={({ pressed }) => ({
                width: 56,
                height: 56,
                borderRadius: 28,
                backgroundColor: numPlaces <= 1 ? '#E5E7EB' : '#111',
                alignItems: 'center',
                justifyContent: 'center',
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <Text
                style={{
                  fontSize: 28,
                  fontWeight: '700',
                  color: numPlaces <= 1 ? '#9CA3AF' : '#fff',
                  lineHeight: 32,
                }}
              >
                −
              </Text>
            </Pressable>

            <Text
              style={{
                fontSize: 72,
                fontWeight: '800',
                minWidth: 90,
                textAlign: 'center',
              }}
            >
              {numPlaces}
            </Text>

            <Pressable
              onPress={() =>
                setNumPlaces((n) => Math.min(maxPlaces, n + 1))
              }
              disabled={numPlaces >= maxPlaces}
              style={({ pressed }) => ({
                width: 56,
                height: 56,
                borderRadius: 28,
                backgroundColor: numPlaces >= maxPlaces ? '#E5E7EB' : '#111',
                alignItems: 'center',
                justifyContent: 'center',
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <Text
                style={{
                  fontSize: 28,
                  fontWeight: '700',
                  color: numPlaces >= maxPlaces ? '#9CA3AF' : '#fff',
                  lineHeight: 32,
                }}
              >
                +
              </Text>
            </Pressable>
          </View>
        )}

        <Text style={{ fontSize: 13, color: '#AAA', textAlign: 'center' }}>
          {loading
            ? 'Cargando disponibilidad…'
            : `Máximo disponible: ${maxPlaces} plaza${maxPlaces !== 1 ? 's' : ''}`}
        </Text>
      </View>

      <View style={{ padding: 20 }}>
        <Pressable
          onPress={handleContinue}
          disabled={loading}
          style={({ pressed }) => ({
            backgroundColor: '#111',
            paddingVertical: 16,
            borderRadius: 14,
            alignItems: 'center',
            opacity: pressed || loading ? 0.7 : 1,
          })}
        >
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>
            Continuar con {numPlaces} plaza{numPlaces !== 1 ? 's' : ''}
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
