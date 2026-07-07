import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, radii, shadow, spacing, typography } from '@/lib/theme';

export default function RequireAuthCard() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <View style={styles.iconWrapper}>
          <Ionicons name="lock-closed" size={32} color={colors.primary} />
        </View>
        <Text style={styles.title}>Necesitas iniciar sesión</Text>
        <Text style={styles.subtitle}>
          Inicia sesión o regístrate para acceder a esta sección.
        </Text>
        <Pressable
          onPress={() => router.push('/(auth)/sign-in')}
          style={({ pressed }) => [
            styles.button,
            { opacity: pressed ? 0.8 : 1 },
          ]}
        >
          <Text style={styles.buttonText}>Iniciar sesión</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    backgroundColor: colors.background,
  },
  card: {
    width: '100%',
    padding: spacing['2xl'],
    borderRadius: radii.xl,
    backgroundColor: colors.surfaceContainerLow,
    alignItems: 'center',
    ...shadow.md,
  },
  iconWrapper: {
    width: 64,
    height: 64,
    borderRadius: radii.full,
    backgroundColor: colors.primaryContainer + '22',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  title: {
    ...typography.headlineMd,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  subtitle: {
    ...typography.bodyMd,
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  button: {
    width: '100%',
    backgroundColor: colors.primary,
    paddingVertical: 14,
    borderRadius: radii.md,
    alignItems: 'center',
    ...shadow.sm,
  },
  buttonText: {
    ...typography.titleMd,
    color: colors.onPrimary,
  },
});
