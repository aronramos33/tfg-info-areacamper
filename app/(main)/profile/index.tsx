import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter, useSegments } from 'expo-router';
import Constants from 'expo-constants';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/providers/AuthProvider';
import RequireAuthCard from '@/components/RequireAuthCard';
import { supabase } from '@/lib/supabase';
import { formatCents } from '@/components/utils/money';
import { pickAndUploadAvatar, deleteAvatar } from '@/lib/uploadAvatar';
import { colors, radii, shadow, spacing, typography } from '@/lib/theme';
import { AppAlert } from '@/components/AppAlert';

async function fetchVehicleCount(userId: string): Promise<number> {
  const { count, error } = await supabase
    .from('vehicles')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId);
  if (error) return 0;
  return count ?? 0;
}

async function fetchProfileData(userId: string): Promise<{ complete: boolean; avatarUrl: string | null }> {
  const { data } = await supabase
    .from('user_profiles')
    .select('first_name, last_name, phone, dni, avatar_url')
    .eq('user_id', userId)
    .maybeSingle();
  return {
    complete: Boolean(data?.first_name && data?.last_name && data?.phone && data?.dni),
    avatarUrl: (data?.avatar_url as string | null) ?? null,
  };
}

async function fetchNightlyPrice(): Promise<number | null> {
  const { data } = await supabase
    .from('pricing')
    .select('nightly_amount_cents')
    .eq('active', true)
    .maybeSingle();
  return data?.nightly_amount_cents ?? null;
}

async function fetchExtrasCount(): Promise<number> {
  const { count } = await supabase
    .from('extras')
    .select('id', { count: 'exact', head: true })
    .eq('is_active', true);
  return count ?? 0;
}

type SettingsRowProps = {
  icon: React.ReactNode;
  label: string;
  value?: string;
  valueWarning?: boolean;
  onPress?: () => void;
  showChevron?: boolean;
  destructive?: boolean;
};

function SettingsRow({
  icon,
  label,
  value,
  valueWarning = false,
  onPress,
  showChevron = true,
  destructive = false,
}: SettingsRowProps) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.row,
        pressed && onPress && { backgroundColor: colors.surfaceContainerHigh },
      ]}
      onPress={onPress}
      disabled={!onPress}
    >
      <View style={styles.rowLeft}>
        <View style={styles.rowIcon}>{icon}</View>
        <Text style={[styles.rowLabel, destructive && styles.destructiveLabel]}>
          {label}
        </Text>
      </View>
      <View style={styles.rowRight}>
        {value ? (
          <Text style={[styles.rowValue, valueWarning && styles.rowValueWarning]}>
            {value}
          </Text>
        ) : null}
        {showChevron && onPress ? (
          <Text style={styles.rowChevron}>›</Text>
        ) : null}
      </View>
    </Pressable>
  );
}

function SectionLabel({ label }: { label: string }) {
  return <Text style={styles.sectionLabel}>{label}</Text>;
}

function SectionGroup({ children, style }: { children: React.ReactNode; style?: object }) {
  return <View style={[styles.sectionGroup, style]}>{children}</View>;
}

