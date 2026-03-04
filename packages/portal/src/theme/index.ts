import { StyleSheet } from 'react-native';

export const theme = {
  colors: {
    bg: '#0a1018',
    bgElevated: '#111b27',
    bgSidebar: '#0b131d',
    surface: '#151f2d',
    surfaceMuted: '#1b2a3b',
    border: '#25364a',
    textPrimary: '#e6eef8',
    textSecondary: '#9fb0c3',
    textMuted: '#73859b',
    accent: '#2f8cff',
    accentSoft: '#173963',
    success: '#35c77a',
    warning: '#f3b445',
    danger: '#eb5f73',
    overlay: 'rgba(3, 8, 14, 0.75)',
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
  },
  layout: {
    sidebarWidth: 260,
    minMainWidth: 1200,
    contentPadding: 20,
    cardRadius: 10,
    rowHeight: 38,
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
    marginBottom: theme.spacing.lg,
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
});
