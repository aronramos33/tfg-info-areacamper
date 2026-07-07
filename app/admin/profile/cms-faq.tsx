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

type FaqItem = { title: string; content: string };

export default function AdminCmsFaq() {
  const router = useRouter();

  const [items, setItems] = useState<FaqItem[]>([]);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editQuestion, setEditQuestion] = useState('');
  const [editAnswer, setEditAnswer] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

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

  const handleStartEdit = (i: number) => {
    setEditQuestion(items[i].title);
    setEditAnswer(items[i].content);
    setEditingIndex(i);
  };

  const handleStartNew = () => {
    setEditQuestion('');
    setEditAnswer('');
    setEditingIndex(-1);
  };

  const handleConfirm = () => {
    if (!editQuestion.trim()) {
      AppAlert.alert('Campo obligatorio', 'La pregunta es obligatoria.');
      return;
    }
    const newItem: FaqItem = { title: editQuestion.trim(), content: editAnswer.trim() };
    if (editingIndex === -1) {
      setItems((prev) => [...prev, newItem]);
    } else if (editingIndex !== null && editingIndex >= 0) {
      setItems((prev) => prev.map((it, i) => (i === editingIndex ? newItem : it)));
    }
    setEditingIndex(null);
    setDirty(true);
  };

  const handleDelete = (i: number) => {
    AppAlert.alert(
      'Eliminar pregunta',
      `¿Seguro que quieres eliminar esta pregunta?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: () => {
            setItems((prev) => prev.filter((_, idx) => idx !== i));
            if (editingIndex === i) setEditingIndex(null);
            setDirty(true);
          },
        },
      ],
    );
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('cms_pages')
        .update({ content: { sections: items } })
        .eq('id', 'faq');
      if (error) throw error;
      setDirty(false);
    } catch (e: any) {
      AppAlert.alert('Error', e?.message ?? 'No se pudo guardar.');
    } finally {
      setSaving(false);
    }
  };

  const EditForm = ({ isNew }: { isNew: boolean }) => (
    <View style={styles.sectionCard}>
      <Text style={styles.fieldLabel}>Pregunta *</Text>
      <TextInput
        value={editQuestion}
        onChangeText={setEditQuestion}
        style={styles.input}
        autoCapitalize="sentences"
        autoFocus
        placeholder="¿Cuál es la pregunta?"
        placeholderTextColor={colors.onSurfaceVariant}
      />
      <Text style={styles.fieldLabel}>Respuesta</Text>
      <TextInput
        value={editAnswer}
        onChangeText={setEditAnswer}
        style={styles.inputMultiline}
        multiline
        numberOfLines={5}
        textAlignVertical="top"
        autoCapitalize="sentences"
        placeholder="Escribe la respuesta aquí..."
        placeholderTextColor={colors.onSurfaceVariant}
      />
      <View style={styles.rowBtns}>
        <Pressable
          onPress={() => setEditingIndex(null)}
          style={[styles.actionBtn, styles.cancelAction]}
        >
          <Text style={styles.actionText}>Cancelar</Text>
        </Pressable>
        <Pressable onPress={handleConfirm} style={[styles.actionBtn, styles.confirmAction]}>
          <Text style={[styles.actionText, { color: colors.onPrimary }]}>
            {isNew ? 'Añadir' : 'Listo'}
          </Text>
        </Pressable>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.select({ ios: 'padding', android: undefined })}
      >
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={8} style={styles.headerSide}>
            <Text style={styles.headerBack}>‹ Atrás</Text>
          </Pressable>
          <Text style={styles.headerTitle}>Preguntas frecuentes</Text>
          <View style={[styles.headerSide, { alignItems: 'flex-end' }]}>
            <Pressable onPress={handleSave} disabled={!dirty || saving} hitSlop={8}>
              <Text style={[styles.saveText, (!dirty || saving) && styles.saveTextDisabled]}>
                {saving ? 'Guardando…' : 'Guardar'}
              </Text>
            </Pressable>
          </View>
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
            {items.map((item, i) => (
              <View key={i} style={styles.sectionCard}>
                {editingIndex === i ? (
                  <EditForm isNew={false} />
                ) : (
                  <>
                    <Text style={styles.sectionQuestion}>{item.title}</Text>
                    <Text style={styles.sectionAnswer} numberOfLines={2}>
                      {item.content || '—'}
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
              <EditForm isNew />
            ) : (
              <Pressable
                onPress={handleStartNew}
                disabled={editingIndex !== null}
                style={[styles.addBtn, editingIndex !== null && { opacity: 0.4 }]}
              >
                <Text style={styles.addBtnText}>+ Añadir pregunta</Text>
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

  loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  container: { padding: spacing.lg, paddingBottom: 48, gap: 12 },

  sectionCard: {
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: radii.md,
    padding: spacing.lg,
    gap: 6,
    ...shadow.sm,
  },
  sectionQuestion: { ...typography.titleSm, lineHeight: 20 },
  sectionAnswer: { ...typography.bodyMd, color: colors.onSurfaceVariant, lineHeight: 19 },

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
    minHeight: 120,
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
