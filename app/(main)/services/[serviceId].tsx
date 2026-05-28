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
        <ActivityIndicator size="large" />
      </SafeAreaView>
    );
  }

  if (!service) {
    return (
      <SafeAreaView style={styles.center}>
        <Text>No se ha encontrado este servicio.</Text>
      </SafeAreaView>
    );
  }

  const isLocation = service.id === 'ubicacion';

  return (
    <SafeAreaView style={{ flex: 1 }}>
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
  },

  container: {
    paddingBottom: 40,
  },

  image: {
    width: '100%',
    height: 260,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    backgroundColor: '#eee',
  },

  imagePlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
  },

  content: {
    paddingHorizontal: 20,
    paddingTop: 20,
  },

  title: {
    fontSize: 26,
    fontWeight: '700',
    marginBottom: 16,
  },

  addressCard: {
    backgroundColor: '#F7F8FB',
    borderRadius: 14,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  addressLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#9CA3AF',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  addressText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111',
  },

  mapsButton: {
    backgroundColor: '#007AFF',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 20,
  },
  mapsButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '700',
  },

  description: {
    fontSize: 16,
    lineHeight: 22,
    color: '#444',
    marginBottom: 20,
  },

  notice: {
    marginTop: 20,
    color: 'red',
    fontWeight: '700',
    fontSize: 16,
  },
});
