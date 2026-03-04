import { StyleSheet } from 'react-native';

const mobileColors = {
  background: {
    primary: '#000000',
    secondary: '#231f20',
    tertiary: '#253746',
    card: 'rgba(35, 31, 32, 0.9)',
    cardHover: 'rgba(37, 55, 70, 0.9)',
    glass: 'rgba(35, 31, 32, 0.7)',
    overlay: 'rgba(0, 0, 0, 0.95)',
  },
  accent: {
    primary: '#253746',
    primaryDark: '#1a2830',
    primaryLight: '#3a5060',
    secondary: '#3a5060',
    tertiary: '#4a6070',
    glow: 'rgba(37, 55, 70, 0.4)',
    glowStrong: 'rgba(37, 55, 70, 0.7)',
  },
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
  text: {
    primary: '#ffffff',
    secondary: '#cccccc',
    muted: '#888888',
    accent: '#ffffff',
    inverse: '#000000',
  },
  border: {
    subtle: 'rgba(255, 255, 255, 0.1)',
    medium: 'rgba(255, 255, 255, 0.2)',
    strong: 'rgba(255, 255, 255, 0.3)',
    glow: '#253746',
  },
};

export const theme = {
  colors: {
    ...mobileColors,

    bg: mobileColors.background.primary,
    bgElevated: mobileColors.background.secondary,
    bgSidebar: mobileColors.background.secondary,
    surface: mobileColors.background.card,
    surfaceMuted: mobileColors.background.tertiary,
    border: mobileColors.border.subtle,
    borderStrong: mobileColors.border.medium,
    textPrimary: mobileColors.text.primary,
    textSecondary: mobileColors.text.secondary,
    textMuted: mobileColors.text.muted,
    accent: mobileColors.accent.primaryLight,
    accentSoft: mobileColors.accent.primaryDark,
    success: mobileColors.status.active,
    warning: mobileColors.status.warning,
    danger: mobileColors.status.danger,
    info: mobileColors.status.info,
    overlay: mobileColors.background.overlay,
  },
  spacing: {
    xxs: 4,
    xs: 8,
    sm: 12,
    md: 16,
    lg: 20,
    xl: 24,
    xxl: 32,
  },
  typography: {
    fontFamily: 'System',
    title: 24,
    heading: 18,
    body: 14,
    caption: 12,
    mono: 12,
    small: 11,
  },
  layout: {
    sidebarWidth: 260,
    minMainWidth: 1200,
    contentPadding: 20,
    cardRadius: 10,
    rowHeight: 38,
    topBarHeight: 58,
  },
};

export const sharedStyles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: theme.colors.bg,
    padding: theme.layout.contentPadding,
  },
  pageTitle: {
    color: theme.colors.textPrimary,
    fontSize: theme.typography.title,
    fontWeight: '700',
    marginBottom: theme.spacing.md,
  },
  sectionTitle: {
    color: theme.colors.textPrimary,
    fontSize: theme.typography.heading,
    fontWeight: '600',
    marginBottom: theme.spacing.sm,
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.layout.cardRadius,
  },
  mutedText: {
    color: theme.colors.textSecondary,
    fontSize: theme.typography.body,
  },
  input: {
    height: 36,
    backgroundColor: theme.colors.background.tertiary,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 8,
    paddingHorizontal: theme.spacing.sm,
    color: theme.colors.textPrimary,
    fontSize: theme.typography.body,
  },
  button: {
    minHeight: 34,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
    paddingHorizontal: theme.spacing.sm,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonText: {
    color: theme.colors.textPrimary,
    fontSize: theme.typography.caption,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
});

export function statusTone(status: 'online' | 'offline' | 'degraded') {
  if (status === 'online') {
    return theme.colors.success;
  }
  if (status === 'degraded') {
    return theme.colors.warning;
  }
  return theme.colors.danger;
}
