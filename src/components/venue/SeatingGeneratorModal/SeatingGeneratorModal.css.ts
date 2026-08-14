import { style } from '@vanilla-extract/css';
import { vars } from '@/styles/tokens.css';

export const modalForm = style({
  display: 'flex',
  flexDirection: 'column',
  gap: vars.spacing[4],
});

export const formGrid = style({
  display: 'grid',
  gridTemplateColumns: 'repeat(2, 1fr)',
  gap: vars.spacing[3],
});

export const patternSection = style({
  display: 'flex',
  flexDirection: 'column',
  gap: vars.spacing[2],
  backgroundColor: vars.color.bgPrimary,
  padding: vars.spacing[3],
  borderRadius: vars.radii.md,
  border: `1px solid ${vars.color.borderSubtle}`,
});

export const patternPreview = style({
  display: 'flex',
  alignItems: 'center',
  flexWrap: 'wrap',
  gap: vars.spacing[1.5],
  minHeight: vars.spacing[10],
  padding: vars.spacing[2],
  backgroundColor: vars.color.bgSurface,
  borderRadius: vars.radii.sm,
  fontFamily: vars.typography.family.mono,
  fontSize: vars.typography.size.sm,
  color: vars.color.primary,
});

export const patternChipSeat = style({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: `${vars.spacing[1]} ${vars.spacing[2]}`,
  borderRadius: vars.radii.sm,
  backgroundColor: vars.color.availableBg,
  color: vars.color.available,
  fontSize: vars.typography.size.xs,
  fontWeight: vars.typography.weight.semibold,
});

export const patternChipGap = style({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: `${vars.spacing[1]} ${vars.spacing[2]}`,
  borderRadius: vars.radii.sm,
  backgroundColor: vars.color.bgSurfaceHover,
  color: vars.color.textMuted,
  fontSize: vars.typography.size.xs,
});

export const btnRow = style({
  display: 'flex',
  alignItems: 'center',
  flexWrap: 'wrap',
  gap: vars.spacing[2],
});
