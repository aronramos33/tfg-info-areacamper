import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { AppAlert } from '@/components/AppAlert';
import { colors, radii, shadow, spacing, typography } from '@/lib/theme';

type ContactData = { phone: string; email: string; whatsapp: string };

function ContactRow({
  icon,
  label,
  value,
  onPress,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surfaceContainerHigh }]}
      onPress={onPress}
    >
      <View style={styles.rowLeft}>
        <View style={styles.rowIcon}>{icon}</View>
        <View>
          <Text style={styles.rowLabel}>{label}</Text>
          <Text style={styles.rowValue}>{value}</Text>
        </View>
      </View>
      <Text style={styles.rowChevron}>›</Text>
    </Pressable>
  );
}

export default function ProfileContact() {
  const router = useRouter();
  const [data, setData] = useState<ContactData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      const { data: row } = await supabase
        .from('cms_pages')
        .select('content')
        .eq('id', 'contact')
        .maybeSingle();
      if (row) setData(row.content as ContactData);
      setLoading(false);
    })();
  }, []);

  const phone = data?.phone ?? '';
  const email = data?.email ?? '';
  const whatsapp = data?.whatsapp ?? phone;

  const handlePhone = () => {
    Linking.openURL(`tel:${phone}`).catch(() =>
      AppAlert.alert('Error', 'No se pudo abrir la app de teléfono.'),
    );
  };

  const handleEmail = () => {
    Linking.openURL(
      `mailto:${email}?subject=${encodeURIComponent('Consulta - Área Camper Marchuquera')}`,
    ).catch(() => AppAlert.alert('Error', 'No se pudo abrir el correo.'));
  };

  const handleWhatsApp = () => {
    const text = encodeURIComponent('Hola, necesito ayuda con mi reserva en el Área Camper Marchuquera.');
    Linking.openURL(`https://wa.me/34${whatsapp}?text=${text}`).catch(() =>
      AppAlert.alert('Error', 'No se pudo abrir WhatsApp.'),
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8} style={styles.headerSide}>
          <Text style={styles.headerBack}>‹ Atrás</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Contacto</Text>
        <View style={styles.headerSide} />
      </View>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <View style={styles.container}>
          <Text style={styles.intro}>
            Estamos aquí para ayudarte. Puedes contactar con nosotros por teléfono o email
            en horario de 9:00 a 21:00 h.
          </Text>

          <View style={styles.card}>
            <ContactRow icon={<Ionicons name="call-outline" size={20} color={colors.secondary} />} label="Teléfono" value={phone} onPress={handlePhone} />
            <View style={styles.divider} />
            <ContactRow icon={<Ionicons name="mail-outline" size={20} color={colors.secondary} />} label="Email" value={email} onPress={handleEmail} />
          </View>

          <Text style={styles.sectionLabel}>FUERA DE HORARIO</Text>
          <View style={styles.card}>
            <ContactRow icon={<Ionicons name="chatbubble-ellipses-outline" size={20} color={colors.secondary} />} label="WhatsApp" value={whatsapp} onPress={handleWhatsApp} />
          </View>
          <Text style={styles.note}>
            Si estás fuera del horario de atención, puedes enviarnos un mensaje de WhatsApp
            y te responderemos lo antes posible.
          </Text>
        </View>
      )}
    </SafeAreaView>
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
    backgroundColor: colors.background,
  },
  headerSide: { width: 70 },
  headerBack: { ...typography.titleMd, color: colors.secondary },
  headerTitle: { ...typography.titleLg },

  loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  container: { padding: spacing.lg, gap: 12 },

  intro: { ...typography.bodyLg, lineHeight: 22, marginBottom: 4 },

  card: {
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: radii.lg,
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
  rowLeft: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  rowIcon: { width: 28, alignItems: 'center' as const },
  rowLabel: { ...typography.labelSm, lineHeight: 16, marginBottom: 2 },
  rowValue: { ...typography.titleSm, color: colors.secondary, lineHeight: 18, marginTop: 2 },
  rowChevron: {
    fontSize: 18,
    color: colors.onSurfaceVariant,
    fontFamily: 'PlusJakartaSans_700Bold',
    ...Platform.select({ android: { lineHeight: 22 } }),
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.outlineVariant,
    marginLeft: 58,
  },

  sectionLabel: { ...typography.labelSm, marginTop: 4, marginLeft: 4 },
  note: { ...typography.bodyMd, lineHeight: 19, marginTop: 2 },
});
