import { style } from '@vanilla-extract/css';
import { vars } from '@/styles/tokens.css';

export const modalOverlay = style({
  position: 'fixed',
  inset: 0,
  backgroundColor: 'hsl(0 0% 0% / 0.75)',
  backdropFilter: 'blur(0.25rem)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000,
  padding: vars.spacing[4],
});

export const modalContent = style({
  backgroundColor: vars.color.bgSurface,
  borderColor: vars.color.borderSubtle,
  borderWidth: '1px',
  borderStyle: 'solid',
  borderRadius: vars.radii.xl,
  width: '100%',
  maxWidth: '32rem',
  maxHeight: '90dvh',
  overflowY: 'auto',
  boxShadow: vars.shadow.lg,
  display: 'flex',
  flexDirection: 'column',
  gap: vars.spacing[4],
  padding: vars.spacing[6],
});

export const modalHeader = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  borderBottom: `1px solid ${vars.color.borderMuted}`,
  paddingBottom: vars.spacing[3],
});

export const modalTitle = style({
  fontSize: vars.typography.size.lg,
  fontWeight: vars.typography.weight.bold,
  color: vars.color.textHigh,
});

export const modalCloseBtn = style({
  backgroundColor: 'transparent',
  border: 'none',
  color: vars.color.textMed,
  cursor: 'pointer',
  padding: vars.spacing[1],
  borderRadius: vars.radii.sm,
  ':hover': {
    color: vars.color.textHigh,
    backgroundColor: vars.color.bgSurfaceHover,
  },
});
