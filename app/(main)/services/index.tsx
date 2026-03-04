import { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Image,
  StyleSheet,
  ActivityIndicator,
  NativeScrollEvent,
  NativeSyntheticEvent,
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

type Tab = 'internal' | 'external';

export default function ServicesIndex() {
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>('internal');
  const router = useRouter();
  const { isOwner } = useAuth();

  const scrollRef = useRef<ScrollView | null>(null);

  // ✅ Posición Y de cada sección (guardada en refs)
  const internalYRef = useRef(0);
  const externalYRef = useRef(0);

  // ✅ Flag para evitar que onScroll pise el tab durante scroll animado
  const isAutoScrollingRef = useRef(false);

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

  const visibleServices = useMemo(
    () => (isOwner ? services : services.filter((s) => s.is_active)),
    [isOwner, services],
  );

  const internal = useMemo(
    () => visibleServices.filter((s) => !s.is_external),
    [visibleServices],
  );
  const external = useMemo(
    () => visibleServices.filter((s) => s.is_external),
    [visibleServices],
  );

  const emptyAll = internal.length === 0 && external.length === 0;

  // ✅ Lógica única para decidir tab según scroll
  const updateTabFromY = (y: number) => {
    if (external.length === 0) {
      if (activeTab !== 'internal') setActiveTab('internal');
      return;
    }

    const extY = externalYRef.current;
    if (!extY || extY <= 0) return;

    // La sección activa es la más cercana al scroll actual
    const distInternal = Math.abs(y - internalYRef.current);
    const distExternal = Math.abs(y - extY);
    const nearest = distInternal <= distExternal ? 'internal' : 'external';

    if (nearest !== activeTab) setActiveTab(nearest);
  };

  // ✅ Tap en tabs: scroll + set tab (sin que onScroll lo pise)
  const scrollToTab = (tab: Tab) => {
    setActiveTab(tab);

    isAutoScrollingRef.current = true;
    const y = tab === 'internal' ? internalYRef.current : externalYRef.current;
    scrollRef.current?.scrollTo({ y, animated: true });

    // Soltamos el “bloqueo” tras la animación
    setTimeout(() => {
      isAutoScrollingRef.current = false;
    }, 450);
  };

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (isAutoScrollingRef.current) return;
    updateTabFromY(e.nativeEvent.contentOffset.y);
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator size="large" />
      </SafeAreaView>
    );
  }

  const renderServiceCard = (service: Service) => (
    <Pressable
      key={service.id}
      onPress={() => router.push(`/(main)/services/${service.id}`)}
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.9 }]}
    >
      {service.image_url ? (
        <Image source={{ uri: service.image_url }} style={styles.cardImage} />
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
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F7F8FB' }}>
      {/* Tabs “ancla” */}
      <View style={styles.tabsWrapper}>
        <Text style={styles.pageTitle}>Servicios</Text>
        <View style={styles.toggleRow}>
          <Pressable
            onPress={() => scrollToTab('internal')}
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
            onPress={() => scrollToTab('external')}
            style={[
              styles.toggleBtn,
              activeTab === 'external' && styles.toggleBtnActive,
              external.length === 0 && { opacity: 0.5 },
            ]}
            disabled={external.length === 0}
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

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.container}
        onScroll={onScroll}
        onScrollEndDrag={(e) => updateTabFromY(e.nativeEvent.contentOffset.y)}
        onMomentumScrollEnd={(e) =>
          updateTabFromY(e.nativeEvent.contentOffset.y)
        }
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
      >
        {emptyAll ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>
              No hay servicios disponibles en este momento.
            </Text>
          </View>
        ) : (
          <>
            {/* Sección: Dentro */}
            <View
              onLayout={(e) => {
                internalYRef.current = e.nativeEvent.layout.y;
              }}
            >
              <Text style={styles.sectionTitle}>Dentro del camping</Text>
              {internal.length === 0 ? (
                <Text style={styles.sectionEmpty}>
                  No hay servicios internos disponibles.
                </Text>
              ) : (
                internal.map(renderServiceCard)
              )}
            </View>

            {/* Sección: Exteriores */}
            <View
              onLayout={(e) => {
                externalYRef.current = e.nativeEvent.layout.y;
              }}
              style={{ marginTop: 18 }}
            >
              <Text style={styles.sectionTitle}>Servicios exteriores</Text>
              {external.length === 0 ? (
                <Text style={styles.sectionEmpty}>
                  No hay servicios exteriores disponibles.
                </Text>
              ) : (
                external.map(renderServiceCard)
              )}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  tabsWrapper: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 8,
    backgroundColor: '#F7F8FB',
  },
  pageTitle: {
    fontSize: 26,
    fontWeight: '800',
    marginBottom: 12,
    color: '#111',
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
    marginBottom: 300, // ← suficiente para que "exteriores" llegue al top
    gap: 12,
  },

  empty: { flex: 1, alignItems: 'center', paddingTop: 40 },
  emptyText: { fontSize: 16, color: '#888', textAlign: 'center' },

  sectionTitle: {
    marginTop: 6,
    marginBottom: 10,
    fontSize: 13,
    fontWeight: '800',
    color: '#555',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sectionEmpty: { color: '#888', marginBottom: 8 },

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
    marginBottom: 12,
  },
  cardImage: {
    width: 60,
    height: 60,
    borderRadius: 10,
    marginRight: 14,
    backgroundColor: '#eee',
  },
  cardImagePlaceholder: { justifyContent: 'center', alignItems: 'center' },
  cardContent: { flex: 1 },
  cardTitle: { fontSize: 16, fontWeight: '600', marginBottom: 4 },
  cardSubtitle: { fontSize: 14, color: '#555' },
  badgeOff: { marginTop: 4, fontSize: 12, color: 'red', fontWeight: '600' },
  arrow: { fontSize: 26, color: '#aaa', marginLeft: 10 },
});
