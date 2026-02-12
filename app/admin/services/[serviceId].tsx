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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../../lib/supabase';

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

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={styles.container}>
        {service.image_url ? (
          <Image source={{ uri: service.image_url }} style={styles.image} />
        ) : (
          <View style={[styles.image, styles.imagePlaceholder]}>
            <Text style={{ color: '#666' }}>Sin imagen</Text>
          </View>
        )}

        <View style={styles.content}>
          <Text style={styles.title}>{service.name_es}</Text>

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

  // 🔥 Imagen de borde a borde SIN márgenes, redondeada solo por abajo (Airbnb style)
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

  // 🔥 Margen lateral solo en el contenido, no en la imagen
  content: {
    paddingHorizontal: 20,
    paddingTop: 20,
  },

  title: {
    fontSize: 26,
    fontWeight: '700',
    marginBottom: 12,
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
