import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLocalSearchParams, useRouter } from 'expo-router';

const PENDING_KEY = 'pending_post_payment_reservation_id';

export default function StripeRedirect() {
  const { reservation_id, mode } = useLocalSearchParams<{ reservation_id?: string; mode?: string }>();
  const router = useRouter();

  useEffect(() => {
    const go = async () => {
      console.log('[stripe-redirect] mode:', mode, 'reservation_id:', reservation_id);
      const id =
        reservation_id ?? (await AsyncStorage.getItem(PENDING_KEY)) ?? null;
      await AsyncStorage.removeItem(PENDING_KEY);
      console.log('[stripe-redirect] → navegando a reserva:', id);
      if (id) {
        router.replace(`/(main)/qr/${id}` as any);
      } else {
        router.replace('/(main)/qr' as any);
      }
    };
    void go();
  }, []);

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator size="large" />
    </View>
  );
}
