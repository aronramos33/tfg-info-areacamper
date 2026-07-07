import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { colors, radii, shadow, spacing, typography } from '@/lib/theme';

type Tab = 'privacy' | 'terms';
type CmsSection = { title: string; content: string };

function BulletList({ items }: { items: string[] }) {
  return (
    <View style={styles.bulletList}>
      {items.map((item, i) => (
        <View key={i} style={styles.bulletRow}>
          <Text style={styles.bullet}>•</Text>
          <Text style={styles.bulletText}>{item}</Text>
        </View>
      ))}
    </View>
  );
}

function renderContent(content: string): React.ReactNode[] {
  const lines = content.split('\n').filter((l) => l.trim() !== '');
  const result: React.ReactNode[] = [];
  let bullets: string[] = [];
  lines.forEach((line, i) => {
    if (line.startsWith('•')) {
      bullets.push(line.slice(1).trim());
    } else {
      if (bullets.length) {
        result.push(<BulletList key={`bl-${i}`} items={bullets} />);
        bullets = [];
      }
      result.push(
        <Text key={`b-${i}`} style={styles.body}>
          {line}
        </Text>,
      );
    }
  });
  if (bullets.length) result.push(<BulletList key="bl-end" items={bullets} />);
  return result;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
}

type Props = {
  visible: boolean;
  onClose: () => void;
  initialTab?: Tab;
};

export default function PrivacyModal({ visible, onClose, initialTab = 'terms' }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>(initialTab);
  const [privacySections, setPrivacySections] = useState<CmsSection[]>([]);
  const [termsSections, setTermsSections] = useState<CmsSection[]>([]);
  const [privacyUpdatedAt, setPrivacyUpdatedAt] = useState<string | null>(null);
  const [termsUpdatedAt, setTermsUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    void (async () => {
      const [pRes, tRes] = await Promise.all([
        supabase.from('cms_pages').select('content, updated_at').eq('id', 'privacy').maybeSingle(),
        supabase.from('cms_pages').select('content, updated_at').eq('id', 'terms').maybeSingle(),
      ]);
      if (pRes.data) {
        setPrivacySections((pRes.data.content as any).sections ?? []);
        setPrivacyUpdatedAt(pRes.data.updated_at);
      }
      if (tRes.data) {
        setTermsSections((tRes.data.content as any).sections ?? []);
        setTermsUpdatedAt(tRes.data.updated_at);
      }
      setLoading(false);
    })();
  }, [visible]);

  const sections = activeTab === 'privacy' ? privacySections : termsSections;
  const updatedAt = activeTab === 'privacy' ? privacyUpdatedAt : termsUpdatedAt;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <View style={styles.header}>
          <View style={styles.headerSide} />
          <Text style={styles.headerTitle}>Política y privacidad</Text>
          <Pressable onPress={onClose} hitSlop={12} style={styles.headerSide}>
            <Text style={styles.closeBtn}>Cerrar</Text>
          </Pressable>
        </View>

        <View style={styles.tabs}>
          <Pressable
            style={[styles.tab, activeTab === 'terms' && styles.tabActive]}
            onPress={() => setActiveTab('terms')}
          >
            <Text style={[styles.tabText, activeTab === 'terms' && styles.tabTextActive]}>
              Términos
            </Text>
          </Pressable>
          <Pressable
            style={[styles.tab, activeTab === 'privacy' && styles.tabActive]}
            onPress={() => setActiveTab('privacy')}
          >
            <Text style={[styles.tabText, activeTab === 'privacy' && styles.tabTextActive]}>
              Privacidad
            </Text>
          </Pressable>
        </View>

        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.container}>
            {sections.map((s, i) => (
              <View key={i} style={styles.section}>
                <Text style={styles.sectionTitle}>{s.title}</Text>
                {renderContent(s.content)}
              </View>
            ))}
            {updatedAt && (
              <Text style={styles.lastUpdated}>
                Última actualización: {formatDate(updatedAt)}
              </Text>
            )}
          </ScrollView>
        )}
      </SafeAreaView>
    </Modal>
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
  },
  headerSide: { width: 70 },
  headerTitle: { ...typography.titleLg },
  closeBtn: { ...typography.titleMd, color: colors.secondary, textAlign: 'right' },

  tabs: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    paddingBottom: 12,
    gap: 8,
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: radii.sm,
    backgroundColor: colors.surfaceContainerHigh,
    alignItems: 'center',
  },
  tabActive: { backgroundColor: colors.primary },
  tabText: { ...typography.titleSm, color: colors.onSurfaceVariant },
  tabTextActive: { color: colors.onPrimary },

  loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  container: { padding: spacing.lg, paddingBottom: 48, gap: 12 },

  section: {
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: radii.md,
    padding: spacing.lg,
    gap: 8,
    ...shadow.sm,
  },
  sectionTitle: { ...typography.titleSm, marginBottom: 2 },
  body: { ...typography.bodyMd, lineHeight: 21 },

  bulletList: { gap: 6, paddingLeft: 4 },
  bulletRow: { flexDirection: 'row', gap: 8 },
  bullet: { ...typography.bodyMd, color: colors.secondary, lineHeight: 21, width: 12 },
  bulletText: { ...typography.bodyMd, lineHeight: 21, flex: 1 },

  lastUpdated: { textAlign: 'center', ...typography.labelMd, marginTop: 8 },
});
