import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Modal,
} from 'react-native';
import DateTimePicker, {
  DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { useRouter } from 'expo-router';
import SignInEmailButton from '@/components/SignInEmailButton';
import SignInButton from '@/components/SignInButton';
import PrivacyModal from '@/components/PrivacyModal';
import { supabase } from '@/lib/supabase';
import {
  isValidDNINIE,
  isValidName,
  isValidLocalPhone,
} from '@/components/utils/validation';
import { colors, radii, shadow, spacing, typography } from '@/lib/theme';
import { AppAlert } from '@/components/AppAlert';

type Tab = 'signin' | 'signup';

const GENDER_OPTIONS = [
  { value: 'male', label: 'Hombre' },
  { value: 'female', label: 'Mujer' },
  { value: 'other', label: 'Otro' },
  { value: 'undisclosed', label: 'No indicar' },
] as const;
type GenderValue = (typeof GENDER_OPTIONS)[number]['value'] | '';

const COUNTRY_CODES = [
  { country: 'España', prefix: '+34', flag: '🇪🇸' },
  { country: 'Alemania', prefix: '+49', flag: '🇩🇪' },
  { country: 'Francia', prefix: '+33', flag: '🇫🇷' },
  { country: 'Italia', prefix: '+39', flag: '🇮🇹' },
  { country: 'Países Bajos', prefix: '+31', flag: '🇳🇱' },
  { country: 'Reino Unido', prefix: '+44', flag: '🇬🇧' },
];

function dateToISO(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}
function formatDateDisplay(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()}`;
}

export default function AuthScreen() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>('signin');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [suEmail, setSuEmail] = useState('');
  const [suPassword, setSuPassword] = useState('');
  const [suRepeat, setSuRepeat] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [dni, setDni] = useState('');
  const [phonePrefix, setPhonePrefix] = useState('+34');
  const [localPhone, setLocalPhone] = useState('');
  const [showPrefixModal, setShowPrefixModal] = useState(false);
  const [birthDate, setBirthDate] = useState<Date | null>(null);
  const [showBirthPicker, setShowBirthPicker] = useState(false);
  const [gender, setGender] = useState<GenderValue>('');
  const [signUpLoading, setSignUpLoading] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);

  const maxBirthDate = new Date(
    new Date().getFullYear() - 18,
    new Date().getMonth(),
    new Date().getDate(),
  );

  const selectedCountry =
    COUNTRY_CODES.find((c) => c.prefix === phonePrefix) ?? COUNTRY_CODES[0];

  const handleSignUp = async () => {
    if (!termsAccepted) {
      AppAlert.alert('Términos y condiciones', 'Debes aceptar los términos y condiciones para continuar.');
      return;
    }
    if (!suEmail.trim() || !suPassword.trim()) {
      AppAlert.alert('Campos requeridos', 'El email y la contraseña son obligatorios.');
      return;
    }
    if (!isValidName(firstName)) {
      AppAlert.alert('Nombre inválido', 'El nombre debe tener al menos 2 caracteres y solo puede contener letras.');
      return;
    }
    if (!isValidName(lastName)) {
      AppAlert.alert('Apellido inválido', 'El apellido debe tener al menos 2 caracteres y solo puede contener letras.');
      return;
    }
    if (!dni.trim()) {
      AppAlert.alert('Campos requeridos', 'El DNI/NIE es obligatorio.');
      return;
    }
    if (!isValidDNINIE(dni)) {
      AppAlert.alert('DNI/NIE inválido', 'Comprueba el formato. DNI: 8 dígitos + letra (ej: 12345678Z). NIE: X/Y/Z + 7 dígitos + letra (ej: X1234567L).');
      return;
    }
    if (localPhone.trim() && !isValidLocalPhone(localPhone)) {
      AppAlert.alert('Teléfono inválido', 'Introduce al menos 6 dígitos en el número.');
      return;
    }
    if (!birthDate) {
      AppAlert.alert('Campos requeridos', 'La fecha de nacimiento es obligatoria.');
      return;
    }
    if (!gender) {
      AppAlert.alert('Campos requeridos', 'Selecciona un género.');
      return;
    }
    if (suPassword.length < 8) {
      AppAlert.alert('Contraseña débil', 'Usa al menos 8 caracteres.');
      return;
    }
    if (suPassword !== suRepeat) {
      AppAlert.alert('Contraseñas distintas', 'Las contraseñas no coinciden.');
      return;
    }

    setSignUpLoading(true);
    try {
      const fullName = `${firstName.trim()} ${lastName.trim()}`;
      const phone = localPhone.trim() ? `${phonePrefix}${localPhone.trim()}` : null;
      const { data, error } = await supabase.auth.signUp({
        email: suEmail.trim().toLowerCase(),
        password: suPassword,
        options: { data: { full_name: fullName } },
      });
      if (error) throw error;
      if (data.user) {
        const { error: profileError } = await supabase
          .from('user_profiles')
          .upsert(
            {
              user_id: data.user.id,
              full_name: fullName,
              first_name: firstName.trim(),
              last_name: lastName.trim(),
              dni: dni.trim().toUpperCase(),
              phone,
              birth_date: dateToISO(birthDate),
              gender,
            },
            { onConflict: 'user_id' },
          );
        if (profileError) console.warn('[sign-up] profile error', profileError);
      }
      AppAlert.alert(
        '¡Cuenta creada!',
        'Revisa tu email para confirmar tu cuenta antes de iniciar sesión.',
        [{ text: 'OK', onPress: () => setActiveTab('signin') }],
      );
    } catch (e: any) {
      AppAlert.alert('Error', e?.message ?? 'No se pudo crear la cuenta.');
    } finally {
      setSignUpLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.select({ ios: 'padding', android: undefined })}
    >
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Text style={styles.title}>Àrea Camper</Text>
          <Text style={styles.subtitle}>Tu acceso al área</Text>
        </View>

        <SignInButton disabled={!termsAccepted} />

        <View style={styles.divider}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>o continúa con email</Text>
          <View style={styles.dividerLine} />
        </View>

        <View style={styles.tabs}>
          <Pressable
            style={[styles.tab, activeTab === 'signin' && styles.tabActive]}
            onPress={() => setActiveTab('signin')}
          >
            <Text style={[styles.tabText, activeTab === 'signin' && styles.tabTextActive]}>
              Iniciar sesión
            </Text>
          </Pressable>
          <Pressable
            style={[styles.tab, activeTab === 'signup' && styles.tabActive]}
            onPress={() => setActiveTab('signup')}
          >
            <Text style={[styles.tabText, activeTab === 'signup' && styles.tabTextActive]}>
              Registrarse
            </Text>
          </Pressable>
        </View>

        {activeTab === 'signin' ? (
          <View style={styles.form}>
            <View style={styles.field}>
              <Text style={styles.label}>Email</Text>
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="tucorreo@ejemplo.com"
                autoCapitalize="none"
                keyboardType="email-address"
                autoCorrect={false}
                style={styles.input}
                placeholderTextColor={colors.onSurfaceVariant}
              />
            </View>
            <View style={styles.field}>
              <Text style={styles.label}>Contraseña</Text>
              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder="••••••••"
                secureTextEntry
                style={styles.input}
                placeholderTextColor={colors.onSurfaceVariant}
              />
            </View>
            <Pressable
              onPress={() => setTermsAccepted(!termsAccepted)}
              style={styles.checkboxRow}
            >
              <View style={[styles.checkbox, termsAccepted && styles.checkboxChecked]}>
                {termsAccepted && <Text style={styles.checkmark}>✓</Text>}
              </View>
              <Text style={styles.checkboxLabel}>
                Acepto los{' '}
                <Text
                  style={styles.checkboxLink}
                  onPress={() => setShowPrivacy(true)}
                >
                  términos y condiciones
                </Text>
              </Text>
            </Pressable>
            <SignInEmailButton email={email} password={password} disabled={!termsAccepted} />
          </View>
        ) : (
          <View style={styles.form}>
            <Text style={styles.sectionLabel}>CUENTA</Text>
            <View style={styles.field}>
              <Text style={styles.label}>Email *</Text>
              <TextInput
                value={suEmail}
                onChangeText={setSuEmail}
                placeholder="tucorreo@ejemplo.com"
                autoCapitalize="none"
                keyboardType="email-address"
                autoCorrect={false}
                style={styles.input}
                placeholderTextColor={colors.onSurfaceVariant}
              />
            </View>
            <View style={styles.field}>
              <Text style={styles.label}>Contraseña * (mín. 8 caracteres)</Text>
              <TextInput
                value={suPassword}
                onChangeText={setSuPassword}
                placeholder="••••••••"
                secureTextEntry
                style={styles.input}
                placeholderTextColor={colors.onSurfaceVariant}
              />
            </View>
            <View style={styles.field}>
              <Text style={styles.label}>Repetir contraseña *</Text>
              <TextInput
                value={suRepeat}
                onChangeText={setSuRepeat}
                placeholder="••••••••"
                secureTextEntry
                style={styles.input}
                placeholderTextColor={colors.onSurfaceVariant}
              />
            </View>

            <Text style={[styles.sectionLabel, { marginTop: 16 }]}>DATOS PERSONALES</Text>

            <View style={styles.row}>
              <View style={[styles.field, { flex: 1 }]}>
                <Text style={styles.label}>Nombre *</Text>
                <TextInput
                  value={firstName}
                  onChangeText={setFirstName}
                  placeholder="Juan"
                  autoCapitalize="words"
                  style={styles.input}
                  placeholderTextColor={colors.onSurfaceVariant}
                />
              </View>
              <View style={{ width: 12 }} />
              <View style={[styles.field, { flex: 1 }]}>
                <Text style={styles.label}>Apellido *</Text>
                <TextInput
                  value={lastName}
                  onChangeText={setLastName}
                  placeholder="García"
                  autoCapitalize="words"
                  style={styles.input}
                  placeholderTextColor={colors.onSurfaceVariant}
                />
              </View>
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>DNI / NIE *</Text>
              <TextInput
                value={dni}
                onChangeText={setDni}
                placeholder="12345678Z"
                autoCapitalize="characters"
                style={styles.input}
                placeholderTextColor={colors.onSurfaceVariant}
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Teléfono (opcional)</Text>
              <View style={styles.phoneRow}>
                <Pressable
                  onPress={() => setShowPrefixModal(true)}
                  style={styles.prefixBtn}
                >
                  <Text style={styles.prefixText}>
                    {selectedCountry.flag} {selectedCountry.prefix}
                  </Text>
                  <Text style={styles.prefixArrow}>▾</Text>
                </Pressable>
                <TextInput
                  value={localPhone}
                  onChangeText={setLocalPhone}
                  placeholder="600 000 000"
                  keyboardType="phone-pad"
                  style={[styles.input, { flex: 1 }]}
                  placeholderTextColor={colors.onSurfaceVariant}
                />
              </View>
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Fecha de nacimiento *</Text>
              {Platform.OS === 'ios' ? (
                <DateTimePicker
                  value={birthDate ?? new Date()}
                  mode="date"
                  display="compact"
                  maximumDate={maxBirthDate}
                  onChange={(_: DateTimePickerEvent, date?: Date) => {
                    if (date) setBirthDate(date);
                  }}
                  style={{ alignSelf: 'flex-start', marginTop: 2 }}
                />
              ) : (
                <>
                  <Pressable
                    onPress={() => setShowBirthPicker(true)}
                    style={[styles.input, styles.dateBtn]}
                  >
                    <Text style={birthDate ? styles.dateBtnText : styles.dateBtnPlaceholder}>
                      {birthDate ? formatDateDisplay(birthDate) : 'DD/MM/AAAA'}
                    </Text>
                  </Pressable>
                  {showBirthPicker && (
                    <DateTimePicker
                      value={birthDate ?? new Date()}
                      mode="date"
                      display="default"
                      maximumDate={maxBirthDate}
                      onChange={(_: DateTimePickerEvent, date?: Date) => {
                        setShowBirthPicker(false);
                        if (date) setBirthDate(date);
                      }}
                    />
                  )}
                </>
              )}
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Género *</Text>
              <View style={styles.genderGrid}>
                {GENDER_OPTIONS.map((opt) => (
                  <Pressable
                    key={opt.value}
                    onPress={() => setGender(opt.value)}
                    style={[
                      styles.genderChip,
                      gender === opt.value && styles.genderChipActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.genderChipText,
                        gender === opt.value && styles.genderChipTextActive,
                      ]}
                    >
                      {opt.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <Text style={[styles.helper, { marginTop: 4 }]}>
              Podrás añadir tus vehículos desde tu perfil tras crear la cuenta.
            </Text>
            <Pressable
              onPress={() => setTermsAccepted(!termsAccepted)}
              style={styles.checkboxRow}
            >
              <View style={[styles.checkbox, termsAccepted && styles.checkboxChecked]}>
                {termsAccepted && <Text style={styles.checkmark}>✓</Text>}
              </View>
              <Text style={styles.checkboxLabel}>
                Acepto los{' '}
                <Text
                  style={styles.checkboxLink}
                  onPress={() => setShowPrivacy(true)}
                >
                  términos y condiciones
                </Text>
              </Text>
            </Pressable>
            <Pressable
              onPress={handleSignUp}
              disabled={signUpLoading || !termsAccepted}
              style={({ pressed }) => [
                styles.submitBtn,
                (pressed || signUpLoading || !termsAccepted) && { opacity: 0.5 },
              ]}
            >
              <Text style={styles.submitText}>
                {signUpLoading ? 'Creando cuenta…' : 'Crear cuenta'}
              </Text>
            </Pressable>
          </View>
        )}

        <Pressable
          onPress={() => router.replace('/(main)/services')}
          style={{ alignItems: 'center', paddingTop: 28, paddingBottom: 4 }}
        >
          <Text style={styles.skipText}>Continuar sin cuenta</Text>
        </Pressable>
      </ScrollView>

      <PrivacyModal visible={showPrivacy} onClose={() => setShowPrivacy(false)} />

      <Modal
        visible={showPrefixModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowPrefixModal(false)}
      >
        <Pressable
          style={styles.prefixOverlay}
          onPress={() => setShowPrefixModal(false)}
        >
          <Pressable
            style={styles.prefixModal}
            onPress={(e) => e.stopPropagation()}
          >
            <Text style={styles.prefixModalTitle}>Selecciona el país</Text>
            {COUNTRY_CODES.map((c) => (
              <Pressable
                key={c.prefix}
                onPress={() => {
                  setPhonePrefix(c.prefix);
                  setShowPrefixModal(false);
                }}
                style={[
                  styles.prefixOption,
                  phonePrefix === c.prefix && styles.prefixOptionActive,
                ]}
              >
                <Text style={styles.prefixOptionLabel}>
                  {c.flag}  {c.country}
                </Text>
                <Text style={styles.prefixOptionCode}>{c.prefix}</Text>
              </Pressable>
            ))}
          </Pressable>
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    paddingHorizontal: spacing['2xl'],
    paddingTop: 60,
    paddingBottom: spacing['4xl'],
    backgroundColor: colors.background,
  },
  header: {
    marginBottom: spacing['2xl'],
    alignItems: 'center',
  },
  title: {
    ...typography.display,
    color: colors.primary,
    marginBottom: 6,
  },
  subtitle: {
    ...typography.bodyLg,
    color: colors.onSurfaceVariant,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: spacing.lg,
    gap: spacing.md,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.outline,
  },
  dividerText: {
    ...typography.labelMd,
  },
  tabs: {
    flexDirection: 'row',
    borderRadius: radii.md,
    backgroundColor: colors.surfaceContainerHigh,
    padding: 4,
    marginBottom: spacing.xl,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: radii.sm,
    alignItems: 'center',
  },
  tabActive: {
    backgroundColor: colors.surfaceContainerLow,
    ...shadow.sm,
  },
  tabText: {
    ...typography.titleSm,
    color: colors.onSurfaceVariant,
  },
  tabTextActive: {
    color: colors.onSurface,
  },
  form: {
    gap: 14,
  },
  sectionLabel: {
    ...typography.labelSm,
    marginBottom: 4,
  },
  field: {
    gap: 6,
  },
  row: {
    flexDirection: 'row',
  },
  label: {
    ...typography.titleSm,
    color: colors.onSurfaceVariant,
  },
  input: {
    backgroundColor: colors.inputSurface,
    borderWidth: 1,
    borderColor: colors.outline,
    borderRadius: radii.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: Platform.select({ ios: 14, android: 12 }),
    ...typography.bodyLg,
  },
  phoneRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  prefixBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.inputSurface,
    borderWidth: 1,
    borderColor: colors.outline,
    borderRadius: radii.md,
    paddingHorizontal: 12,
    paddingVertical: Platform.select({ ios: 14, android: 12 }),
  },
  prefixText: {
    ...typography.titleSm,
  },
  prefixArrow: {
    fontSize: 11,
    color: colors.onSurfaceVariant,
  },
  dateBtn: {
    justifyContent: 'center',
  },
  dateBtnText: {
    ...typography.bodyLg,
  },
  dateBtnPlaceholder: {
    ...typography.bodyLg,
    color: colors.onSurfaceVariant,
  },
  genderGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  genderChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: radii.full,
    backgroundColor: colors.inputSurface,
    borderWidth: 1.5,
    borderColor: colors.outline,
  },
  genderChipActive: {
    backgroundColor: colors.secondaryContainer,
    borderColor: colors.secondary,
  },
  genderChipText: {
    ...typography.titleSm,
    color: colors.onSurface,
  },
  genderChipTextActive: {
    color: colors.onSecondaryContainer,
  },
  submitBtn: {
    backgroundColor: colors.primary,
    borderRadius: radii.md,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
    ...shadow.sm,
  },
  submitText: {
    ...typography.titleMd,
    color: colors.onPrimary,
  },
  helper: {
    ...typography.bodyMd,
    fontStyle: 'italic',
  },
  skipText: {
    ...typography.labelMd,
    color: colors.onSurfaceVariant,
  },
  prefixOverlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing['3xl'],
  },
  prefixModal: {
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: radii.xl,
    padding: spacing.xl,
    width: '100%',
    maxWidth: 340,
    ...shadow.md,
  },
  prefixModalTitle: {
    ...typography.titleLg,
    marginBottom: 14,
  },
  prefixOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 13,
  },
  prefixOptionActive: {
    backgroundColor: colors.surfaceContainerHigh,
    marginHorizontal: -8,
    paddingHorizontal: 8,
    borderRadius: radii.sm,
  },
  prefixOptionLabel: {
    ...typography.bodyLg,
  },
  prefixOptionCode: {
    ...typography.titleSm,
    color: colors.onSurfaceVariant,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: colors.outline,
    backgroundColor: colors.inputSurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  checkmark: {
    color: colors.onPrimary,
    fontSize: 14,
    fontWeight: 'bold',
  },
  checkboxLabel: {
    ...typography.bodyMd,
    color: colors.onSurface,
    flex: 1,
  },
  checkboxLink: {
    color: colors.primary,
    textDecorationLine: 'underline',
  },
});
