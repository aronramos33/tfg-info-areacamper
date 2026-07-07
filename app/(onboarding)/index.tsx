import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  StyleSheet,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { colors, radii, spacing, shadow, typography } from '@/lib/theme';

const { width } = Dimensions.get('window');
const ONBOARDING_KEY = '@onboarding_completed';

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

const SLIDES: { key: string; icon: IoniconsName; title: string; description: string }[] = [
  {
    key: '1',
    icon: 'leaf-outline',
    title: 'Bienvenido a\nÀrea Camper',
    description: 'Tu área de acampada favorita, ahora en tu bolsillo.',
  },
  {
    key: '2',
    icon: 'qr-code-outline',
    title: 'Accede con\ntu código QR',
    description:
      'Genera tu código de acceso personal. Se renueva automáticamente para máxima seguridad.',
  },
  {
    key: '3',
    icon: 'calendar-outline',
    title: 'Reserva y\ngestiona todo',
    description:
      'Consulta disponibilidad, realiza reservas y descubre los servicios del área.',
  },
];

export default function OnboardingScreen() {
  const router = useRouter();
  const flatListRef = useRef<FlatList>(null);
  const [currentIndex, setCurrentIndex] = useState(0);

  const handleFinish = async () => {
    await AsyncStorage.setItem(ONBOARDING_KEY, 'true');
    router.replace('/(auth)/sign-in');
  };

  const handleNext = () => {
    if (currentIndex < SLIDES.length - 1) {
      flatListRef.current?.scrollToIndex({ index: currentIndex + 1 });
      setCurrentIndex(currentIndex + 1);
    } else {
      handleFinish();
    }
  };

  const isLast = currentIndex === SLIDES.length - 1;

  return (
    <SafeAreaView style={styles.container}>
      <FlatList
        ref={flatListRef}
        data={SLIDES}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={(item) => item.key}
        onMomentumScrollEnd={(e) => {
          const idx = Math.round(e.nativeEvent.contentOffset.x / width);
          setCurrentIndex(idx);
        }}
        renderItem={({ item }) => (
          <View style={styles.slide}>
            <Ionicons name={item.icon} size={80} color={colors.primary} style={styles.icon} />
            <Text style={styles.title}>{item.title}</Text>
            <Text style={styles.description}>{item.description}</Text>
          </View>
        )}
      />

      <View style={styles.dots}>
        {SLIDES.map((_, i) => (
          <View
            key={i}
            style={[styles.dot, i === currentIndex && styles.dotActive]}
          />
        ))}
      </View>

      <View style={styles.footer}>
        <Pressable
          onPress={handleNext}
          style={({ pressed }) => [
            styles.button,
            pressed && { opacity: 0.85 },
          ]}
        >
          <Text style={styles.buttonText}>
            {isLast ? 'Empezar' : 'Siguiente'}
          </Text>
        </Pressable>

        {!isLast && (
          <Pressable onPress={handleFinish} style={styles.skipBtn}>
            <Text style={styles.skipText}>Saltar</Text>
          </Pressable>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  slide: {
    width,
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing['4xl'],
  },
  icon: {
    marginBottom: spacing['3xl'],
  },
  title: {
    ...typography.display,
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  description: {
    ...typography.bodyLg,
    color: colors.onSurfaceVariant,
    textAlign: 'center',
    lineHeight: 26,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing['2xl'],
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: radii.full,
    backgroundColor: colors.surfaceContainerHighest,
  },
  dotActive: {
    width: 24,
    backgroundColor: colors.primary,
  },
  footer: {
    paddingHorizontal: spacing['2xl'],
    paddingBottom: spacing['2xl'],
    gap: spacing.sm,
  },
  button: {
    backgroundColor: colors.primary,
    borderRadius: radii.md,
    paddingVertical: 16,
    alignItems: 'center',
    ...shadow.sm,
  },
  buttonText: {
    ...typography.titleMd,
    color: colors.onPrimary,
  },
  skipBtn: {
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  skipText: {
    ...typography.bodyMd,
    color: colors.onSurfaceVariant,
  },
});
