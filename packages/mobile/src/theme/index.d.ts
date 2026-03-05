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
    activeGlow: string;
    warning: string;
    warningGlow: string;
    danger: string;
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

export const colors: Colors;
export const spacing: Spacing;
export const radius: Radius;
export const typography: Typography;
export const shadows: Shadows;
