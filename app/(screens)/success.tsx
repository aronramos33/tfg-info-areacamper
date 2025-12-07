import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

export default function SuccessPage() {
  const router = useRouter();
  const { startDate, endDate, nights, total, extras } = useLocalSearchParams();

  const parsedExtras = extras ? JSON.parse(extras as string) : [];

  return (
    <View style={styles.container}>
      <Ionicons name="checkmark-circle" size={90} color="#4CAF50" />

      <Text style={styles.title}>¡Reserva completada!</Text>

      {/* --- ÚNICA CARD con toda la información --- */}
      <View style={styles.card}>
        <Text style={styles.label}>Entrada:</Text>
        <Text style={styles.value}>{startDate}</Text>

        <Text style={styles.label}>Salida:</Text>
        <Text style={styles.value}>{endDate}</Text>

        <Text style={styles.label}>Noches:</Text>
        <Text style={styles.value}>{nights}</Text>

        {/* Extras integrados dentro de la misma card */}
        {parsedExtras.length > 0 && (
          <>
            <Text style={[styles.label, { marginTop: 12 }]}>
              Extras añadidos:
            </Text>

            {parsedExtras.map((ex: any, idx: number) => (
              <Text key={idx} style={styles.extraItem}>
                • {ex.name} — {ex.nights} noche(s)
              </Text>
            ))}
          </>
        )}

        <Text style={[styles.label, { marginTop: 12 }]}>Total pagado:</Text>
        <Text style={styles.value}>{Number(total) / 100} €</Text>
      </View>

      {/* Botón QR */}
      <Pressable
        style={styles.primaryButton}
        onPress={() => router.replace('/(main)/qr')}
      >
        <Text style={styles.primaryText}>Ver mi código QR</Text>
      </Pressable>

      {/* Botón volver al calendario */}
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
