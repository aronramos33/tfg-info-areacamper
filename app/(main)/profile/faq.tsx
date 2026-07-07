import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  LayoutAnimation,
  Platform,
  UIManager,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { colors, radii, shadow, spacing, typography } from '@/lib/theme';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

type FaqItem = { title: string; content: string };

function FaqRow({ item }: { item: FaqItem }) {
  const [open, setOpen] = useState(false);

  const toggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpen((v) => !v);
  };

  return (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.85 }]}
      onPress={toggle}
    >
      <View style={styles.rowHeader}>
        <Text style={styles.question}>{item.title}</Text>
        <Text style={[styles.chevron, open && styles.chevronOpen]}>›</Text>
      </View>
      {open && <Text style={styles.answer}>{item.content}</Text>}
    </Pressable>
  );
}

export default function ProfileFaq() {
  const router = useRouter();
  const [items, setItems] = useState<FaqItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      const { data } = await supabase
        .from('cms_pages')
        .select('content')
        .eq('id', 'faq')
        .maybeSingle();
      if (data) setItems((data.content as any).sections ?? []);
      setLoading(false);
    })();
  }, []);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8} style={styles.headerSide}>
          <Text style={styles.headerBack}>‹ Atrás</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Preguntas frecuentes</Text>
        <View style={styles.headerSide} />
      </View>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.container}>
          {items.length === 0 ? (
            <Text style={styles.empty}>No hay preguntas disponibles.</Text>
          ) : (
            <View style={styles.card}>
              {items.map((item, i) => (
                <React.Fragment key={i}>
                  {i > 0 && <View style={styles.divider} />}
                  <FaqRow item={item} />
                </React.Fragment>
              ))}
            </View>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: 12,
    backgroundColor: colors.background,
  },
  headerSide: { width: 70 },
  headerBack: { ...typography.titleMd, color: colors.secondary },
  headerTitle: { ...typography.titleLg },

  loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  container: { padding: spacing.lg, paddingBottom: 48 },
  empty: { ...typography.bodyMd, textAlign: 'center', marginTop: 40 },

  card: {
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: radii.lg,
    overflow: 'hidden',
    ...shadow.sm,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.outlineVariant,
    marginLeft: spacing.lg,
  },
  row: {
    paddingHorizontal: spacing.lg,
    paddingVertical: 16,
  },
  rowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  question: { ...typography.titleSm, flex: 1, lineHeight: 20 },
  chevron: {
    fontSize: 20,
    color: colors.onSurfaceVariant,
    fontFamily: 'PlusJakartaSans_700Bold',
    transform: [{ rotate: '90deg' }],
  },
  chevronOpen: {
    transform: [{ rotate: '-90deg' }],
  },
  answer: {
    ...typography.bodyMd,
    lineHeight: 21,
    marginTop: 10,
    color: colors.onSurface,
  },
});
