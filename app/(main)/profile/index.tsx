import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  ActivityIndicator,
  Button,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useAuth } from '@/providers/AuthProvider';
import RequireAuthCard from '@/components/RequireAuthCard';
import { supabase } from '@/lib/supabase';

import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';

type UserProfileRow = {
  user_id: string;
  full_name: string | null;
  phone: string | null;
  dni: string | null;
  license_plate: string | null;
};

function normalizeSpaces(s: string) {
  return s.replace(/\s+/g, ' ').trim();
}
function normalizeUpperAlnum(s: string) {
  return s.replace(/[\s-]/g, '').toUpperCase().trim();
}
function normalizePlate(s: string) {
  return normalizeUpperAlnum(s);
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
  const num = parseInt(m[1], 10);
  const expected = DNI_LETTERS[num % 23];
  return m[2] === expected;
}
function isValidNIE(nieRaw: string): boolean {
  const nie = normalizeDniNie(nieRaw);
  const m = nie.match(/^([XYZ])(\d{7})([A-Z])$/);
  if (!m) return false;
  const prefixNum = m[1] === 'X' ? '0' : m[1] === 'Y' ? '1' : '2';
  const fullNum = parseInt(prefixNum + m[2], 10);
  const expected = DNI_LETTERS[fullNum % 23];
  return m[3] === expected;
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
function isValidSpanishPlate(value: string): boolean {
  const v = value.trim();
  if (!v) return true;
  const plate = normalizePlate(v);
  return /^\d{4}[A-Z]{3}$/.test(plate);
}

function hasAnyPersonalData(p: {
  full_name: string;
  dni: string;
  phone: string;
  license_plate: string;
}) {
  return Boolean(p.full_name || p.dni || p.phone || p.license_plate);
}

async function fetchUserProfile(userId: string, metaFullName: string) {
  const { data, error } = await supabase
    .from('user_profiles')
    .select('user_id, full_name, phone, dni, license_plate')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;

  return {
    full_name: (data?.full_name ?? metaFullName) || '',
    phone: data?.phone ?? '',
    dni: data?.dni ?? '',
    license_plate: data?.license_plate ?? '',
  };
}

export default function ProfileIndex() {
  const { session, signOut, isOwner } = useAuth();
  const user = session?.user;

  const navigation = useNavigation<any>();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);

  const [fullName, setFullName] = useState('');
  const [dni, setDni] = useState('');
  const [phone, setPhone] = useState('');
  const [licensePlate, setLicensePlate] = useState('');

  const [newPassword, setNewPassword] = useState('');
  const [repeatPassword, setRepeatPassword] = useState('');

  const [isEditing, setIsEditing] = useState(false);
  const [showEditButton, setShowEditButton] = useState(false);

  // ✅ snapshot estable para Cancelar / Descartar
  const initialRef = useRef<{
    full_name: string;
    dni: string;
    phone: string;
    license_plate: string;
  } | null>(null);

  // ✅ evita pisados por cargas tardías / re-focus
  const isEditingRef = useRef(false);
  useEffect(() => {
    isEditingRef.current = isEditing;
  }, [isEditing]);

  const provider = useMemo(() => {
    const p1 = user?.app_metadata?.provider as string | undefined;
    const p2 = Array.isArray(user?.app_metadata?.providers)
      ? (user?.app_metadata?.providers?.[0] as string | undefined)
      : undefined;
    return p1 ?? p2 ?? 'unknown';
  }, [user?.app_metadata]);

  const isEmailProvider = provider === 'email';

  // ✅ Bloqueo de navegación mientras editas
  useEffect(() => {
    const unsub = navigation.addListener('beforeRemove', (e: any) => {
      if (!isEditingRef.current) return;

      e.preventDefault();

      Alert.alert('Cambios sin guardar', 'Tienes cambios sin guardar.', [
        { text: 'Seguir editando', style: 'cancel' },
        {
          text: 'Descartar',
          style: 'destructive',
          onPress: () => {
            navigation.dispatch(e.data.action);
          },
        },
      ]);
    });

    return unsub;
  }, [navigation]);

  const applyLoaded = (loaded: {
    full_name: string;
    dni: string;
    phone: string;
    license_plate: string;
  }) => {
    setFullName(loaded.full_name);
    setDni(loaded.dni);
    setPhone(loaded.phone);
    setLicensePlate(loaded.license_plate);

    initialRef.current = loaded;

    const any = hasAnyPersonalData(loaded);
    setShowEditButton(any);
    setIsEditing(!any);
  };

  const rollbackToSnapshot = () => {
    const snap = initialRef.current;
    if (!snap) {
      setIsEditing(false);
      return;
    }
    setFullName(snap.full_name);
    setDni(snap.dni);
    setPhone(snap.phone);
    setLicensePlate(snap.license_plate);

    const any = hasAnyPersonalData(snap);
    setShowEditButton(any);
    setIsEditing(!any);
  };

  const loadProfile = async () => {
    if (!user) return;

    // ✅ Si estás editando, NO recargues/pises campos
    if (isEditingRef.current) return;

    setLoading(true);
    try {
      const metaFullName =
        (user.user_metadata?.full_name as string | undefined) ?? '';
      const loaded = await fetchUserProfile(user.id, metaFullName);
      applyLoaded(loaded);
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'No se pudo cargar el perfil.');

      const metaFullName =
        (user.user_metadata?.full_name as string | undefined) ?? '';
      applyLoaded({
        full_name: metaFullName || '',
        phone: '',
        dni: '',
        license_plate: '',
      });
    } finally {
      setLoading(false);
    }
  };

  // ✅ Carga inicial
  useEffect(() => {
    if (!session) return;
    void loadProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.id]);

  // ✅ Recargar al volver a esta pantalla (para estar “siempre” sincronizado)
  useFocusEffect(
    React.useCallback(() => {
      void loadProfile();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [session?.user?.id]),
  );

  const validateInputs = () => {
    const n = normalizeSpaces(fullName);
    const d = normalizeDniNie(dni);
    const p = normalizePhone(phone);
    const lp = normalizePlate(licensePlate);

    if (n && n.length < 2) {
      Alert.alert('Nombre inválido', 'El nombre es demasiado corto.');
      return false;
    }
    if (!isValidDNINIE(d)) {
      Alert.alert(
        'DNI/NIE inválido',
        'Revisa el formato y la letra del DNI/NIE.',
      );
      return false;
    }
    if (!isValidSpanishPhone(p)) {
      Alert.alert(
        'Teléfono inválido',
        'Introduce un teléfono español válido (9 dígitos, con o sin +34).',
      );
      return false;
    }
    if (!isValidSpanishPlate(lp)) {
      Alert.alert('Matrícula inválida', 'Formato esperado: 1234ABC.');
      return false;
    }
    return true;
  };

  const handleSaveProfile = async () => {
    if (!user) return;

    const normalizedFullName = normalizeSpaces(fullName);
    const normalizedDni = normalizeDniNie(dni);
    const normalizedPhone = normalizePhone(phone);
    const normalizedPlate = normalizePlate(licensePlate);

    setFullName(normalizedFullName);
    setDni(normalizedDni);
    setPhone(normalizedPhone);
    setLicensePlate(normalizedPlate);

    if (!validateInputs()) return;

    setSaving(true);
    try {
      const payload: UserProfileRow = {
        user_id: user.id,
        full_name: normalizedFullName ? normalizedFullName : null,
        phone: normalizedPhone ? normalizedPhone : null,
        dni: normalizedDni ? normalizedDni : null,
        license_plate: normalizedPlate ? normalizedPlate : null,
      };

      // ✅ Upsert + returning: esto te dice la verdad de lo que quedó guardado
      const { data: upserted, error: upsertError } = await supabase
        .from('user_profiles')
        .upsert(payload, { onConflict: 'user_id' })
        .select('user_id, full_name, phone, dni, license_plate')
        .single();

      if (upsertError) throw upsertError;

      console.log('[user_profiles] upsert returned', upserted);

      // ✅ Volver a leer “por si acaso” y pintar SOLO lo de BD
      const metaFullName =
        (user.user_metadata?.full_name as string | undefined) ?? '';
      const confirmed = await fetchUserProfile(user.id, metaFullName);

      applyLoaded(confirmed);

      // metadata del nombre (no bloqueante)
      if (payload.full_name) {
        const { error: metaError } = await supabase.auth.updateUser({
          data: { full_name: payload.full_name },
        });
        if (metaError) console.log('[auth.updateUser] metaError', metaError);
      }

      Alert.alert('Guardado', 'Tus datos se han actualizado correctamente.');
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'No se pudo guardar el perfil.');
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async () => {
    if (!user?.email) return;
    if (!isEmailProvider) return;

    const p1 = newPassword.trim();
    const p2 = repeatPassword.trim();

    if (p1.length < 8) {
      Alert.alert('Contraseña débil', 'Usa al menos 8 caracteres.');
      return;
    }
    if (p1 !== p2) {
      Alert.alert('No coincide', 'Las contraseñas no coinciden.');
      return;
    }

    setChangingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: p1 });
      if (error) throw error;

      setNewPassword('');
      setRepeatPassword('');
      Alert.alert('Listo', 'Tu contraseña se ha cambiado correctamente.');
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'No se pudo cambiar la contraseña.');
    } finally {
      setChangingPassword(false);
    }
  };

  const handleSignOut = async () => {
    Alert.alert(
      'Cerrar sesión',
      '¿Estás seguro de que quieres cerrar sesión?',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Cerrar sesión', onPress: signOut, style: 'destructive' },
      ],
    );
  };

  if (!session) return <RequireAuthCard />;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.select({ ios: 'padding', android: undefined })}
      >
        <ScrollView
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.title}>Perfil</Text>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Tu cuenta</Text>

            <Text style={styles.label}>Email</Text>
            <Text style={styles.value}>{session.user.email ?? '-'}</Text>

            <Text style={styles.label}>ID de usuario</Text>
            <Text style={styles.value}>{session.user.id}</Text>

            {isOwner ? (
              <Text style={styles.owner}>Eres propietario ✅</Text>
            ) : null}
          </View>

          <View style={styles.card}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>Datos personales</Text>

              {showEditButton ? (
                <Pressable
                  onPress={() => setIsEditing(true)}
                  disabled={isEditing}
                  style={({ pressed }) => [
                    styles.inlineEditButton,
                    pressed && !isEditing ? { opacity: 0.7 } : null,
                    isEditing ? styles.inlineEditButtonDisabled : null,
                  ]}
                >
                  <Text
                    style={[
                      styles.inlineEditText,
                      isEditing ? { opacity: 0.6 } : null,
                    ]}
                  >
                    ✏️
                  </Text>
                </Pressable>
              ) : null}
            </View>

            {loading ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator />
                <Text style={{ marginLeft: 10 }}>Cargando datos…</Text>
              </View>
            ) : (
              <>
                <Text style={styles.label}>Nombre completo</Text>
                <TextInput
                  value={fullName}
                  onChangeText={setFullName}
                  placeholder="Nombre y apellidos"
                  style={[
                    styles.input,
                    !isEditing ? styles.inputReadOnly : null,
                  ]}
                  autoCapitalize="words"
                  editable={isEditing}
                />

                <Text style={styles.label}>DNI / NIE</Text>
                <TextInput
                  value={dni}
                  onChangeText={setDni}
                  placeholder="12345678Z o X1234567L"
                  style={[
                    styles.input,
                    !isEditing ? styles.inputReadOnly : null,
                  ]}
                  autoCapitalize="characters"
                  editable={isEditing}
                />

                <Text style={styles.label}>Teléfono</Text>
                <TextInput
                  value={phone}
                  onChangeText={setPhone}
                  placeholder="+34 600 000 000"
                  style={[
                    styles.input,
                    !isEditing ? styles.inputReadOnly : null,
                  ]}
                  keyboardType="phone-pad"
                  editable={isEditing}
                />

                <Text style={styles.label}>Matrícula</Text>
                <TextInput
                  value={licensePlate}
                  onChangeText={setLicensePlate}
                  placeholder="1234ABC"
                  style={[
                    styles.input,
                    !isEditing ? styles.inputReadOnly : null,
                  ]}
                  autoCapitalize="characters"
                  editable={isEditing}
                />

                <View style={{ height: 12 }} />

                {isEditing ? (
                  <View style={styles.rowButtons}>
                    <View style={styles.flex}>
                      <Button
                        title={saving ? 'Guardando…' : 'Guardar cambios'}
                        onPress={handleSaveProfile}
                        disabled={saving}
                      />
                    </View>
                    <View style={{ width: 10 }} />
                    <View style={styles.flex}>
                      <Button
                        title="Cancelar"
                        onPress={rollbackToSnapshot}
                        disabled={saving}
                      />
                    </View>
                  </View>
                ) : null}
              </>
            )}
          </View>

          {isEmailProvider ? (
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Seguridad</Text>

              <Text style={styles.label}>Nueva contraseña</Text>
              <TextInput
                value={newPassword}
                onChangeText={setNewPassword}
                placeholder="Mínimo 8 caracteres"
                style={styles.input}
                secureTextEntry
                autoCapitalize="none"
              />

              <Text style={styles.label}>Repetir contraseña</Text>
              <TextInput
                value={repeatPassword}
                onChangeText={setRepeatPassword}
                placeholder="Repite la nueva contraseña"
                style={styles.input}
                secureTextEntry
                autoCapitalize="none"
              />

              <Button
                title={changingPassword ? 'Cambiando…' : 'Cambiar contraseña'}
                onPress={handleChangePassword}
                disabled={changingPassword}
              />
            </View>
          ) : null}

          <View style={styles.logoutWrap}>
            <Button
              title="Cerrar sesión"
              onPress={handleSignOut}
              color="#ff4444"
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  flex: { flex: 1 },
  container: { padding: 16, paddingBottom: 40, gap: 14 },

  title: { fontSize: 28, fontWeight: 'bold', marginTop: 8, marginBottom: 6 },

  card: {
    width: '100%',
    padding: 16,
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    gap: 10,
  },

  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
  },
  sectionTitle: { fontSize: 18, fontWeight: '700' },

  inlineEditButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#eaeaea',
    alignItems: 'center',
    justifyContent: 'center',
  },
  inlineEditButtonDisabled: { opacity: 0.5 },
  inlineEditText: { fontSize: 16 },

  readOnlyPill: {
    marginLeft: 'auto',
    fontSize: 12,
    fontWeight: '700',
    color: '#333',
    backgroundColor: '#e9e9e9',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },

  label: { fontSize: 14, fontWeight: '600', color: '#666', marginTop: 6 },
  value: { fontSize: 15, color: '#333', marginTop: 2 },

  input: {
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: Platform.select({ ios: 12, android: 10 }),
    fontSize: 16,
    marginTop: 4,
    color: '#111',
  },
  inputReadOnly: {
    backgroundColor: '#fafafa',
    borderColor: '#e5e5e5',
    opacity: 0.95,
  },

  owner: { marginTop: 10, color: 'green', fontWeight: '600' },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
  },

  rowButtons: { flexDirection: 'row', alignItems: 'center' },
  logoutWrap: { marginTop: 4 },
});
