import { style, styleVariants } from '@vanilla-extract/css';
import { vars } from '@/styles/tokens.css';

export const buttonBase = style({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: vars.spacing[2],
  borderRadius: vars.radii.lg,
  fontWeight: vars.typography.weight.medium,
  fontSize: vars.typography.size.sm,
  lineHeight: vars.typography.lineHeight.tight,
  cursor: 'pointer',
  border: '1px solid transparent',
  transition: `all ${vars.transition.fast}`,
  outline: 'none',
  userSelect: 'none',
  paddingBlock: vars.spacing[2],
  paddingInline: vars.spacing[4],

  ':disabled': {
    opacity: 0.5,
    cursor: 'not-allowed',
    pointerEvents: 'none',
  },

  ':focus-visible': {
    borderColor: vars.color.borderFocus,
    boxShadow: `0 0 0 0.125rem ${vars.color.primaryLight}`,
  },
});

export const buttonVariants = styleVariants({
  primary: {
    backgroundColor: vars.color.primary,
    color: vars.color.textHigh,
    boxShadow: vars.shadow.glowPrimary,
    ':hover': {
      backgroundColor: vars.color.primaryHover,
    },
  },
  secondary: {
    backgroundColor: vars.color.bgSurface,
    color: vars.color.textMed,
    borderColor: vars.color.borderSubtle,
    ':hover': {
      backgroundColor: vars.color.bgSurfaceHover,
      color: vars.color.textHigh,
    },
  },
  danger: {
    backgroundColor: vars.color.soldBg,
    color: vars.color.sold,
    borderColor: vars.color.sold,
    ':hover': {
      backgroundColor: vars.color.sold,
      color: vars.color.textHigh,
    },
  },
  ghost: {
    backgroundColor: 'transparent',
    color: vars.color.textMed,
    ':hover': {
      backgroundColor: vars.color.bgSurfaceHover,
      color: vars.color.textHigh,
    },
  },
});
