import { useState } from 'react';
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
import { useFocusEffect } from '@react-navigation/native';
import React from 'react';
import { supabase } from '../../../lib/supabase';

type Service = {
  id: string;
  name_es: string;
  short_description_es: string | null;
  image_url: string | null;
  is_external: boolean;
  is_active: boolean;
  order_index: number;
};

type Tab = 'internal' | 'external';

export default function AdminServicesIndex() {
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>('internal');
  const router = useRouter();

  const load = async () => {
    const { data, error } = await supabase
      .from('services')
      .select('*')
      .order('order_index', { ascending: true });
    if (error) console.warn('[admin services]', error);
    setServices(data ?? []);
    setLoading(false);
  };

  useFocusEffect(
    React.useCallback(() => {
      void load();
    }, []),
  );

  const internal = services.filter((s) => !s.is_external);
  const external = services.filter((s) => s.is_external);
  const items = activeTab === 'internal' ? internal : external;

  if (loading) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator size="large" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F7F8FB' }}>
      {/* Cabecera + toggle */}
      <View style={styles.header}>
        <Text style={styles.pageTitle}>Servicios</Text>
        <View style={styles.toggleRow}>
          <Pressable
            onPress={() => setActiveTab('internal')}
            style={[
              styles.toggleBtn,
              activeTab === 'internal' && styles.toggleBtnActive,
            ]}
          >
            <Text
              style={[
                styles.toggleText,
                activeTab === 'internal' && styles.toggleTextActive,
              ]}
            >
              Dentro del camping
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setActiveTab('external')}
            style={[
              styles.toggleBtn,
              activeTab === 'external' && styles.toggleBtnActive,
            ]}
          >
            <Text
              style={[
                styles.toggleText,
                activeTab === 'external' && styles.toggleTextActive,
              ]}
            >
              Servicios exteriores
            </Text>
          </Pressable>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.container}>
        {/* Lista */}
        {items.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>
              No hay servicios en esta sección.
            </Text>
          </View>
        ) : (
          items.map((service) => (
            <Pressable
              key={service.id}
              onPress={() => router.push(`/admin/services/${service.id}`)}
              style={({ pressed }) => [
                styles.card,
                pressed && { opacity: 0.9 },
              ]}
            >
              {service.image_url ? (
                <Image
                  source={{ uri: service.image_url }}
                  style={styles.cardImage}
                />
              ) : (
                <View style={[styles.cardImage, styles.cardImagePlaceholder]}>
                  <Text style={{ color: '#999', fontSize: 11 }}>IMG</Text>
                </View>
              )}

              <View style={styles.cardContent}>
                <Text style={styles.cardTitle}>{service.name_es}</Text>
                {service.short_description_es ? (
                  <Text style={styles.cardSubtitle} numberOfLines={1}>
                    {service.short_description_es}
                  </Text>
                ) : null}
                <View style={styles.badgeRow}>
                  <View
                    style={[
                      styles.badge,
                      service.is_active ? styles.badgeOn : styles.badgeOff,
                    ]}
                  >
                    <Text style={styles.badgeText}>
                      {service.is_active ? 'Activo' : 'Desactivado'}
                    </Text>
                  </View>
                </View>
              </View>

              <Text style={styles.arrow}>›</Text>
            </Pressable>
          ))
        )}

        {/* Botón añadir al final del scroll */}
        <Pressable
          onPress={() =>
            router.push({
              pathname: '/admin/services/new',
              params: {
                type: activeTab === 'external' ? 'external' : 'internal',
              },
            })
          }
          style={styles.addBtn}
        >
          <Text style={styles.addBtnText}>
            + Añadir{' '}
            {activeTab === 'internal'
              ? 'servicio interior'
              : 'servicio exterior'}
          </Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  header: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 8,
    backgroundColor: '#F7F8FB',
  },
  pageTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: '#111',
    marginBottom: 12,
  },
  toggleRow: {
    flexDirection: 'row',
    backgroundColor: '#e8eaf0',
    borderRadius: 12,
    padding: 4,
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  toggleBtnActive: {
    backgroundColor: 'white',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  toggleText: { fontSize: 14, fontWeight: '600', color: '#888' },
  toggleTextActive: { color: '#007AFF' },

  container: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 40,
    gap: 12,
  },

  empty: { alignItems: 'center', paddingTop: 40 },
  emptyText: { fontSize: 16, color: '#aaa', textAlign: 'center' },

  card: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    backgroundColor: 'white',
    borderRadius: 14,
    elevation: 3,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  cardImage: {
    width: 56,
    height: 56,
    borderRadius: 10,
    marginRight: 14,
    backgroundColor: '#eee',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardImagePlaceholder: { justifyContent: 'center', alignItems: 'center' },
  cardContent: { flex: 1 },
  cardTitle: { fontSize: 15, fontWeight: '700', marginBottom: 4 },
  cardSubtitle: { fontSize: 13, color: '#666', marginBottom: 6 },
  badgeRow: { flexDirection: 'row', gap: 6 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  badgeOn: { backgroundColor: '#e8f5e9' },
  badgeOff: { backgroundColor: '#ffebee' },
  badgeText: { fontSize: 11, fontWeight: '700', color: '#333' },
  arrow: { fontSize: 26, color: '#ccc', marginLeft: 10 },

  addBtn: {
    marginTop: 8,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: '#EEF4FF',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#c7d9f8',
  },
  addBtnText: { color: '#007AFF', fontWeight: '700', fontSize: 15 },
});
