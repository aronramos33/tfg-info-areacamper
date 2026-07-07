export const colors = {
  background: '#fff8f3',
  surfaceContainerLow: '#fff2e2',
  surfaceContainerHigh: '#fbe5c7',
  surfaceContainerHighest: '#f5dfc2',

  primary: '#22521f',
  primaryContainer: '#3a6b35',
  onPrimary: '#ffffff',
  onPrimaryContainer: '#052003',

  secondary: '#805600',
  secondaryContainer: '#ffdea8',
  onSecondary: '#ffffff',
  onSecondaryContainer: '#291800',

  onSurface: '#241a08',
  onSurfaceVariant: '#42493f',
  outline: 'rgba(36, 26, 8, 0.15)',
  outlineVariant: 'rgba(36, 26, 8, 0.06)',

  confirmedBg: '#D4EDDA',
  confirmedText: '#1a5c2a',
  checkedInBg: '#FFF3CD',
  checkedInText: '#856404',
  cancelledBg: '#fdecea',
  cancelledText: '#7f1d1d',
  pendingBg: '#fff3e0',
  pendingText: '#7a4800',
  modifiedBg: '#f0f4ff',
  modifiedText: '#2c3e82',

  error: '#ba1a1a',
  onError: '#ffffff',
  errorContainer: '#ffdad6',
  onErrorContainer: '#410002',
  warning: '#FF9500',
  warningContainer: '#fff4e5',
  warningText: '#7a4f00',

  overlay: 'rgba(36, 26, 8, 0.45)',

  inputSurface: '#ffffff',
} as const;

export const radii = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 999,
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  '3xl': 32,
  '4xl': 48,
} as const;

export const shadow = {
  sm: {
    shadowColor: '#241a08',
    shadowOpacity: 0.06 as number,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  md: {
    shadowColor: '#241a08',
    shadowOpacity: 0.08 as number,
    shadowRadius: 32,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
} as const;

export const typography = {
  display: {
    fontFamily: 'PlusJakartaSans_800ExtraBold',
    fontSize: 32,
    letterSpacing: -0.64,
    color: colors.onSurface,
  },
  headlineLg: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 26,
    letterSpacing: -0.52,
    color: colors.onSurface,
  },
  headlineMd: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 22,
    letterSpacing: -0.44,
    color: colors.onSurface,
  },
  titleLg: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 18,
    color: colors.onSurface,
  },
  titleMd: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 16,
    color: colors.onSurface,
  },
  titleSm: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 14,
    color: colors.onSurface,
  },
  bodyLg: {
    fontFamily: 'PlusJakartaSans_400Regular',
    fontSize: 16,
    color: colors.onSurface,
  },
  bodyMd: {
    fontFamily: 'PlusJakartaSans_400Regular',
    fontSize: 14,
    color: colors.onSurfaceVariant,
  },
  labelLg: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    color: colors.onSurface,
  },
  labelMd: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
    letterSpacing: 0.5,
    color: colors.onSurfaceVariant,
  },
  labelSm: {
    fontFamily: 'Inter_700Bold',
    fontSize: 11,
    letterSpacing: 1,
    textTransform: 'uppercase' as const,
    color: colors.onSurfaceVariant,
  },
} as const;
