import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Redirect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../providers/AuthProvider';

const ONBOARDING_KEY = '@onboarding_completed';

export default function Gate() {
  const { session, loading, ownerLoading, isOwner } = useAuth();
  const [onboardingChecked, setOnboardingChecked] = useState(false);
  const [onboardingDone, setOnboardingDone] = useState(false);

  useEffect(() => {
    AsyncStorage.removeItem(ONBOARDING_KEY).then(() => {
      setOnboardingDone(false);
      setOnboardingChecked(true);
    });
  }, []);

  // 1) Espera a cargar auth y comprobar onboarding
  if (loading || !onboardingChecked) {
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

  // 4) Con sesión => decide por rol
  return isOwner ? (
    <Redirect href="/admin/qr" />
  ) : (
    <Redirect href="/(main)/services" />
  );
}
