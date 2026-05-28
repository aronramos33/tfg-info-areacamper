import React from 'react';
import {
  Alert,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

const PHONE = '651496228';
const EMAIL = 'aronramos33@gmail.com';

function ContactRow({
  icon,
  label,
  value,
  onPress,
}: {
  icon: string;
  label: string;
  value: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: '#f0f0f0' }]}
      onPress={onPress}
    >
      <View style={styles.rowLeft}>
        <Text style={styles.rowIcon}>{icon}</Text>
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

  const handlePhone = () => {
    Linking.openURL(`tel:${PHONE}`).catch(() =>
      Alert.alert('Error', 'No se pudo abrir la app de teléfono.'),
    );
  };

  const handleEmail = () => {
    Linking.openURL(
      `mailto:${EMAIL}?subject=${encodeURIComponent('Consulta - Área Camper Marchuquera')}`,
    ).catch(() => Alert.alert('Error', 'No se pudo abrir el correo.'));
  };

  const handleWhatsApp = () => {
    const text = encodeURIComponent('Hola, necesito ayuda con mi reserva en el Área Camper Marchuquera.');
    Linking.openURL(`https://wa.me/34${PHONE}?text=${text}`).catch(() =>
      Alert.alert('Error', 'No se pudo abrir WhatsApp.'),
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

      <View style={styles.container}>
        <Text style={styles.intro}>
          Estamos aquí para ayudarte. Puedes contactar con nosotros por teléfono o email
          en horario de 9:00 a 21:00 h.
        </Text>

        <View style={styles.card}>
          <ContactRow
            icon="📞"
            label="Teléfono"
            value={PHONE}
            onPress={handlePhone}
          />
          <View style={styles.divider} />
          <ContactRow
            icon="✉️"
            label="Email"
            value={EMAIL}
            onPress={handleEmail}
          />
        </View>

        <Text style={styles.sectionLabel}>FUERA DE HORARIO</Text>
        <View style={styles.card}>
          <ContactRow
            icon="💬"
            label="WhatsApp"
            value={PHONE}
            onPress={handleWhatsApp}
          />
        </View>
        <Text style={styles.note}>
          Si estás fuera del horario de atención, puedes enviarnos un mensaje de WhatsApp
          y te responderemos lo antes posible.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f2f2f7' },

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
  headerBack: { color: '#007AFF', fontSize: 16 },
  headerTitle: { fontSize: 17, fontWeight: '600', color: '#111' },

  container: { padding: 16, gap: 12 },

  intro: {
    fontSize: 15,
    color: '#555',
    lineHeight: 22,
    marginBottom: 4,
  },

  card: {
    backgroundColor: '#fff',
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
  rowLeft: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  rowIcon: { fontSize: 20, width: 28, textAlign: 'center' },
  rowLabel: { fontSize: 12, color: '#888', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4 },
  rowValue: { fontSize: 16, color: '#007AFF', fontWeight: '500', marginTop: 2 },
  rowChevron: {
    fontSize: 18,
    color: '#c7c7cc',
    fontWeight: '600',
    ...Platform.select({ android: { lineHeight: 22 } }),
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#e0e0e0',
    marginLeft: 58,
  },

  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#8e8e93',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginTop: 4,
    marginLeft: 4,
  },
  note: {
    fontSize: 13,
    color: '#aaa',
    lineHeight: 19,
    marginTop: 2,
  },
});
