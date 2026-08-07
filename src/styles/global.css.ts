import { globalStyle } from '@vanilla-extract/css';
import { vars } from './tokens.css';

globalStyle('*, *::before, *::after', {
  boxSizing: 'border-box',
  margin: 0,
  padding: 0,
});

globalStyle('html', {
  fontSize: '100%',
  WebkitTextSizeAdjust: '100%',
  colorScheme: 'dark',
  height: '100%',
});

globalStyle('body', {
  fontFamily: vars.typography.fontFamily,
  backgroundColor: vars.color.bgPrimary,
  color: vars.color.textHigh,
  lineHeight: vars.typography.lineHeight.normal,
  minHeight: '100dvh',
  WebkitFontSmoothing: 'antialiased',
  MozOsxFontSmoothing: 'grayscale',
  overflowX: 'hidden',
});

// Custom Scrollbar styling using rem
globalStyle('::-webkit-scrollbar', {
  width: '0.5rem',
  height: '0.5rem',
});

globalStyle('::-webkit-scrollbar-track', {
  backgroundColor: vars.color.bgPrimary,
});

globalStyle('::-webkit-scrollbar-thumb', {
  backgroundColor: vars.color.borderSubtle,
  borderRadius: vars.radii.full,
});

globalStyle('::-webkit-scrollbar-thumb:hover', {
  backgroundColor: vars.color.textMuted,
});

globalStyle('a', {
  color: 'inherit',
  textDecoration: 'none',
});

globalStyle('button, input, select, textarea', {
  font: 'inherit',
  color: 'inherit',
});
