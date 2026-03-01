/**
 * SKYTRAC Theme System
 * Clean professional dark theme
 */

export const colors = {
  // Backgrounds
  background: {
    primary: '#000000',
    secondary: '#231f20',
    tertiary: '#253746',
    card: 'rgba(35, 31, 32, 0.9)',
    cardHover: 'rgba(37, 55, 70, 0.9)',
    glass: 'rgba(35, 31, 32, 0.7)',
    overlay: 'rgba(0, 0, 0, 0.95)',
  },

  // Primary Accents (Blue-gray)
  accent: {
    primary: '#253746',
    primaryDark: '#1a2830',
    primaryLight: '#3a5060',
    secondary: '#3a5060',
    tertiary: '#4a6070',
    glow: 'rgba(37, 55, 70, 0.4)',
    glowStrong: 'rgba(37, 55, 70, 0.7)',
  },

  // Status Colors
  status: {
    active: '#22C55E',
    activeGlow: 'rgba(34, 197, 94, 0.4)',
    warning: '#F59E0B',
    warningGlow: 'rgba(245, 158, 11, 0.4)',
    danger: '#EF4444',
    dangerGlow: 'rgba(239, 68, 68, 0.5)',
    info: '#06B6D4',
    infoGlow: 'rgba(6, 182, 212, 0.4)',
  },

  // Text
  text: {
    primary: '#ffffff',
    secondary: '#cccccc',
    muted: '#888888',
    accent: '#ffffff',
    inverse: '#000000',
  },

  // Borders
  border: {
    subtle: 'rgba(255, 255, 255, 0.1)',
    medium: 'rgba(255, 255, 255, 0.2)',
    strong: 'rgba(255, 255, 255, 0.3)',
    glow: '#253746',
  },

  // Gradients (as arrays for LinearGradient)
  gradient: {
    primary: ['#253746', '#3a5060'],
    secondary: ['#231f20', '#253746'],
    dark: ['#000000', '#231f20'],
    card: ['rgba(35, 31, 32, 0.9)', 'rgba(0, 0, 0, 0.7)'],
    button: ['#253746', '#3a5060', '#4a6070'],
    danger: ['#DC2626', '#EF4444'],
  },
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
};

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
  full: 9999,
};

export const shadows = {
  sm: {
    shadowColor: '#A855F7',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  md: {
    shadowColor: '#A855F7',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  lg: {
    shadowColor: '#A855F7',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },
  glow: {
    shadowColor: '#A855F7',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 20,
    elevation: 10,
  },
  glowDanger: {
    shadowColor: '#EF4444',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.7,
    shadowRadius: 25,
    elevation: 12,
  },
  glowActive: {
    shadowColor: '#22C55E',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 15,
    elevation: 8,
  },
};

export const typography = {
  // Font sizes
  size: {
    xs: 10,
    sm: 12,
    md: 14,
    lg: 16,
    xl: 20,
    xxl: 24,
    xxxl: 32,
    display: 48,
  },
  // Font weights
  weight: {
    regular: '400',
    medium: '500',
    semibold: '600',
    bold: '700',
  },
  // Letter spacing
  letterSpacing: {
    tight: -0.5,
    normal: 0,
    wide: 0.5,
    wider: 1,
    widest: 2,
  },
};

// Common component styles
export const componentStyles = {
  card: {
    backgroundColor: colors.background.card,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    padding: spacing.lg,
    ...shadows.md,
  },
  cardGlass: {
    backgroundColor: colors.background.glass,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border.medium,
    padding: spacing.lg,
    // Note: backdropFilter not supported in RN, use View layering
  },
  button: {
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    ...shadows.sm,
  },
  buttonPrimary: {
    backgroundColor: colors.accent.primary,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    ...shadows.glow,
  },
  input: {
    backgroundColor: colors.background.tertiary,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    color: colors.text.primary,
  },
  badge: {
    backgroundColor: colors.accent.primary,
    borderRadius: radius.full,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
};

// Animation durations
export const animation = {
  fast: 150,
  normal: 250,
  slow: 400,
};

export default {
  colors,
  spacing,
  radius,
  shadows,
  typography,
  componentStyles,
  animation,
};
