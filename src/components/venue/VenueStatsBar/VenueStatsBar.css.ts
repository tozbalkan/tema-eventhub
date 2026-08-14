import { style } from '@vanilla-extract/css';
import { vars, breakpoints } from '@/styles/tokens.css';

export const statsBar = style({
  display: 'grid',
  gridTemplateColumns: 'repeat(2, 1fr)',
  gap: vars.spacing[2],
  paddingInline: vars.spacing[4],

  [`@media (min-width: ${breakpoints.sm})`]: {
    gridTemplateColumns: 'repeat(3, 1fr)',
  },

  [`@media (min-width: ${breakpoints.md})`]: {
    gridTemplateColumns: 'repeat(7, 1fr)',
    gap: vars.spacing[3],
    paddingInline: vars.spacing[6],
  },
});

export const statCard = style({
  backgroundColor: vars.color.bgSurface,
  border: `1px solid ${vars.color.borderMuted}`,
  borderRadius: vars.radii.lg,
  padding: `${vars.spacing[3]} ${vars.spacing[4]}`,
  display: 'flex',
  flexDirection: 'column',
  gap: vars.spacing[1],
  transition: `border-color ${vars.transition.fast}`,

  ':hover': {
    borderColor: vars.color.borderSubtle,
  },
});

export const statValue = style({
  fontSize: vars.typography.size.xl,
  fontWeight: vars.typography.weight.bold,
  fontVariantNumeric: 'tabular-nums',
  color: vars.color.textHigh,
});

export const statValuePrimary = style([
  statValue,
  { color: vars.color.primary },
]);

export const statValueAvailable = style([
  statValue,
  { color: vars.color.available },
]);

export const statValueReserved = style([
  statValue,
  { color: vars.color.reserved },
]);

export const statValueSold = style([
  statValue,
  { color: vars.color.sold },
]);

export const statValuePax = style([
  statValue,
  { color: vars.color.accentCyan },
]);

export const statLabel = style({
  fontSize: vars.typography.size.xs,
  color: vars.color.textMuted,
});
