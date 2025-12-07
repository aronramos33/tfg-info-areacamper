// app/(main)/services/index.tsx
import { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Image,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../providers/AuthProvider';

type Service = {
  id: string;
  name_es: string;
  short_description_es: string | null;
  image_url: string | null;
  is_external: boolean;
  is_active: boolean;
};

export default function ServicesIndex() {
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const { isOwner } = useAuth();

  useEffect(() => {
    const load = async () => {
      const { data, error } = await supabase
        .from('services')
        .select('*')
        .order('order_index', { ascending: true });

      if (error) console.warn('[services]', error);
      setServices(data ?? []);
      setLoading(false);
    };

    load();
  }, []);

  if (loading) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator size="large" />
      </SafeAreaView>
    );
  }

  const visibleServices = isOwner
    ? services
    : services.filter((s) => s.is_active);

  const internal = visibleServices.filter((s) => !s.is_external);
  const external = visibleServices.filter((s) => s.is_external);

  if (!internal.length && !external.length) {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={{ fontSize: 18, textAlign: 'center', color: '#555' }}>
          No hay servicios disponibles en este momento.
        </Text>
      </SafeAreaView>
    );
  }

  const renderSection = (title: string, items: Service[]) => {
    if (!items.length) return null;

    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{title}</Text>

        {items.map((service) => (
          <Pressable
            key={service.id}
            onPress={() => router.push(`/(main)/services/${service.id}`)}
            style={({ pressed }) => [styles.card, pressed && { opacity: 0.9 }]}
          >
            {service.image_url ? (
              <Image
                source={{ uri: service.image_url }}
                style={styles.cardImage}
              />
            ) : (
              <View style={[styles.cardImage, styles.cardImagePlaceholder]}>
                <Text style={{ color: '#666' }}>IMG</Text>
              </View>
            )}

            <View style={styles.cardContent}>
              <Text style={styles.cardTitle}>{service.name_es}</Text>

              {service.short_description_es && (
                <Text style={styles.cardSubtitle} numberOfLines={2}>
                  {service.short_description_es}
                </Text>
              )}

              {isOwner && !service.is_active && (
                <Text style={styles.badgeOff}>Desactivado</Text>
              )}
            </View>

            <Text style={styles.arrow}>›</Text>
          </Pressable>
        ))}
      </View>
    );
  };

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={styles.container}>
        {renderSection('Dentro del camping', internal)}
        {renderSection('Servicios exteriores', external)}
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
    paddingHorizontal: 20,
    paddingBottom: 40,
  },

  section: {
    marginBottom: 24,
  },

  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 14,
  },

  card: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    backgroundColor: 'white',
    borderRadius: 14,
    marginBottom: 12,
    elevation: 3,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },

  cardImage: {
    width: 60,
    height: 60,
    borderRadius: 10,
    marginRight: 14,
    backgroundColor: '#eee',
  },

  cardImagePlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
  },

  cardContent: {
    flex: 1,
  },

  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },

  cardSubtitle: {
    fontSize: 14,
    color: '#555',
  },

  badgeOff: {
    marginTop: 4,
    fontSize: 12,
    color: 'red',
    fontWeight: '600',
  },

  arrow: {
    fontSize: 26,
    color: '#aaa',
    marginLeft: 10,
  },
});
