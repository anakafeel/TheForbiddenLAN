/**
 * SKYTRAC Theme System
 * Dynamic dark/light theme
 */
import { useMemo } from 'react';
import { useStore } from '../store';

export const darkColors = {
  background: {
    primary: '#05070B',
    secondary: '#0B1220',
    tertiary: '#111C31',
    card: 'rgba(14, 23, 38, 0.88)',
    cardHover: 'rgba(22, 35, 57, 0.94)',
    glass: 'rgba(8, 14, 24, 0.70)',
    overlay: 'rgba(2, 6, 12, 0.94)',
  },
  accent: {
    primary: '#2563FF',
    primaryDark: '#1D4ED8',
    primaryLight: '#60A5FA',
    secondary: '#3B82F6',
    tertiary: '#93C5FD',
    glow: 'rgba(37, 99, 255, 0.28)',
    glowStrong: 'rgba(37, 99, 255, 0.45)',
  },
  status: {
    active: '#22C55E',
    activeSubtle: 'rgba(34, 197, 94, 0.16)',
    activeGlow: 'rgba(34, 197, 94, 0.36)',
    warning: '#F59E0B',
    warningSubtle: 'rgba(245, 158, 11, 0.18)',
    warningGlow: 'rgba(245, 158, 11, 0.38)',
    danger: '#EF4444',
    dangerSubtle: 'rgba(239, 68, 68, 0.16)',
    dangerGlow: 'rgba(239, 68, 68, 0.4)',
    info: '#38BDF8',
    infoGlow: 'rgba(56, 189, 248, 0.35)',
  },
  text: {
    primary: '#F8FAFC',
    secondary: '#DCE6FF',
    muted: '#8FA3C7',
    accent: '#93C5FD',
    inverse: '#05070B',
  },
  border: {
    subtle: 'rgba(96, 165, 250, 0.20)',
    medium: 'rgba(96, 165, 250, 0.34)',
    strong: 'rgba(147, 197, 253, 0.48)',
    glow: '#2563FF',
  },
  gradient: {
    primary: ['#1D4ED8', '#2563FF'],
    secondary: ['#0B1220', '#111C31'],
    dark: ['#05070B', '#0B1220'],
    card: ['rgba(14, 23, 38, 0.88)', 'rgba(8, 14, 24, 0.70)'],
    button: ['#1D4ED8', '#2563FF', '#60A5FA'],
    danger: ['#DC2626', '#EF4444'],
  },
};

export const lightColors = {
  background: {
    primary: '#F3F7FF',
    secondary: '#FFFFFF',
    tertiary: '#E8F0FF',
    card: 'rgba(255, 255, 255, 0.95)',
    cardHover: 'rgba(238, 244, 255, 0.98)',
    glass: 'rgba(255, 255, 255, 0.75)',
    overlay: 'rgba(11, 18, 32, 0.35)',
  },
  accent: {
    primary: '#1D4ED8',
    primaryDark: '#1E40AF',
    primaryLight: '#3B82F6',
    secondary: '#2563EB',
    tertiary: '#60A5FA',
    glow: 'rgba(37, 99, 255, 0.20)',
    glowStrong: 'rgba(37, 99, 255, 0.32)',
  },
  status: {
    active: '#16A34A',
    activeSubtle: 'rgba(22, 163, 74, 0.14)',
    activeGlow: 'rgba(22, 163, 74, 0.22)',
    warning: '#D97706',
    warningSubtle: 'rgba(217, 119, 6, 0.16)',
    warningGlow: 'rgba(217, 119, 6, 0.24)',
    danger: '#DC2626',
    dangerSubtle: 'rgba(220, 38, 38, 0.14)',
    dangerGlow: 'rgba(220, 38, 38, 0.22)',
    info: '#0284C7',
    infoGlow: 'rgba(2, 132, 199, 0.22)',
  },
  text: {
    primary: '#0B1220',
    secondary: '#1F3557',
    muted: '#5B728F',
    accent: '#1D4ED8',
    inverse: '#F8FAFC',
  },
  border: {
    subtle: 'rgba(37, 99, 235, 0.22)',
    medium: 'rgba(37, 99, 235, 0.34)',
    strong: 'rgba(30, 64, 175, 0.42)',
    glow: '#1D4ED8',
  },
  gradient: {
    primary: ['#1E40AF', '#1D4ED8'],
    secondary: ['#F3F7FF', '#E8F0FF'],
    dark: ['#F3F7FF', '#E8F0FF'],
    card: ['rgba(255, 255, 255, 0.95)', 'rgba(238, 244, 255, 0.98)'],
    button: ['#1E40AF', '#1D4ED8', '#3B82F6'],
    danger: ['#B91C1C', '#DC2626'],
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
    shadowColor: '#2563FF',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  md: {
    shadowColor: '#2563FF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  lg: {
    shadowColor: '#2563FF',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },
  glow: {
    shadowColor: '#2563FF',
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

// Animation durations
export const animation = {
  fast: 150,
  normal: 250,
  slow: 400,
};

function buildComponentStyles(colors) {
  return {
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
}

export function getTheme(mode = 'dark') {
  const palette = mode === 'light' ? lightColors : darkColors;
  return {
    mode,
    colors: palette,
    spacing,
    radius,
    shadows,
    typography,
    componentStyles: buildComponentStyles(palette),
    animation,
  };
}

export function useAppTheme() {
  const themeMode = useStore((s) => s.themeMode);
  const setThemeMode = useStore((s) => s.setThemeMode);
  const toggleThemeMode = useStore((s) => s.toggleThemeMode);
  const theme = useMemo(() => getTheme(themeMode), [themeMode]);

  return {
    ...theme,
    themeMode,
    setThemeMode,
    toggleThemeMode,
    isDark: themeMode === 'dark',
    isLight: themeMode === 'light',
  };
}

// Backward compatible static exports default to dark mode.
export const colors = darkColors;
export const componentStyles = buildComponentStyles(darkColors);

export default getTheme('dark');
