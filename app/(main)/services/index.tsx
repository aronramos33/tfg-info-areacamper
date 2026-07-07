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
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../providers/AuthProvider';
import { colors, radii, shadow, spacing, typography } from '@/lib/theme';

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

  const { height: screenHeight } = useWindowDimensions();
  const scrollRef = useRef<ScrollView | null>(null);
  const internalYRef = useRef(0);
  const externalYRef = useRef(0);
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
  const internal = useMemo(() => visibleServices.filter((s) => !s.is_external), [visibleServices]);
  const external = useMemo(() => visibleServices.filter((s) => s.is_external), [visibleServices]);
  const emptyAll = internal.length === 0 && external.length === 0;

  const updateTabFromY = (y: number) => {
    if (external.length === 0) {
      if (activeTab !== 'internal') setActiveTab('internal');
      return;
    }
    const extY = externalYRef.current;
    if (!extY || extY <= 0) return;
    const distInternal = Math.abs(y - internalYRef.current);
    const distExternal = Math.abs(y - extY);
    const nearest = distInternal <= distExternal ? 'internal' : 'external';
    if (nearest !== activeTab) setActiveTab(nearest);
  };

  const scrollToTab = (tab: Tab) => {
    setActiveTab(tab);
    isAutoScrollingRef.current = true;
    const y = tab === 'internal' ? internalYRef.current : externalYRef.current;
    scrollRef.current?.scrollTo({ y, animated: true });
    setTimeout(() => { isAutoScrollingRef.current = false; }, 450);
  };

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (isAutoScrollingRef.current) return;
    updateTabFromY(e.nativeEvent.contentOffset.y);
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
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
          <Text style={{ color: colors.onSurfaceVariant }}>IMG</Text>
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
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={styles.tabsWrapper}>
        <Text style={styles.pageTitle}>Servicios</Text>
        <View style={styles.toggleRow}>
          <Pressable
            onPress={() => scrollToTab('internal')}
            style={[styles.toggleBtn, activeTab === 'internal' && styles.toggleBtnActive]}
          >
            <Text style={[styles.toggleText, activeTab === 'internal' && styles.toggleTextActive]}>
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
            <Text style={[styles.toggleText, activeTab === 'external' && styles.toggleTextActive]}>
              Servicios exteriores
            </Text>
          </Pressable>
        </View>
      </View>

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[styles.container, { paddingBottom: screenHeight }]}
        onScroll={onScroll}
        onScrollEndDrag={(e) => updateTabFromY(e.nativeEvent.contentOffset.y)}
        onMomentumScrollEnd={(e) => updateTabFromY(e.nativeEvent.contentOffset.y)}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
      >
        {emptyAll ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No hay servicios disponibles en este momento.</Text>
          </View>
        ) : (
          <>
            <View onLayout={(e) => { internalYRef.current = e.nativeEvent.layout.y; }}>
              <Text style={styles.sectionTitle}>Dentro del camping</Text>
              {internal.length === 0
                ? <Text style={styles.sectionEmpty}>No hay servicios internos disponibles.</Text>
                : internal.map(renderServiceCard)
              }
            </View>

            <View
              onLayout={(e) => { externalYRef.current = e.nativeEvent.layout.y; }}
              style={{ marginTop: 18 }}
            >
              <Text style={styles.sectionTitle}>Servicios exteriores</Text>
              {external.length === 0
                ? <Text style={styles.sectionEmpty}>No hay servicios exteriores disponibles.</Text>
                : external.map(renderServiceCard)
              }
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background },

  tabsWrapper: {
    paddingHorizontal: spacing.lg,
    paddingTop: 14,
    paddingBottom: 8,
    backgroundColor: colors.background,
  },
  pageTitle: { ...typography.headlineLg, marginBottom: 12 },
  toggleRow: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceContainerHigh,
    borderRadius: radii.md,
    padding: 4,
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: radii.sm,
    alignItems: 'center',
  },
  toggleBtnActive: {
    backgroundColor: colors.surfaceContainerLow,
    ...shadow.sm,
  },
  toggleText: { ...typography.titleSm, color: colors.onSurfaceVariant },
  toggleTextActive: { color: colors.secondary },

  container: {
    paddingHorizontal: spacing.lg,
    paddingTop: 8,
    gap: 12,
  },

  empty: { flex: 1, alignItems: 'center', paddingTop: 40 },
  emptyText: { ...typography.bodyMd, textAlign: 'center' },

  sectionTitle: {
    marginTop: 6,
    marginBottom: 10,
    ...typography.labelSm,
  },
  sectionEmpty: { ...typography.bodyMd, marginBottom: 8 },

  card: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: radii.lg,
    ...shadow.sm,
    marginBottom: 12,
  },
  cardImage: {
    width: 60,
    height: 60,
    borderRadius: radii.md,
    marginRight: 14,
    backgroundColor: colors.surfaceContainerHigh,
  },
  cardImagePlaceholder: { justifyContent: 'center', alignItems: 'center' },
  cardContent: { flex: 1 },
  cardTitle: { ...typography.titleMd, marginBottom: 4 },
  cardSubtitle: { ...typography.bodyMd },
  badgeOff: { marginTop: 4, ...typography.labelSm, color: colors.error, letterSpacing: 0 },
  arrow: { fontSize: 26, color: colors.onSurfaceVariant, marginLeft: 10 },
});
