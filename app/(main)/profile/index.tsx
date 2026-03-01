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
  first_name: string | null;
  last_name: string | null;
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
function isValidSpanishPlate(value: string): boolean {
  const v = value.trim();
  if (!v) return true;
  return /^\d{4}[A-Z]{3}$/.test(normalizePlate(v));
}

async function fetchUserProfile(userId: string, metaFullName: string) {
  const { data, error } = await supabase
    .from('user_profiles')
    .select('first_name, last_name, full_name, phone, dni, license_plate')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;

  const fallbackName = data?.full_name ?? metaFullName ?? '';
  return {
    first_name:
      data?.first_name ??
      (fallbackName ? fallbackName.split(' ')[0] : '') ??
      '',
    last_name:
      data?.last_name ??
      (fallbackName ? fallbackName.split(' ').slice(1).join(' ') : '') ??
      '',
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

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [dni, setDni] = useState('');
  const [phone, setPhone] = useState('');
  const [licensePlate, setLicensePlate] = useState('');

  const [showPasswordSection, setShowPasswordSection] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [repeatPassword, setRepeatPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  const [isEditing, setIsEditing] = useState(false);
  const [showEditButton, setShowEditButton] = useState(false);

  const initialRef = useRef<{
    first_name: string;
    last_name: string;
    dni: string;
    phone: string;
    license_plate: string;
  } | null>(null);
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

  const applyLoaded = (loaded: {
    first_name: string;
    last_name: string;
    dni: string;
    phone: string;
    license_plate: string;
  }) => {
    setFirstName(loaded.first_name);
    setLastName(loaded.last_name);
    setDni(loaded.dni);
    setPhone(loaded.phone);
    setLicensePlate(loaded.license_plate);
    initialRef.current = loaded;
    const any = Boolean(
      loaded.first_name ||
        loaded.last_name ||
        loaded.dni ||
        loaded.phone ||
        loaded.license_plate,
    );
    setShowEditButton(any);
    setIsEditing(!any);
  };

  const rollbackToSnapshot = () => {
    const snap = initialRef.current;
    if (!snap) {
      setIsEditing(false);
      return;
    }
    setFirstName(snap.first_name);
    setLastName(snap.last_name);
    setDni(snap.dni);
    setPhone(snap.phone);
    setLicensePlate(snap.license_plate);
    const any = Boolean(
      snap.first_name ||
        snap.last_name ||
        snap.dni ||
        snap.phone ||
        snap.license_plate,
    );
    setShowEditButton(any);
    setIsEditing(!any);
  };

  useEffect(() => {
    if (!session?.user?.id) return;
    void (async () => {
      if (isEditingRef.current) return;
      setLoading(true);
      try {
        const meta =
          (user?.user_metadata?.full_name as string | undefined) ?? '';
        applyLoaded(await fetchUserProfile(session.user.id, meta));
      } catch {
        applyLoaded({
          first_name: '',
          last_name: '',
          phone: '',
          dni: '',
          license_plate: '',
        });
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.id]);

  useFocusEffect(
    React.useCallback(() => {
      if (!session?.user?.id || isEditingRef.current) return;
      setLoading(true);
      const meta = (user?.user_metadata?.full_name as string | undefined) ?? '';
      fetchUserProfile(session.user.id, meta)
        .then(applyLoaded)
        .catch(() =>
          applyLoaded({
            first_name: '',
            last_name: '',
            phone: '',
            dni: '',
            license_plate: '',
          }),
        )
        .finally(() => setLoading(false));
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [session?.user?.id]),
  );

  const handleSaveProfile = async () => {
    if (!user) return;

    const normalizedFirst = normalizeSpaces(firstName);
    const normalizedLast = normalizeSpaces(lastName);
    const normalizedDni = normalizeDniNie(dni);
    const normalizedPhone = normalizePhone(phone);
    const normalizedPlate = normalizePlate(licensePlate);

    setFirstName(normalizedFirst);
    setLastName(normalizedLast);
    setDni(normalizedDni);
    setPhone(normalizedPhone);
    setLicensePlate(normalizedPlate);

    if (normalizedFirst && normalizedFirst.length < 2) {
      Alert.alert('Nombre inválido', 'El nombre es demasiado corto.');
      return;
    }
    if (!isValidDNINIE(normalizedDni)) {
      Alert.alert('DNI/NIE inválido', 'Revisa el formato y la letra.');
      return;
    }
    if (!isValidSpanishPhone(normalizedPhone)) {
      Alert.alert('Teléfono inválido', 'Introduce un teléfono español válido.');
      return;
    }
    if (!isValidSpanishPlate(normalizedPlate)) {
      Alert.alert('Matrícula inválida', 'Formato esperado: 1234ABC.');
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase.from('user_profiles').upsert(
        {
          user_id: user.id,
          first_name: normalizedFirst || null,
          last_name: normalizedLast || null,
          phone: normalizedPhone || null,
          dni: normalizedDni || null,
          license_plate: normalizedPlate || null,
        } as UserProfileRow,
        { onConflict: 'user_id' },
      );

      if (error) throw error;

      const fullName = [normalizedFirst, normalizedLast]
        .filter(Boolean)
        .join(' ');
      if (fullName)
        await supabase.auth.updateUser({ data: { full_name: fullName } });

      const meta = (user.user_metadata?.full_name as string | undefined) ?? '';
      applyLoaded(await fetchUserProfile(user.id, meta));
      Alert.alert('Guardado', 'Tus datos se han actualizado correctamente.');
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'No se pudo guardar el perfil.');
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async () => {
    if (!user?.email || !isEmailProvider) return;
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
      setShowPasswordSection(false);
      Alert.alert('Listo', 'Tu contraseña se ha cambiado correctamente.');
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'No se pudo cambiar la contraseña.');
    } finally {
      setChangingPassword(false);
    }
  };

  const handleSignOut = () => {
    Alert.alert('Cerrar sesión', '¿Estás seguro?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Cerrar sesión', onPress: signOut, style: 'destructive' },
    ]);
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

          {/* ── Cuenta ── */}
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Tu cuenta</Text>
            <Text style={styles.label}>Email</Text>
            <Text style={styles.value}>{session.user.email ?? '—'}</Text>
            {isOwner && <Text style={styles.ownerBadge}>Propietario ✅</Text>}
            <Text style={styles.userId}>ID: {session.user.id}</Text>
          </View>

          {/* ── Datos personales ── */}
          <View style={styles.card}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>Datos personales</Text>
              {showEditButton && (
                <Pressable
                  onPress={() => setIsEditing(true)}
                  disabled={isEditing}
                  style={[styles.editBtn, isEditing && { opacity: 0.4 }]}
                >
                  <Text style={styles.editBtnText}>✏️</Text>
                </Pressable>
              )}
            </View>

            {loading ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator />
                <Text style={{ marginLeft: 10 }}>Cargando datos…</Text>
              </View>
            ) : (
              <>
                <Text style={styles.label}>Nombre</Text>
                {isEditing ? (
                  <TextInput
                    value={firstName}
                    onChangeText={setFirstName}
                    placeholder="Nombre"
                    style={styles.input}
                    autoCapitalize="words"
                  />
                ) : (
                  <Text style={styles.value}>{firstName || '—'}</Text>
                )}

                <Text style={styles.label}>Apellidos</Text>
                {isEditing ? (
                  <TextInput
                    value={lastName}
                    onChangeText={setLastName}
                    placeholder="Apellidos"
                    style={styles.input}
                    autoCapitalize="words"
                  />
                ) : (
                  <Text style={styles.value}>{lastName || '—'}</Text>
                )}

                <Text style={styles.label}>DNI / NIE</Text>
                {isEditing ? (
                  <TextInput
                    value={dni}
                    onChangeText={setDni}
                    placeholder="12345678Z"
                    style={styles.input}
                    autoCapitalize="characters"
                  />
                ) : (
                  <Text style={styles.value}>{dni || '—'}</Text>
                )}

                <Text style={styles.label}>Teléfono</Text>
                {isEditing ? (
                  <TextInput
                    value={phone}
                    onChangeText={setPhone}
                    placeholder="+34 600 000 000"
                    style={styles.input}
                    keyboardType="phone-pad"
                  />
                ) : (
                  <Text style={styles.value}>{phone || '—'}</Text>
                )}

                <Text style={styles.label}>Matrícula</Text>
                {isEditing ? (
                  <TextInput
                    value={licensePlate}
                    onChangeText={setLicensePlate}
                    placeholder="1234ABC"
                    style={styles.input}
                    autoCapitalize="characters"
                  />
                ) : (
                  <Text style={styles.value}>{licensePlate || '—'}</Text>
                )}

                {isEditing && (
                  <View style={[styles.rowButtons, { marginTop: 12 }]}>
                    <View style={styles.flex}>
                      <Button
                        title={saving ? 'Guardando…' : 'Guardar'}
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
                )}
              </>
            )}
          </View>

          {/* ── Seguridad ── */}
          {isEmailProvider ? (
            <View style={styles.card}>
              <Pressable
                style={styles.sectionHeaderRow}
                onPress={() => setShowPasswordSection((v) => !v)}
              >
                <Text style={styles.sectionTitle}>Seguridad</Text>
                <Text style={styles.chevron}>
                  {showPasswordSection ? '▲' : '▼'}
                </Text>
              </Pressable>

              {showPasswordSection && (
                <>
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
                  <View style={{ marginTop: 8 }}>
                    <Button
                      title={
                        changingPassword ? 'Cambiando…' : 'Cambiar contraseña'
                      }
                      onPress={handleChangePassword}
                      disabled={changingPassword}
                    />
                  </View>
                </>
              )}
            </View>
          ) : (
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Seguridad</Text>
              <Text style={[styles.value, { marginTop: 8 }]}>
                Tu cuenta está vinculada con Google. Para cambiar tu contraseña,
                hazlo desde tu cuenta de Google.
              </Text>
            </View>
          )}

          {/* ── Cerrar sesión ── */}
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
    gap: 4,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  sectionTitle: { fontSize: 18, fontWeight: '700' },

  userId: {
    fontSize: 11,
    color: '#ccc',
    marginTop: 10,
    fontFamily: Platform.select({ ios: 'Courier', android: 'monospace' }),
  },
  ownerBadge: { marginTop: 6, color: 'green', fontWeight: '600' },

  editBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#eaeaea',
    alignItems: 'center',
    justifyContent: 'center',
  },
  editBtnText: { fontSize: 16 },
  chevron: { fontSize: 14, color: '#888', fontWeight: '700' },

  label: { fontSize: 13, fontWeight: '600', color: '#888', marginTop: 10 },
  value: { fontSize: 16, color: '#111', marginTop: 2 },

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

  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
  },
  rowButtons: { flexDirection: 'row', alignItems: 'center' },
  logoutWrap: { marginTop: 4 },
});
