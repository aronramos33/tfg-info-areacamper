import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

type ExtraSummary = {
  code?: 'PET' | 'POWER' | 'PERSON' | string;
  name: string;
  units?: number; // ahora llega como units desde checkout
};

export default function SuccessPage() {
  const router = useRouter();
  const { startDate, endDate, nights, total, extras } = useLocalSearchParams<{
    startDate?: string;
    endDate?: string;
    nights?: string;
    total?: string;
    extras?: string;
  }>();

  const parsedExtras: ExtraSummary[] = extras ? JSON.parse(extras) : [];

  const formatExtraLine = (ex: ExtraSummary) => {
    const units = Number(ex.units ?? 0);

    // Electricidad: Sí/No
    if (ex.code === 'POWER') {
      return `• ${ex.name} — ${units === 1 ? 'Sí' : 'No'}`;
    }

    // Mascota y Acompañante: unidades + noches
    const label =
      ex.code === 'PET'
        ? units === 1
          ? 'mascota'
          : 'mascotas'
        : ex.code === 'PERSON'
          ? units === 1
            ? 'acompañante'
            : 'acompañantes'
          : units === 1
            ? 'unidad'
            : 'unidades';

    // Si units es 0, no mostramos (aunque normalmente no llega)
    if (units <= 0) return null;

    return `• ${ex.name} — ${units} ${label}`;
  };

  return (
    <View style={styles.container}>
      <Ionicons name="checkmark-circle" size={90} color="#4CAF50" />

      <Text style={styles.title}>¡Reserva completada!</Text>

      <View style={styles.card}>
        <Text style={styles.label}>Entrada:</Text>
        <Text style={styles.value}>{startDate}</Text>

        <Text style={styles.label}>Salida:</Text>
        <Text style={styles.value}>{endDate}</Text>

        <Text style={styles.label}>Noches:</Text>
        <Text style={styles.value}>{nights}</Text>

        {parsedExtras.length > 0 && (
          <>
            <Text style={[styles.label, { marginTop: 12 }]}>
              Extras añadidos:
            </Text>

            {parsedExtras
              .map(formatExtraLine)
              .filter(Boolean)
              .map((line, idx) => (
                <Text key={idx} style={styles.extraItem}>
                  {line}
                </Text>
              ))}
          </>
        )}

        <Text style={[styles.label, { marginTop: 12 }]}>Total pagado:</Text>
        <Text style={styles.value}>
          {(Number(total ?? 0) / 100).toFixed(2)} €
        </Text>
      </View>

      <Pressable
        style={styles.primaryButton}
        onPress={() => router.replace('/(main)/qr')}
      >
        <Text style={styles.primaryText}>Ver mi código QR</Text>
      </Pressable>

      <Pressable
        style={styles.secondaryButton}
        onPress={() => router.replace('/(main)/reservations')}
      >
        <Text style={styles.secondaryText}>Volver a Reservas</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    gap: 24,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    textAlign: 'center',
  },
  card: {
    width: '100%',
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 16,
    elevation: 3,
    gap: 6,
  },
  label: {
    fontSize: 14,
    color: '#666',
  },
  value: {
    fontSize: 16,
    fontWeight: '600',
  },
  extraItem: {
    fontSize: 15,
    color: '#333',
    marginLeft: 6,
  },
  primaryButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 14,
    width: '100%',
    borderRadius: 12,
    alignItems: 'center',
  },
  primaryText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {
    paddingVertical: 12,
    width: '100%',
    borderRadius: 12,
    alignItems: 'center',
  },
  secondaryText: {
    color: '#007AFF',
    fontSize: 16,
    fontWeight: '600',
  },
});
