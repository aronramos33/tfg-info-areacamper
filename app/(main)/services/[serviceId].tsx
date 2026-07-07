// app/(main)/services/[serviceId].tsx
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  View,
  Text,
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Image,
  Linking,
  Platform,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../../lib/supabase';
import { colors, radii, shadow, spacing, typography } from '@/lib/theme';

const LOCATION_ADDRESS = 'Calle Ametler 8, 46728 Xauxa, Valencia';
const MAPS_URL = Platform.select({
  ios: `maps://0,0?q=${encodeURIComponent(LOCATION_ADDRESS)}`,
  android: `geo:0,0?q=${encodeURIComponent(LOCATION_ADDRESS)}`,
  default: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(LOCATION_ADDRESS)}`,
});

type Service = {
  id: string;
  name_es: string;
  long_description_es: string | null;
  image_url: string | null;
  is_active: boolean;
};

export default function ServiceDetail() {
  const { serviceId } = useLocalSearchParams<{ serviceId: string }>();
  const [service, setService] = useState<Service | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!serviceId) return;

    const load = async () => {
      const { data, error } = await supabase
        .from('services')
        .select('*')
        .eq('id', serviceId)
        .maybeSingle();

      if (error) console.warn('[service detail]', error);
      setService(data ?? null);
      setLoading(false);
    };

    load();
  }, [serviceId]);

  if (loading) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  if (!service) {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={typography.bodyMd}>No se ha encontrado este servicio.</Text>
      </SafeAreaView>
    );
  }

  const isLocation = service.id === 'ubicacion';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView contentContainerStyle={styles.container}>
        {service.image_url ? (
          <Image source={{ uri: service.image_url }} style={styles.image} />
        ) : (
          <View style={[styles.image, styles.imagePlaceholder]}>
            <Text style={{ fontSize: 40 }}>📍</Text>
          </View>
        )}

        <View style={styles.content}>
          <Text style={styles.title}>{service.name_es}</Text>

          {isLocation && (
            <>
              <View style={styles.addressCard}>
                <Text style={styles.addressLabel}>Dirección</Text>
                <Text style={styles.addressText}>{LOCATION_ADDRESS}</Text>
              </View>

              <Pressable
                style={({ pressed }) => [
                  styles.mapsButton,
                  pressed && { opacity: 0.8 },
                ]}
                onPress={() => Linking.openURL(MAPS_URL!)}
              >
                <Text style={styles.mapsButtonText}>Abrir en Maps</Text>
              </Pressable>
            </>
          )}

          <Text style={styles.description}>
            {service.long_description_es ??
              'Próximamente habrá más información sobre este servicio.'}
          </Text>

          {!service.is_active && (
            <Text style={styles.notice}>
              Este servicio está temporalmente desactivado.
            </Text>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },

  container: { paddingBottom: 40 },

  image: {
    width: '100%',
    height: 260,
    borderBottomLeftRadius: radii.lg,
    borderBottomRightRadius: radii.lg,
    backgroundColor: colors.surfaceContainerHigh,
  },
  imagePlaceholder: { justifyContent: 'center', alignItems: 'center' },

  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
  },

  title: { ...typography.headlineLg, marginBottom: 16 },

  addressCard: {
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: radii.md,
    padding: spacing.lg,
    marginBottom: 14,
    ...shadow.sm,
  },
  addressLabel: { ...typography.labelSm, marginBottom: 4 },
  addressText: { ...typography.titleMd },

  mapsButton: {
    backgroundColor: colors.primary,
    borderRadius: radii.md,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 20,
    ...shadow.sm,
  },
  mapsButtonText: { ...typography.titleMd, color: colors.onPrimary },

  description: { ...typography.bodyLg, lineHeight: 24, marginBottom: 20 },

  notice: {
    marginTop: 20,
    ...typography.titleSm,
    color: colors.error,
  },
});
