// components/RequireAuthCard.tsx
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Link } from 'expo-router';

export default function RequireAuthCard() {
  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>Necesitas iniciar sesión</Text>
        <Text style={styles.subtitle}>
          Inicia sesión o regístrate para acceder a esta sección.
        </Text>

        <Link href="/(auth)/options" asChild>
          <TouchableOpacity style={styles.button}>
            <Text style={styles.buttonText}>Ir a iniciar sesión</Text>
          </TouchableOpacity>
        </Link>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  card: {
    width: '100%',
    padding: 20,
    borderRadius: 12,
    backgroundColor: 'white',
    elevation: 5,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 12,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 20,
    color: '#555',
  },
  button: {
    backgroundColor: '#007AFF',
    paddingVertical: 12,
    borderRadius: 8,
  },
  buttonText: {
    textAlign: 'center',
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
