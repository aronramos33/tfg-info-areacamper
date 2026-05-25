import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Redirect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../providers/AuthProvider';

const ONBOARDING_KEY = '@onboarding_completed';
const PENDING_PAYMENT_KEY = 'pending_post_payment_reservation_id';

export default function Gate() {
  const { session, loading, ownerLoading, isOwner } = useAuth();
  const [onboardingChecked, setOnboardingChecked] = useState(false);
  const [onboardingDone, setOnboardingDone] = useState(false);
  const [paymentChecked, setPaymentChecked] = useState(false);
  const [pendingReservationId, setPendingReservationId] = useState<string | null>(null);

  useEffect(() => {
    AsyncStorage.removeItem(ONBOARDING_KEY).then(() => {
      setOnboardingDone(false);
      setOnboardingChecked(true);
    });
  }, []);

  // Comprobar si hay un pago recién completado que requiere navegación
  useEffect(() => {
    AsyncStorage.getItem(PENDING_PAYMENT_KEY).then((id) => {
      if (id) {
        setPendingReservationId(id);
        // Consumir el flag inmediatamente para evitar re-redirecciones
        AsyncStorage.removeItem(PENDING_PAYMENT_KEY);
      }
      setPaymentChecked(true);
    });
  }, []);

  // 1) Espera a cargar auth, onboarding y check de pago pendiente
  if (loading || !onboardingChecked || !paymentChecked) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  // 2) Si hay sesión, espera a resolver el rol
  if (session && ownerLoading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  // 3) Sin sesión
  if (!session) {
    if (!onboardingDone) return <Redirect href="/(onboarding)" />;
    return <Redirect href="/(main)/services" />;
  }

  // 4) Hay un pago recién completado → directo al detalle de la reserva (override del rol)
  if (pendingReservationId && !isOwner) {
    return <Redirect href={`/(main)/qr/${pendingReservationId}`} />;
  }

  // 5) Con sesión => decide por rol
  return isOwner ? (
    <Redirect href="/admin/qr" />
  ) : (
    <Redirect href="/(main)/services" />
  );
}
