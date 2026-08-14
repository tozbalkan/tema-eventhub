import { style } from '@vanilla-extract/css';
import { vars } from '@/styles/tokens.css';

export const inputContainer = style({
  display: 'flex',
  flexDirection: 'column',
  gap: vars.spacing[1],
  width: '100%',
});

export const inputLabel = style({
  fontSize: vars.typography.size.xs,
  fontWeight: vars.typography.weight.medium,
  color: vars.color.textMed,
});

export const inputElement = style({
  width: '100%',
  backgroundColor: vars.color.bgSurface,
  color: vars.color.textHigh,
  border: `1px solid ${vars.color.borderSubtle}`,
  borderRadius: vars.radii.md,
  paddingBlock: vars.spacing[2],
  paddingInline: vars.spacing[3],
  fontSize: vars.typography.size.sm,
  outline: 'none',
  transition: `border-color ${vars.transition.fast}, box-shadow ${vars.transition.fast}`,

  ':focus': {
    borderColor: vars.color.borderFocus,
    boxShadow: `0 0 0 0.125rem ${vars.color.primaryLight}`,
  },

  '::placeholder': {
    color: vars.color.textMuted,
  },
});

export const inputError = style({
  fontSize: vars.typography.size.xs,
  color: vars.color.sold,
});
