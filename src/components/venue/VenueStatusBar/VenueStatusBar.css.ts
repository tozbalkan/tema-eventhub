import { style } from '@vanilla-extract/css';
import { vars } from '@/styles/tokens.css';

export const statusBar = style({
  height: '2rem',
  backgroundColor: vars.color.bgSurface,
  borderTop: `1px solid ${vars.color.borderSubtle}`,
  paddingInline: vars.spacing[3],
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  fontSize: vars.typography.size.caption,
  color: vars.color.textMuted,
  fontVariantNumeric: 'tabular-nums',
  userSelect: 'none',
});

export const statusGroup = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.spacing[4],
});

export const statusItem = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.spacing[1],
});

export const statusValue = style({
  color: vars.color.textHigh,
  fontWeight: vars.typography.weight.semibold,
});