export default function ProfileIndex() {
  const { session, signOut, isOwner } = useAuth();
  const router = useRouter();
  const segments = useSegments();

  const [vehicleCount, setVehicleCount] = useState<number | null>(null);
  const [profileComplete, setProfileComplete] = useState<boolean | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [loadingMeta, setLoadingMeta] = useState(true);
  const [nightlyCents, setNightlyCents] = useState<number | null>(null);
  const [extrasCount, setExtrasCount] = useState<number | null>(null);

  const user = session?.user;
  const isAdmin = (segments as string[]).includes('admin');
  const profileBase = isAdmin ? '/admin/profile' : '/(main)/profile';

  const displayName = useMemo(() => {
    const full = user?.user_metadata?.full_name as string | undefined;
    if (full?.trim()) return full.trim();
    return user?.email?.split('@')[0] ?? '—';
  }, [user]);

  const initials = useMemo(() => {
    const parts = displayName.split(' ').filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return '?';
  }, [displayName]);

  const isEmailProvider = useMemo(() => {
    const p1 = user?.app_metadata?.provider as string | undefined;
    const p2 = Array.isArray(user?.app_metadata?.providers)
      ? (user?.app_metadata?.providers?.[0] as string | undefined)
      : undefined;
    return (p1 ?? p2 ?? 'unknown') === 'email';
  }, [user?.app_metadata]);

  useEffect(() => {
    if (!user?.id) return;
    void (async () => {
      setLoadingMeta(true);
      try {
        const [count, profileData, adminData] = await Promise.all([
          fetchVehicleCount(user.id),
          fetchProfileData(user.id),
          isAdmin
            ? Promise.all([fetchNightlyPrice(), fetchExtrasCount()])
            : Promise.resolve([null, null] as [null, null]),
        ]);
        setVehicleCount(count);
        setProfileComplete(profileData.complete);
        setAvatarUrl(profileData.avatarUrl);
        if (isAdmin) {
          setNightlyCents(adminData[0]);
          setExtrasCount(adminData[1] as number);
        }
      } finally {
        setLoadingMeta(false);
      }
    })();
  }, [user?.id, isAdmin]);

  useFocusEffect(
    React.useCallback(() => {
      if (!user?.id) return;
      const refreshes: Promise<unknown>[] = [
        fetchVehicleCount(user.id).then(setVehicleCount),
        fetchProfileData(user.id).then((d) => {
          setProfileComplete(d.complete);
          setAvatarUrl(d.avatarUrl);
        }),
      ];
      if (isAdmin) {
        refreshes.push(fetchNightlyPrice().then((v) => v != null && setNightlyCents(v)));
        refreshes.push(fetchExtrasCount().then(setExtrasCount));
      }
      void Promise.all(refreshes);
    }, [user?.id, isAdmin]),
  );

  const doPickAvatar = async () => {
    if (!user?.id) return;
    setUploadingAvatar(true);
    try {
      const url = await pickAndUploadAvatar(user.id);
      if (url) setAvatarUrl(url);
    } catch (e: any) {
      AppAlert.alert('Error', e?.message ?? 'No se pudo subir la foto.');
    } finally {
      setUploadingAvatar(false);
    }
  };

  const doDeleteAvatar = async () => {
    if (!user?.id) return;
    setUploadingAvatar(true);
    try {
      await deleteAvatar(user.id);
      setAvatarUrl(null);
    } catch (e: any) {
      AppAlert.alert('Error', e?.message ?? 'No se pudo eliminar la foto.');
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleChangeAvatar = () => {
    if (!user?.id) return;
    if (avatarUrl) {
      AppAlert.alert('Foto de perfil', '¿Qué quieres hacer?', [
        { text: 'Cambiar foto', onPress: doPickAvatar },
        { text: 'Eliminar foto', style: 'destructive', onPress: doDeleteAvatar },
        { text: 'Cancelar', style: 'cancel' },
      ]);
    } else {
      void doPickAvatar();
    }
  };

  const handleSignOut = () => {
    AppAlert.alert('Cerrar sesión', '¿Estás seguro?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Cerrar sesión', onPress: signOut, style: 'destructive' },
    ]);
  };

  const handleDeleteAccount = () => {
    AppAlert.alert(
      'Eliminar cuenta',
      'Se borrarán permanentemente tu perfil, vehículos y datos personales.\n\nLos registros de reservas y pagos se conservarán de forma anónima por obligación legal (GDPR art. 17 + normativa fiscal española).\n\nEsta acción no se puede deshacer.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar mi cuenta',
          style: 'destructive',
          onPress: () => {
            AppAlert.alert(
              '¿Seguro?',
              'Confirma que quieres eliminar tu cuenta de forma permanente.',
              [
                { text: 'No, conservar cuenta', style: 'cancel' },
                {
                  text: 'Sí, eliminar',
                  style: 'destructive',
                  onPress: async () => {
                    try {
                      const { error } = await supabase.functions.invoke('delete-account');
                      if (error) throw error;
                      await signOut();
                    } catch (e: any) {
                      AppAlert.alert('Error', e?.message ?? 'No se pudo eliminar la cuenta. Inténtalo de nuevo.');
                    }
                  },
                },
              ],
            );
          },
        },
      ],
    );
  };

  const vehicleSubtitle =
    vehicleCount === null
      ? '—'
      : vehicleCount === 0
        ? 'Ninguno añadido'
        : `${vehicleCount} ${vehicleCount === 1 ? 'guardado' : 'guardados'}`;

  if (!session) return <RequireAuthCard />;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.container}>

        <View style={styles.profileHeader}>
          <Pressable onPress={handleChangeAvatar} disabled={uploadingAvatar} style={styles.avatarWrapper}>
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
            ) : (
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{initials}</Text>
              </View>
            )}
            <View style={styles.avatarBadge}>
              {uploadingAvatar
                ? <ActivityIndicator size="small" color={colors.onPrimary} />
                : <Ionicons name="camera" size={12} color={colors.onPrimary} />
              }
            </View>
          </Pressable>
          <View style={styles.profileInfo}>
            <Text style={styles.profileName}>{displayName}</Text>
            <Text style={styles.profileEmail}>{user?.email ?? '—'}</Text>
            {isOwner && <Text style={styles.ownerBadge}>Propietario ✓</Text>}
          </View>
        </View>

        <SectionLabel label="CUENTA" />
        <SectionGroup>
          <SettingsRow
            icon={<Ionicons name="person-outline" size={18} color={colors.onSurfaceVariant} />}
            label="Datos personales"
            value={
              loadingMeta || profileComplete === null
                ? '…'
                : profileComplete
                  ? undefined
                  : 'Incompleto'
            }
            valueWarning={!loadingMeta && profileComplete === false}
            onPress={() => router.push(`${profileBase}/edit` as any)}
          />
          {!isAdmin && (
            <SettingsRow
              icon={<Ionicons name="car-outline" size={18} color={colors.onSurfaceVariant} />}
              label="Mis vehículos"
              value={loadingMeta ? '…' : vehicleSubtitle}
              onPress={() => router.push(`${profileBase}/vehicles` as any)}
            />
          )}
        </SectionGroup>

        {isAdmin && (
          <>
            <SectionLabel label="MI ÁREA" />
            <SectionGroup>
              <SettingsRow
                icon={<Ionicons name="pricetag-outline" size={18} color={colors.onSurfaceVariant} />}
                label="Precio por noche"
                value={
                  loadingMeta
                    ? '…'
                    : nightlyCents != null
                      ? formatCents(nightlyCents)
                      : '—'
                }
                onPress={() => router.push(`${profileBase}/pricing` as any)}
              />
              <SettingsRow
                icon={<Ionicons name="flash-outline" size={18} color={colors.onSurfaceVariant} />}
                label="Extras"
                value={
                  loadingMeta
                    ? '…'
                    : extrasCount != null
                      ? `${extrasCount} activo${extrasCount !== 1 ? 's' : ''}`
                      : '—'
                }
                onPress={() => router.push(`${profileBase}/extras` as any)}
              />
              <SettingsRow
                icon={<Ionicons name="document-text-outline" size={18} color={colors.onSurfaceVariant} />}
                label="Política y privacidad"
                onPress={() => router.push(`${profileBase}/cms-privacy` as any)}
              />
              <SettingsRow
                icon={<Ionicons name="chatbubble-ellipses-outline" size={18} color={colors.onSurfaceVariant} />}
                label="Preguntas frecuentes"
                onPress={() => router.push(`${profileBase}/cms-faq` as any)}
              />
              <SettingsRow
                icon={<Ionicons name="call-outline" size={18} color={colors.onSurfaceVariant} />}
                label="Contáctanos"
                onPress={() => router.push(`${profileBase}/cms-contact` as any)}
              />
            </SectionGroup>
          </>
        )}

        {isEmailProvider && (
          <>
            <SectionLabel label="SEGURIDAD" />
            <SectionGroup>
              <SettingsRow
                icon={<Ionicons name="lock-closed-outline" size={18} color={colors.onSurfaceVariant} />}
                label="Contraseña"
                onPress={() => router.push(`${profileBase}/password` as any)}
              />
            </SectionGroup>
          </>
        )}

        {!isAdmin && (
          <>
            <SectionLabel label="APLICACIÓN" />
            <SectionGroup>
              <SettingsRow
                icon={<Ionicons name="document-text-outline" size={18} color={colors.onSurfaceVariant} />}
                label="Política y privacidad"
                onPress={() => router.push(`${profileBase}/privacy` as any)}
              />
              <SettingsRow
                icon={<Ionicons name="chatbubble-ellipses-outline" size={18} color={colors.onSurfaceVariant} />}
                label="Preguntas frecuentes"
                onPress={() => router.push(`${profileBase}/faq` as any)}
              />
              <SettingsRow
                icon={<Ionicons name="call-outline" size={18} color={colors.onSurfaceVariant} />}
                label="Contáctanos"
                onPress={() => router.push(`${profileBase}/contact` as any)}
              />
            </SectionGroup>
          </>
        )}

        <SectionGroup style={{ marginTop: 32 }}>
          <SettingsRow
            icon={<Ionicons name="log-out-outline" size={18} color={colors.error} />}
            label="Cerrar sesión"
            onPress={handleSignOut}
            showChevron={false}
            destructive
          />
        </SectionGroup>

        <Text style={styles.version}>
          Versión {Constants.expoConfig?.version ?? '—'}
        </Text>

        <Pressable onPress={handleDeleteAccount} style={styles.deleteAccountLink}>
          <Text style={styles.deleteAccountText}>Eliminar cuenta</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  container: { paddingBottom: 48 },

  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceContainerLow,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing['2xl'],
    gap: 16,
    ...shadow.sm,
  },
  avatarWrapper: { width: 64, height: 64 },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: radii.full,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImage: { width: 64, height: 64, borderRadius: radii.full },
  avatarBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 22,
    height: 22,
    borderRadius: radii.full,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.background,
  },
  avatarText: { ...typography.headlineMd, color: colors.onPrimary, fontSize: 24 },
  profileInfo: { flex: 1, gap: 2 },
  profileName: { ...typography.titleLg },
  profileEmail: { ...typography.bodyMd },
  ownerBadge: { ...typography.titleSm, color: colors.confirmedText, marginTop: 4 },

  sectionLabel: {
    ...typography.labelSm,
    marginTop: 24,
    marginBottom: 6,
    marginHorizontal: spacing.xl,
  },
  sectionGroup: {
    backgroundColor: colors.surfaceContainerLow,
    marginHorizontal: spacing.lg,
    borderRadius: radii.md,
    overflow: 'hidden',
    ...shadow.sm,
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: 14,
  },
  rowLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  rowIcon: { width: 26, alignItems: 'center' as const },
  rowLabel: { ...typography.titleSm, lineHeight: 18 },
  destructiveLabel: { color: colors.error },
  rowRight: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  rowValue: { ...typography.labelMd },
  rowValueWarning: { color: colors.warning, fontFamily: 'Inter_600SemiBold' },
  rowChevron: {
    fontSize: 18,
    color: colors.outline,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    ...Platform.select({ android: { lineHeight: 22 } }),
  },

  version: {
    textAlign: 'center',
    ...typography.labelMd,
    marginTop: 28,
  },
  deleteAccountLink: {
    alignItems: 'center',
    paddingVertical: 10,
    marginTop: 4,
  },
  deleteAccountText: {
    ...typography.labelMd,
    textDecorationLine: 'underline',
  },
});
