import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { useAuth } from '@/providers/AuthProvider';
import RequireAuthCard from '@/components/RequireAuthCard';
import { supabase } from '@/lib/supabase';
import { formatCents } from '@/components/utils/money';
import { pickAndUploadAvatar, deleteAvatar } from '@/lib/uploadAvatar';

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

// ── SettingsRow ──────────────────────────────────────────────────────────────

type SettingsRowProps = {
  icon: string;
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
        pressed && onPress && { backgroundColor: '#f0f0f0' },
      ]}
      onPress={onPress}
      disabled={!onPress}
    >
      <View style={styles.rowLeft}>
        <Text style={styles.rowIcon}>{icon}</Text>
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

function SectionGroup({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: object;
}) {
  return <View style={[styles.sectionGroup, style]}>{children}</View>;
}

function RowDivider() {
  return <View style={styles.rowDivider} />;
}

// ── Screen ───────────────────────────────────────────────────────────────────

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
      Alert.alert('Error', e?.message ?? 'No se pudo subir la foto.');
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
      Alert.alert('Error', e?.message ?? 'No se pudo eliminar la foto.');
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleChangeAvatar = () => {
    if (!user?.id) return;
    if (avatarUrl) {
      Alert.alert('Foto de perfil', '¿Qué quieres hacer?', [
        { text: 'Cambiar foto', onPress: doPickAvatar },
        { text: 'Eliminar foto', style: 'destructive', onPress: doDeleteAvatar },
        { text: 'Cancelar', style: 'cancel' },
      ]);
    } else {
      void doPickAvatar();
    }
  };

  const handleSignOut = () => {
    Alert.alert('Cerrar sesión', '¿Estás seguro?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Cerrar sesión', onPress: signOut, style: 'destructive' },
    ]);
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

        {/* ── Cabecera de perfil ── */}
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
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={styles.avatarBadgeIcon}>📷</Text>
              }
            </View>
          </Pressable>
          <View style={styles.profileInfo}>
            <Text style={styles.profileName}>{displayName}</Text>
            <Text style={styles.profileEmail}>{user?.email ?? '—'}</Text>
            {isOwner && <Text style={styles.ownerBadge}>Propietario ✓</Text>}
          </View>
        </View>

        {/* ── CUENTA ── */}
        <SectionLabel label="CUENTA" />
        <SectionGroup>
          <SettingsRow
            icon="👤"
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
            <>
              <RowDivider />
              <SettingsRow
                icon="🚗"
                label="Mis vehículos"
                value={loadingMeta ? '…' : vehicleSubtitle}
                onPress={() => router.push(`${profileBase}/vehicles` as any)}
              />
            </>
          )}
        </SectionGroup>

        {/* ── MI ÁREA (solo admin) ── */}
        {isAdmin && (
          <>
            <SectionLabel label="MI ÁREA" />
            <SectionGroup>
              <SettingsRow
                icon="💶"
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
              <RowDivider />
              <SettingsRow
                icon="⚡"
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
            </SectionGroup>
          </>
        )}

        {/* ── SEGURIDAD ── */}
        {isEmailProvider && (
          <>
            <SectionLabel label="SEGURIDAD" />
            <SectionGroup>
              <SettingsRow
                icon="🔒"
                label="Contraseña"
                onPress={() => router.push(`${profileBase}/password` as any)}
              />
            </SectionGroup>
          </>
        )}

        {/* ── APLICACIÓN ── */}
        <SectionLabel label="APLICACIÓN" />
        <SectionGroup>
          <SettingsRow
            icon="📄"
            label="Política y privacidad"
            onPress={() => router.push(`${profileBase}/privacy` as any)}
          />
          <RowDivider />
          <SettingsRow
            icon="💬"
            label="¿Necesitas ayuda?"
            onPress={() => router.push(`${profileBase}/contact` as any)}
          />
        </SectionGroup>

        {/* ── Cerrar sesión ── */}
        <SectionGroup style={{ marginTop: 32 }}>
          <SettingsRow
            icon="🚪"
            label="Cerrar sesión"
            onPress={handleSignOut}
            showChevron={false}
            destructive
          />
        </SectionGroup>

        {/* ── Versión ── */}
        <Text style={styles.version}>
          Versión {Constants.expoConfig?.version ?? '—'}
        </Text>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f2f2f7' },
  container: { paddingBottom: 48 },

  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 20,
    paddingVertical: 24,
    gap: 16,
  },
  avatarWrapper: {
    width: 64,
    height: 64,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#007AFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImage: {
    width: 64,
    height: 64,
    borderRadius: 32,
  },
  avatarBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#007AFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  avatarBadgeIcon: { fontSize: 10 },
  avatarText: { color: '#fff', fontSize: 24, fontWeight: '700' },
  profileInfo: { flex: 1, gap: 2 },
  profileName: { fontSize: 20, fontWeight: '700', color: '#111' },
  profileEmail: { fontSize: 14, color: '#888' },
  ownerBadge: { fontSize: 13, color: '#34C759', fontWeight: '600', marginTop: 4 },

  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#8e8e93',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginTop: 24,
    marginBottom: 6,
    marginHorizontal: 20,
  },
  sectionGroup: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    borderRadius: 12,
    overflow: 'hidden',
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  rowLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  rowIcon: { fontSize: 18, width: 26, textAlign: 'center' },
  rowLabel: { fontSize: 16, color: '#111' },
  destructiveLabel: { color: '#1a3a6e' },
  rowRight: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  rowValue: { fontSize: 15, color: '#8e8e93' },
  rowValueWarning: { color: '#FF9500', fontWeight: '600' },
  rowChevron: {
    fontSize: 18,
    color: '#c7c7cc',
    fontWeight: '600',
    ...Platform.select({ android: { lineHeight: 22 } }),
  },
  rowDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#e0e0e0',
    marginLeft: 54,
  },

  version: {
    textAlign: 'center',
    fontSize: 13,
    color: '#c7c7cc',
    marginTop: 28,
  },
});
