import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { AppAlert } from '@/components/AppAlert';
import { colors, radii, shadow, spacing, typography } from '@/lib/theme';

type Tab = 'privacy' | 'terms';
type Section = { title: string; content: string };

export default function AdminCmsPrivacy() {
  const router = useRouter();

  const [privacySections, setPrivacySections] = useState<Section[]>([]);
  const [termsSections, setTermsSections] = useState<Section[]>([]);
  const [activeTab, setActiveTab] = useState<Tab>('privacy');

  const [editingIndex, setEditingIndex] = useState<number | null>(null); // -1 = new
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [privacyDirty, setPrivacyDirty] = useState(false);
  const [termsDirty, setTermsDirty] = useState(false);

  useEffect(() => {
    void (async () => {
      const [pRes, tRes] = await Promise.all([
        supabase.from('cms_pages').select('content').eq('id', 'privacy').maybeSingle(),
        supabase.from('cms_pages').select('content').eq('id', 'terms').maybeSingle(),
      ]);
      if (pRes.data) setPrivacySections((pRes.data.content as any).sections ?? []);
      if (tRes.data) setTermsSections((tRes.data.content as any).sections ?? []);
      setLoading(false);
    })();
  }, []);

  const sections = activeTab === 'privacy' ? privacySections : termsSections;
  const setSections = activeTab === 'privacy' ? setPrivacySections : setTermsSections;
  const isDirty = activeTab === 'privacy' ? privacyDirty : termsDirty;

  const markDirty = () => {
    if (activeTab === 'privacy') setPrivacyDirty(true);
    else setTermsDirty(true);
  };

  const handleTabChange = (tab: Tab) => {
    setEditingIndex(null);
    setActiveTab(tab);
  };

  const handleStartEdit = (i: number) => {
    setEditTitle(sections[i].title);
    setEditContent(sections[i].content);
    setEditingIndex(i);
  };

  const handleStartNew = () => {
    setEditTitle('');
    setEditContent('');
    setEditingIndex(-1);
  };

  const handleConfirmEdit = () => {
    if (!editTitle.trim()) {
      AppAlert.alert('Campo obligatorio', 'El título de la sección es obligatorio.');
      return;
    }
    const newSection: Section = { title: editTitle.trim(), content: editContent.trim() };
    if (editingIndex === -1) {
      setSections(prev => [...prev, newSection]);
    } else if (editingIndex !== null && editingIndex >= 0) {
      setSections(prev => prev.map((s, i) => (i === editingIndex ? newSection : s)));
    }
    setEditingIndex(null);
    markDirty();
  };

  const handleDelete = (i: number) => {
    AppAlert.alert(
      'Eliminar sección',
      `¿Seguro que quieres eliminar "${sections[i].title}"?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: () => {
            setSections(prev => prev.filter((_, idx) => idx !== i));
            if (editingIndex === i) setEditingIndex(null);
            markDirty();
          },
        },
      ],
    );
  };

  const handleSave = async () => {
    const pageId = activeTab === 'privacy' ? 'privacy' : 'terms';
    setSaving(true);
    try {
      const { error } = await supabase
        .from('cms_pages')
        .update({ content: { sections } })
        .eq('id', pageId);
      if (error) throw error;
      if (activeTab === 'privacy') setPrivacyDirty(false);
      else setTermsDirty(false);
    } catch (e: any) {
      AppAlert.alert('Error', e?.message ?? 'No se pudo guardar.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.select({ ios: 'padding', android: undefined })}
      >
        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={8} style={styles.headerSide}>
            <Text style={styles.headerBack}>‹ Atrás</Text>
          </Pressable>
          <Text style={styles.headerTitle}>Política y privacidad</Text>
          <View style={[styles.headerSide, { alignItems: 'flex-end' }]}>
            <Pressable onPress={handleSave} disabled={!isDirty || saving} hitSlop={8}>
              <Text style={[styles.saveText, (!isDirty || saving) && styles.saveTextDisabled]}>
                {saving ? 'Guardando…' : 'Guardar'}
              </Text>
            </Pressable>
          </View>
        </View>

        {/* Tabs */}
        <View style={styles.tabs}>
          <Pressable
            style={[styles.tab, activeTab === 'privacy' && styles.tabActive]}
            onPress={() => handleTabChange('privacy')}
          >
            <View style={styles.tabInner}>
              <Text style={[styles.tabText, activeTab === 'privacy' && styles.tabTextActive]}>
                Privacidad
              </Text>
              {privacyDirty && <View style={styles.dirtyDot} />}
            </View>
          </Pressable>
          <Pressable
            style={[styles.tab, activeTab === 'terms' && styles.tabActive]}
            onPress={() => handleTabChange('terms')}
          >
            <View style={styles.tabInner}>
              <Text style={[styles.tabText, activeTab === 'terms' && styles.tabTextActive]}>
                Términos
              </Text>
              {termsDirty && <View style={styles.dirtyDot} />}
            </View>
          </Pressable>
        </View>

        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={styles.container}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={styles.hint}>
              Usa • al inicio de una línea para crear puntos de lista.
            </Text>

            {sections.map((section, i) => (
              <View key={i} style={styles.sectionCard}>
                {editingIndex === i ? (
                  <View style={styles.editForm}>
                    <Text style={styles.fieldLabel}>Título *</Text>
                    <TextInput
                      value={editTitle}
                      onChangeText={setEditTitle}
                      style={styles.input}
                      autoCapitalize="sentences"
                      autoFocus
                      placeholder="Título de la sección"
                      placeholderTextColor={colors.onSurfaceVariant}
                    />
                    <Text style={styles.fieldLabel}>Contenido</Text>
                    <TextInput
                      value={editContent}
                      onChangeText={setEditContent}
                      style={styles.inputMultiline}
                      multiline
                      numberOfLines={6}
                      textAlignVertical="top"
                      autoCapitalize="sentences"
                      placeholder="Texto de la sección..."
                      placeholderTextColor={colors.onSurfaceVariant}
                    />
                    <View style={styles.rowBtns}>
                      <Pressable
                        onPress={() => setEditingIndex(null)}
                        style={[styles.actionBtn, styles.cancelAction]}
                      >
                        <Text style={styles.actionText}>Cancelar</Text>
                      </Pressable>
                      <Pressable
                        onPress={handleConfirmEdit}
                        style={[styles.actionBtn, styles.confirmAction]}
                      >
                        <Text style={[styles.actionText, { color: colors.onPrimary }]}>Listo</Text>
                      </Pressable>
                    </View>
                  </View>
                ) : (
                  <>
                    <Text style={styles.sectionTitle}>{section.title}</Text>
                    <Text style={styles.sectionPreview} numberOfLines={2}>
                      {section.content}
                    </Text>
                    <View style={styles.rowBtns}>
                      <Pressable
                        onPress={() => handleStartEdit(i)}
                        disabled={editingIndex !== null}
                        style={[
                          styles.actionBtn,
                          styles.editAction,
                          editingIndex !== null && { opacity: 0.4 },
                        ]}
                      >
                        <Text style={styles.actionText}>Editar</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => handleDelete(i)}
                        disabled={editingIndex !== null}
                        style={[
                          styles.actionBtn,
                          styles.deleteAction,
                          editingIndex !== null && { opacity: 0.4 },
                        ]}
                      >
                        <Text style={[styles.actionText, { color: colors.error }]}>Eliminar</Text>
                      </Pressable>
                    </View>
                  </>
                )}
              </View>
            ))}

            {editingIndex === -1 ? (
              <View style={styles.sectionCard}>
                <Text style={styles.fieldLabel}>Título *</Text>
                <TextInput
                  value={editTitle}
                  onChangeText={setEditTitle}
                  style={styles.input}
                  autoCapitalize="sentences"
                  autoFocus
                  placeholder="Título de la sección"
                  placeholderTextColor={colors.onSurfaceVariant}
                />
                <Text style={styles.fieldLabel}>Contenido</Text>
                <TextInput
                  value={editContent}
                  onChangeText={setEditContent}
                  style={styles.inputMultiline}
                  multiline
                  numberOfLines={6}
                  textAlignVertical="top"
                  autoCapitalize="sentences"
                  placeholder="Texto de la sección..."
                  placeholderTextColor={colors.onSurfaceVariant}
                />
                <View style={styles.rowBtns}>
                  <Pressable
                    onPress={() => setEditingIndex(null)}
                    style={[styles.actionBtn, styles.cancelAction]}
                  >
                    <Text style={styles.actionText}>Cancelar</Text>
                  </Pressable>
                  <Pressable
                    onPress={handleConfirmEdit}
                    style={[styles.actionBtn, styles.confirmAction]}
                  >
                    <Text style={[styles.actionText, { color: colors.onPrimary }]}>Añadir</Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <Pressable
                onPress={handleStartNew}
                disabled={editingIndex !== null}
                style={[styles.addBtn, editingIndex !== null && { opacity: 0.4 }]}
              >
                <Text style={styles.addBtnText}>+ Añadir sección</Text>
              </Pressable>
            )}
          </ScrollView>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: 12,
  },
  headerSide: { width: 80 },
  headerBack: { ...typography.titleMd, color: colors.secondary },
  headerTitle: { flex: 1, textAlign: 'center', ...typography.titleLg },
  saveText: { ...typography.titleMd, color: colors.primary },
  saveTextDisabled: { color: colors.onSurfaceVariant },

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
  tabInner: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tabText: { ...typography.titleSm, color: colors.onSurfaceVariant },
  tabTextActive: { color: colors.onPrimary },
  dirtyDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.warning,
  },

  loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  container: { padding: spacing.lg, paddingBottom: 48, gap: 12 },
  hint: { ...typography.labelMd, color: colors.onSurfaceVariant, marginBottom: 4 },

  sectionCard: {
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: radii.md,
    padding: spacing.lg,
    gap: 6,
    ...shadow.sm,
  },
  sectionTitle: { ...typography.titleSm },
  sectionPreview: { ...typography.bodyMd, color: colors.onSurfaceVariant, lineHeight: 19 },

  editForm: { gap: 6 },
  fieldLabel: { ...typography.labelMd, marginTop: 4 },

  input: {
    backgroundColor: colors.inputSurface,
    borderWidth: 1,
    borderColor: colors.outline,
    borderRadius: radii.sm,
    paddingHorizontal: 12,
    paddingVertical: Platform.select({ ios: 12, android: 10 }),
    ...typography.bodyMd,
    color: colors.onSurface,
  },
  inputMultiline: {
    backgroundColor: colors.inputSurface,
    borderWidth: 1,
    borderColor: colors.outline,
    borderRadius: radii.sm,
    paddingHorizontal: 12,
    paddingTop: 10,
    ...typography.bodyMd,
    color: colors.onSurface,
    minHeight: 140,
  },

  rowBtns: { flexDirection: 'row', gap: 8, marginTop: 10 },
  actionBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: radii.sm,
    alignItems: 'center',
    borderWidth: 1,
  },
  actionText: { ...typography.titleSm },
  editAction: { backgroundColor: colors.surfaceContainerHigh, borderColor: colors.outline },
  deleteAction: { backgroundColor: colors.errorContainer, borderColor: colors.errorContainer },
  cancelAction: { backgroundColor: colors.surfaceContainerHigh, borderColor: colors.outline },
  confirmAction: { backgroundColor: colors.primary, borderColor: colors.primary },

  addBtn: {
    paddingVertical: 14,
    borderRadius: radii.md,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.secondary,
    borderStyle: 'dashed',
    backgroundColor: colors.surfaceContainerLow,
  },
  addBtnText: { ...typography.titleSm, color: colors.secondary },
});
