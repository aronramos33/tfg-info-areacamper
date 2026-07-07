import { View, StyleSheet } from 'react-native';
import { colors, radii, spacing } from '@/lib/theme';

type Props = {
  current: number; // 1-based
  total?: number;
};

export default function StepProgress({ current, total = 5 }: Props) {
  return (
    <View style={styles.row}>
      {Array.from({ length: total }, (_, i) => (
        <View
          key={i}
          style={[styles.segment, i < current ? styles.filled : styles.empty]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: spacing['2xl'],
    paddingTop: spacing.md,
    paddingBottom: spacing.xs,
  },
  segment: {
    flex: 1,
    height: 4,
    borderRadius: radii.full,
  },
  filled: { backgroundColor: colors.onSurface },
  empty: { backgroundColor: colors.surfaceContainerHighest },
});
