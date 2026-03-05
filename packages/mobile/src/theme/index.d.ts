// Type declarations for theme/index.js
export interface Colors {
  background: {
    primary: string;
    secondary: string;
    tertiary: string;
    card: string;
    cardHover: string;
    glass: string;
    overlay: string;
  };
  accent: {
    primary: string;
    primaryDark: string;
    primaryLight: string;
    secondary: string;
    tertiary: string;
    glow: string;
    glowStrong: string;
  };
  status: {
    active: string;
    activeSubtle: string;
    activeGlow: string;
    warning: string;
    warningSubtle: string;
    warningGlow: string;
    danger: string;
    dangerSubtle: string;
    dangerGlow: string;
    info: string;
    infoGlow: string;
  };
  text: {
    primary: string;
    secondary: string;
    muted: string;
    accent: string;
    inverse: string;
  };
  border: {
    subtle: string;
    medium: string;
    strong: string;
    glow: string;
  };
  gradient: {
    primary: string[];
    secondary: string[];
    dark: string[];
    card: string[];
    button: string[];
    danger: string[];
  };
}

export type ThemeMode = 'dark' | 'light';

export interface Spacing {
  xs: number;
  sm: number;
  md: number;
  lg: number;
  xl: number;
  xxl: number;
  xxxl: number;
}

export interface Radius {
  sm: number;
  md: number;
  lg: number;
  xl: number;
  xxl: number;
  full: number;
}

export interface Typography {
  size: {
    xs: number;
    sm: number;
    md: number;
    lg: number;
    xl: number;
    xxl: number;
    xxxl: number;
    display: number;
  };
  weight: {
    regular: string;
    medium: string;
    semibold: string;
    bold: string;
  };
  letterSpacing: {
    tight: number;
    normal: number;
    wide: number;
    wider: number;
    widest: number;
  };
}

export interface Shadow {
  shadowColor: string;
  shadowOffset: { width: number; height: number };
  shadowOpacity: number;
  shadowRadius: number;
  elevation: number;
}

export interface Shadows {
  sm: Shadow;
  md: Shadow;
  lg: Shadow;
  glow: Shadow;
  glowDanger: Shadow;
  glowActive: Shadow;
}

export interface ThemeValues {
  mode: ThemeMode;
  colors: Colors;
  spacing: Spacing;
  radius: Radius;
  typography: Typography;
  shadows: Shadows;
  componentStyles: Record<string, any>;
  animation: {
    fast: number;
    normal: number;
    slow: number;
  };
}

export interface AppTheme extends ThemeValues {
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
  toggleThemeMode: () => void;
  isDark: boolean;
  isLight: boolean;
}

export const colors: Colors;
export const spacing: Spacing;
export const radius: Radius;
export const typography: Typography;
export const shadows: Shadows;
export const darkColors: Colors;
export const lightColors: Colors;
export const componentStyles: Record<string, any>;
export const animation: { fast: number; normal: number; slow: number };
export function getTheme(mode?: ThemeMode): ThemeValues;
export function useAppTheme(): AppTheme;
