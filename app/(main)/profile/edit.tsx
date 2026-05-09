import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { useNavigation } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/providers/AuthProvider';
import { supabase } from '@/lib/supabase';

function normalizeSpaces(s: string) {
  return s.replace(/\s+/g, ' ').trim();
}
function normalizeUpperAlnum(s: string) {
  return s.replace(/[\s-]/g, '').toUpperCase().trim();
}
function normalizeDniNie(s: string) {
  return normalizeUpperAlnum(s);
}
function normalizePhone(s: string) {
  const trimmed = s.trim();
  const hasPlus = trimmed.startsWith('+');
  const digits = trimmed.replace(/[^\d]/g, '');
  return hasPlus ? `+${digits}` : digits;
}
const DNI_LETTERS = 'TRWAGMYFPDXBNJZSQVHLCKE';
function isValidDNI(dniRaw: string): boolean {
  const dni = normalizeDniNie(dniRaw);
  const m = dni.match(/^(\d{8})([A-Z])$/);
  if (!m) return false;
  return m[2] === DNI_LETTERS[parseInt(m[1], 10) % 23];
}
function isValidNIE(nieRaw: string): boolean {
  const nie = normalizeDniNie(nieRaw);
  const m = nie.match(/^([XYZ])(\d{7})([A-Z])$/);
  if (!m) return false;
  const prefixNum = m[1] === 'X' ? '0' : m[1] === 'Y' ? '1' : '2';
  return m[3] === DNI_LETTERS[parseInt(prefixNum + m[2], 10) % 23];
}
function isValidDNINIE(value: string): boolean {
  const v = normalizeDniNie(value);
  if (!v) return true;
  if (/^\d{8}[A-Z]$/.test(v)) return isValidDNI(v);
  if (/^[XYZ]\d{7}[A-Z]$/.test(v)) return isValidNIE(v);
  return false;
}
function isValidSpanishPhone(value: string): boolean {
  const v = value.trim();
  if (!v) return true;
  let digits = v.replace(/[^\d]/g, '');
  if (digits.startsWith('0034')) digits = digits.slice(4);
  if (digits.startsWith('34') && digits.length === 11) digits = digits.slice(2);
  if (!/^\d{9}$/.test(digits)) return false;
  return /^[6789]/.test(digits);
}

async function loadProfile(userId: string, metaFullName: string) {
  const { data, error } = await supabase
    .from('user_profiles')
    .select('first_name, last_name, full_name, phone, dni')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  const fallback = data?.full_name ?? metaFullName ?? '';
  return {
    first_name:
      data?.first_name ?? (fallback ? fallback.split(' ')[0] : '') ?? '',
    last_name:
      data?.last_name ??
      (fallback ? fallback.split(' ').slice(1).join(' ') : '') ??
      '',
    phone: data?.phone ?? '',
    dni: data?.dni ?? '',
  };
}

type Snapshot = {
  first_name: string;
  last_name: string;
  dni: string;
  phone: string;
};

