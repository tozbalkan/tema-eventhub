import { createGlobalTheme } from '@vanilla-extract/css';

// Theme contract for full type-safety
export const vars = createGlobalTheme(':root', {
  color: {
    // Background & Surfaces (HSL only)
    bgPrimary: 'hsl(224 25% 8%)',
    bgSurface: 'hsl(224 22% 12%)',
    bgSurfaceHover: 'hsl(224 20% 16%)',
    bgSurfaceActive: 'hsl(224 20% 20%)',
    bgGlass: 'hsl(224 22% 12% / 0.75)',
    bgElevated: 'hsl(224 22% 14% / 0.95)',
    bgTooltip: 'hsl(224 22% 12% / 0.92)',
    bgToolbar: 'hsl(224 22% 12% / 0.85)',

    // Borders (HSL only)
    borderMuted: 'hsl(224 18% 18%)',
    borderSubtle: 'hsl(224 18% 24%)',
    borderFocus: 'hsl(260 85% 65%)',

    // Primary Accents (HSL only)
    primary: 'hsl(260 85% 65%)',
    primaryHover: 'hsl(260 85% 72%)',
    primaryLight: 'hsl(260 85% 65% / 0.15)',
    accentCyan: 'hsl(200 80% 55%)',

    // Status Colors (HSL only)
    available: 'hsl(142 70% 45%)',
    availableBg: 'hsl(142 70% 45% / 0.12)',
    reserved: 'hsl(45 90% 50%)',
    reservedBg: 'hsl(45 90% 50% / 0.12)',
    sold: 'hsl(350 80% 55%)',
    soldBg: 'hsl(350 80% 55% / 0.12)',
    blocked: 'hsl(220 15% 45%)',
    blockedBg: 'hsl(220 15% 45% / 0.15)',

    // Text & Content (HSL only)
    textHigh: 'hsl(0 0% 98%)',
    textMed: 'hsl(224 15% 75%)',
    textMuted: 'hsl(224 12% 50%)',
    textInverse: 'hsl(224 30% 6%)',
  },
  typography: {
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    family: {
      sans: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
      mono: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
    },
    size: {
      caption: '0.5rem',
      tag: '0.5625rem',
      label: '0.625rem',
      badge: '0.6875rem',
      xs: 'clamp(0.6875rem, 0.65rem + 0.15vw, 0.75rem)',
      sm: 'clamp(0.8125rem, 0.78rem + 0.2vw, 0.875rem)',
      base: 'clamp(0.9375rem, 0.9rem + 0.25vw, 1rem)',
      lg: 'clamp(1.0625rem, 1rem + 0.35vw, 1.125rem)',
      xl: 'clamp(1.25rem, 1.15rem + 0.5vw, 1.375rem)',
      h3: 'clamp(1.375rem, 1.25rem + 0.6vw, 1.5rem)',
      h2: 'clamp(1.625rem, 1.45rem + 0.9vw, 1.875rem)',
      h1: 'clamp(2rem, 1.75rem + 1.2vw, 2.375rem)',
    },
    weight: {
      regular: '400',
      medium: '500',
      semibold: '600',
      bold: '700',
    },
    lineHeight: {
      tight: '1.2',
      snug: '1.35',
      normal: '1.5',
      relaxed: '1.65',
    },
  },
  spacing: {
    '0': '0rem',
    '0.5': '0.125rem',
    '0.75': '0.1875rem',
    '1': '0.25rem',
    '1.5': '0.375rem',
    '2': '0.5rem',
    '2.5': '0.625rem',
    '3': '0.75rem',
    '4': '1rem',
    '5': '1.25rem',
    '6': '1.5rem',
    '8': '2rem',
    '10': '2.5rem',
    '12': '3rem',
    '16': '4rem',
  },
  sizing: {
    iconXs: '0.75rem',
    iconSm: '0.875rem',
    iconMd: '1rem',
    iconLg: '1.25rem',
    toolbarBtnHeight: '2.125rem',
    dropdownMinWidth: '12rem',
    tooltipMinWidth: '10rem',
    tooltipMaxWidth: '14rem',
    groupEditInputWidth: '10rem',
  },
  radii: {
    sm: '0.25rem',
    md: '0.375rem',
    lg: '0.5rem',
    xl: '0.75rem',
    full: '9999rem',
  },
  zIndex: {
    canvas: '1',
    toolbar: '10',
    tooltip: '20',
    overlay: '50',
    modal: '100',
  },
  shadow: {
    sm: '0 0.0625rem 0.125rem 0 hsl(0 0% 0% / 0.25)',
    md: '0 0.25rem 0.75rem -0.125rem hsl(0 0% 0% / 0.4)',
    lg: '0 0.625rem 1.5rem -0.25rem hsl(0 0% 0% / 0.5)',
    glowPrimary: '0 0 1.25rem hsl(260 85% 65% / 0.35)',
    glowAvailable: '0 0 1rem hsl(142 70% 45% / 0.3)',
    glowReserved: '0 0 1rem hsl(45 90% 50% / 0.3)',
    glowSold: '0 0 1rem hsl(350 80% 55% / 0.3)',
    glowAvailableStrong: 'hsl(142 70% 45% / 0.4)',
    glowReservedStrong: 'hsl(45 90% 50% / 0.4)',
    glowSoldStrong: 'hsl(350 80% 55% / 0.4)',
    glowBlockedStrong: 'hsl(220 15% 45% / 0.3)',
  },
  transition: {
    fast: '150ms cubic-bezier(0.4, 0, 0.2, 1)',
    normal: '250ms cubic-bezier(0.4, 0, 0.2, 1)',
    slow: '350ms cubic-bezier(0.4, 0, 0.2, 1)',
  },
});

export const breakpoints = {
  sm: '36rem', // 576px
  md: '48rem', // 768px
  lg: '64rem', // 1024px
  xl: '80rem', // 1280px
  xxl: '96rem', // 1536px
};
