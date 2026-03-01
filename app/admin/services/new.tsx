import { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TextInput,
  Pressable,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '../../../lib/supabase';

type Tab = 'internal' | 'external';

export default function AdminServiceNew() {
  const router = useRouter();
  const { type } = useLocalSearchParams<{ type?: Tab }>();

  const [saving, setSaving] = useState(false);

  const [id, setId] = useState('');
  const [name, setName] = useState('');
  const [shortDesc, setShortDesc] = useState('');
  const [longDesc, setLongDesc] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [isExternal, setIsExternal] = useState(type === 'external');

  const isValid =
    id.trim() && name.trim() && shortDesc.trim() && longDesc.trim();

  const handleCreate = async () => {
    if (!isValid) return;

    const cleanId = id.trim().toLowerCase().replace(/\s+/g, '_');

    // Comprobar ID duplicado
    const { data: existing } = await supabase
      .from('services')
      .select('id')
      .eq('id', cleanId)
      .maybeSingle();

    if (existing) {
      Alert.alert(
        'ID duplicado',
        `Ya existe un servicio con el ID "${cleanId}".`,
      );
      return;
    }

    setSaving(true);
    try {
      // Calcular order_index
      const { data: all } = await supabase
        .from('services')
        .select('order_index')
        .order('order_index', { ascending: false })
        .limit(1);
      const maxOrder = all?.[0]?.order_index ?? 0;

      const { error } = await supabase.from('services').insert({
        id: cleanId,
        name_es: name.trim(),
        short_description_es: shortDesc.trim(),
        long_description_es: longDesc.trim(),
        image_url: imageUrl.trim() || null,
        is_external: isExternal,
        is_active: true,
        order_index: maxOrder + 1,
      });

      if (error) throw error;

      router.back();
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'No se pudo crear el servicio.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.select({ ios: 'padding', android: undefined })}
      >
        <ScrollView
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
        >
          {/* Cabecera */}
          <View style={styles.headerRow}>
            <Pressable onPress={() => router.back()} style={styles.backBtn}>
              <Text style={styles.backText}>‹ Volver</Text>
            </Pressable>
            <Text style={styles.pageTitle}>Nuevo servicio</Text>
            <View style={{ width: 70 }} />
          </View>

          {/* Ubicación */}
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Ubicación del servicio</Text>
            <View style={styles.toggleRow}>
              <Pressable
                onPress={() => setIsExternal(false)}
                style={[
                  styles.toggleBtn,
                  !isExternal && styles.toggleBtnActive,
                ]}
              >
                <Text
                  style={[
                    styles.toggleText,
                    !isExternal && styles.toggleTextActive,
                  ]}
                >
                  Dentro del camping
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setIsExternal(true)}
                style={[styles.toggleBtn, isExternal && styles.toggleBtnActive]}
              >
                <Text
                  style={[
                    styles.toggleText,
                    isExternal && styles.toggleTextActive,
                  ]}
                >
                  Servicio exterior
                </Text>
              </Pressable>
            </View>
          </View>

          {/* Campos */}
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Información</Text>

            <Text style={styles.fieldLabel}>ID único *</Text>
            <TextInput
              value={id}
              onChangeText={setId}
              placeholder="ej: bbq, laundry, pool"
              style={[styles.input, !id.trim() && styles.inputRequired]}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Text style={styles.hint}>
              Solo letras, números y guiones bajos. Se usará como identificador
              permanente.
            </Text>

            <Text style={styles.fieldLabel}>Nombre *</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Nombre visible del servicio"
              style={[styles.input, !name.trim() && styles.inputRequired]}
              autoCapitalize="sentences"
            />

            <Text style={styles.fieldLabel}>Descripción corta *</Text>
            <TextInput
              value={shortDesc}
              onChangeText={setShortDesc}
              placeholder="Una línea descriptiva para la lista"
              style={[styles.input, !shortDesc.trim() && styles.inputRequired]}
              autoCapitalize="sentences"
            />

            <Text style={styles.fieldLabel}>Descripción larga *</Text>
            <TextInput
              value={longDesc}
              onChangeText={setLongDesc}
              placeholder="Descripción completa del servicio"
              style={[
                styles.inputMultiline,
                !longDesc.trim() && styles.inputRequired,
              ]}
              autoCapitalize="sentences"
              multiline
              numberOfLines={5}
              textAlignVertical="top"
            />

            <Text style={styles.fieldLabel}>URL de imagen</Text>
            <TextInput
              value={imageUrl}
              onChangeText={setImageUrl}
              placeholder="https://... (opcional)"
              style={styles.input}
              autoCapitalize="none"
              keyboardType="url"
            />
          </View>

          {/* Botón crear */}
          <Pressable
            onPress={handleCreate}
            disabled={!isValid || saving}
            style={[
              styles.btnCreate,
              (!isValid || saving) && styles.btnDisabled,
            ]}
          >
            {saving ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text style={styles.btnCreateText}>Crear servicio</Text>
            )}
          </Pressable>

          {!isValid && (
            <Text style={styles.requiredNote}>
              * Todos los campos marcados son obligatorios
            </Text>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F7F8FB' },
  container: { padding: 16, paddingBottom: 48, gap: 14 },

  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  backBtn: { width: 70, paddingVertical: 4 },
  backText: { color: '#007AFF', fontSize: 16, fontWeight: '600' },
  pageTitle: { fontSize: 20, fontWeight: '800', color: '#111' },

  card: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.07,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    gap: 4,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111',
    marginBottom: 8,
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
  toggleText: { fontSize: 13, fontWeight: '600', color: '#888' },
  toggleTextActive: { color: '#007AFF' },

  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#666',
    marginTop: 12,
    marginBottom: 4,
  },
  hint: { fontSize: 11, color: '#aaa', marginTop: 2 },

  input: {
    backgroundColor: '#F7F8FB',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: Platform.select({ ios: 12, android: 10 }),
    fontSize: 15,
    color: '#111',
  },
  inputMultiline: {
    backgroundColor: '#F7F8FB',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingTop: 12,
    fontSize: 15,
    color: '#111',
    minHeight: 120,
  },
  inputRequired: {
    borderColor: '#ffcdd2',
    backgroundColor: '#fff8f8',
  },

  btnCreate: {
    backgroundColor: '#007AFF',
    paddingVertical: 15,
    borderRadius: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  btnDisabled: { backgroundColor: '#b0bec5' },
  btnCreateText: { color: 'white', fontWeight: '800', fontSize: 16 },

  requiredNote: {
    textAlign: 'center',
    fontSize: 12,
    color: '#aaa',
    marginTop: 4,
  },
});