export default function ProfileEdit() {
  const { session } = useAuth();
  const router = useRouter();
  const navigation = useNavigation<any>();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [dni, setDni] = useState('');
  const [phone, setPhone] = useState('');

  const initialRef = useRef<Snapshot | null>(null);
  const isEditingRef = useRef(false);

  useEffect(() => {
    isEditingRef.current = isEditing;
  }, [isEditing]);

  useEffect(() => {
    const unsub = navigation.addListener('beforeRemove', (e: any) => {
      if (!isEditingRef.current) return;
      e.preventDefault();
      Alert.alert('Cambios sin guardar', 'Tienes cambios sin guardar.', [
        { text: 'Seguir editando', style: 'cancel' },
        {
          text: 'Descartar',
          style: 'destructive',
          onPress: () => navigation.dispatch(e.data.action),
        },
      ]);
    });
    return unsub;
  }, [navigation]);

  const applyLoaded = (profile: Snapshot) => {
    setFirstName(profile.first_name);
    setLastName(profile.last_name);
    setDni(profile.dni);
    setPhone(profile.phone);
    initialRef.current = profile;
    const hasData = Boolean(
      profile.first_name || profile.last_name || profile.dni || profile.phone,
    );
    setIsEditing(!hasData);
  };

  useEffect(() => {
    if (!session?.user?.id) return;
    void (async () => {
      setLoading(true);
      try {
        const meta =
          (session.user.user_metadata?.full_name as string | undefined) ?? '';
        applyLoaded(await loadProfile(session.user.id, meta));
      } catch {
        applyLoaded({ first_name: '', last_name: '', dni: '', phone: '' });
      } finally {
        setLoading(false);
      }
    })();
  }, [session?.user?.id]);

  const rollback = () => {
    const snap = initialRef.current;
    if (!snap) { setIsEditing(false); return; }
    setFirstName(snap.first_name);
    setLastName(snap.last_name);
    setDni(snap.dni);
    setPhone(snap.phone);
    setIsEditing(false);
  };

  const handleSave = async () => {
    if (!session?.user) return;

    const f = normalizeSpaces(firstName);
    const l = normalizeSpaces(lastName);
    const d = normalizeDniNie(dni);
    const p = normalizePhone(phone);

    setFirstName(f);
    setLastName(l);
    setDni(d);
    setPhone(p);

    if (f && f.length < 2) {
      Alert.alert('Nombre inválido', 'El nombre es demasiado corto.');
      return;
    }
    if (!isValidDNINIE(d)) {
      Alert.alert('DNI/NIE inválido', 'Revisa el formato y la letra.');
      return;
    }
    if (!isValidSpanishPhone(p)) {
      Alert.alert('Teléfono inválido', 'Introduce un teléfono español válido.');
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase.from('user_profiles').upsert(
        {
          user_id: session.user.id,
          first_name: f || null,
          last_name: l || null,
          phone: p || null,
          dni: d || null,
        },
        { onConflict: 'user_id' },
      );
      if (error) throw error;

      const fullName = [f, l].filter(Boolean).join(' ');
      if (fullName) await supabase.auth.updateUser({ data: { full_name: fullName } });

      const updated: Snapshot = { first_name: f, last_name: l, dni: d, phone: p };
      initialRef.current = updated;
      setIsEditing(false);
      Alert.alert('Guardado', 'Tus datos se han actualizado.');
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'No se pudo guardar el perfil.');
    } finally {
      setSaving(false);
    }
  };

  const fields: { label: string; value: string }[] = [
    { label: 'Nombre', value: firstName || '—' },
    { label: 'Apellidos', value: lastName || '—' },
    { label: 'DNI / NIE', value: dni || '—' },
    { label: 'Teléfono', value: phone || '—' },
  ];

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
          <Text style={styles.headerTitle}>Datos personales</Text>
          <View style={[styles.headerSide, styles.headerSideRight]}>
            {!loading && !isEditing && (
              <Pressable
                onPress={() => setIsEditing(true)}
                hitSlop={8}
                style={styles.pencilBtn}
              >
                <Text style={styles.pencilText}>✏️</Text>
              </Pressable>
            )}
          </View>
        </View>

        <ScrollView
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
        >
          {loading ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator />
              <Text style={{ marginLeft: 10 }}>Cargando datos…</Text>
            </View>
          ) : (
            <>
              <View style={styles.card}>
                {isEditing ? (
                  <>
                    <Text style={styles.fieldLabel}>Nombre</Text>
                    <TextInput
                      value={firstName}
                      onChangeText={setFirstName}
                      placeholder="Nombre"
                      style={styles.input}
                      autoCapitalize="words"
                    />
                    <View style={styles.divider} />
                    <Text style={styles.fieldLabel}>Apellidos</Text>
                    <TextInput
                      value={lastName}
                      onChangeText={setLastName}
                      placeholder="Apellidos"
                      style={styles.input}
                      autoCapitalize="words"
                    />
                    <View style={styles.divider} />
                    <Text style={styles.fieldLabel}>DNI / NIE</Text>
                    <TextInput
                      value={dni}
                      onChangeText={setDni}
                      placeholder="12345678Z"
                      style={styles.input}
                      autoCapitalize="characters"
                    />
                    <View style={styles.divider} />
                    <Text style={styles.fieldLabel}>Teléfono</Text>
                    <TextInput
                      value={phone}
                      onChangeText={setPhone}
                      placeholder="+34 600 000 000"
                      style={styles.input}
                      keyboardType="phone-pad"
                    />
                  </>
                ) : (
                  fields.map((f, i) => (
                    <React.Fragment key={f.label}>
                      <Text style={styles.fieldLabel}>{f.label}</Text>
                      <Text style={styles.fieldValue}>{f.value}</Text>
                      {i < fields.length - 1 && <View style={styles.divider} />}
                    </React.Fragment>
                  ))
                )}
              </View>

              {isEditing && (
                <View style={styles.editActions}>
                  <Pressable
                    style={({ pressed }) => [
                      styles.cancelBtn,
                      pressed && { opacity: 0.7 },
                    ]}
                    onPress={rollback}
                    disabled={saving}
                  >
                    <Text style={styles.cancelBtnText}>Cancelar</Text>
                  </Pressable>
                  <Pressable
                    style={({ pressed }) => [
                      styles.saveBtn,
                      saving && { opacity: 0.6 },
                      pressed && { opacity: 0.8 },
                    ]}
                    onPress={handleSave}
                    disabled={saving}
                  >
                    <Text style={styles.saveBtnText}>
                      {saving ? 'Guardando…' : 'Guardar'}
                    </Text>
                  </Pressable>
                </View>
              )}
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f2f2f7' },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e0e0e0',
  },
  headerSide: { width: 70 },
  headerSideRight: { alignItems: 'flex-end' },
  headerBack: { color: '#007AFF', fontSize: 16 },
  headerTitle: { fontSize: 17, fontWeight: '600', color: '#111' },
  pencilBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#eaeaea',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pencilText: { fontSize: 16 },
  container: { padding: 20, paddingBottom: 40, gap: 16 },
  loadingRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 20 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 16,
    overflow: 'hidden',
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#888',
    marginTop: 14,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  fieldValue: {
    fontSize: 16,
    color: '#111',
    paddingVertical: Platform.select({ ios: 10, android: 8 }),
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#e0e0e0',
    marginTop: 4,
  },
  input: {
    fontSize: 16,
    paddingVertical: Platform.select({ ios: 10, android: 8 }),
    color: '#111',
  },
  editActions: {
    flexDirection: 'row',
    gap: 12,
  },
  cancelBtn: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
    backgroundColor: '#e5e5ea',
  },
  cancelBtnText: { color: '#111', fontSize: 16, fontWeight: '600' },
  saveBtn: {
    flex: 1,
    backgroundColor: '#007AFF',
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
  },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
