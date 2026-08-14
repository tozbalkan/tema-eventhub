import { style } from '@vanilla-extract/css';
import { vars } from '@/styles/tokens.css';

export const contextMenu = style({
  position: 'fixed',
  zIndex: vars.zIndex.modal,
  backgroundColor: vars.color.bgSurface,
  border: `1px solid ${vars.color.borderSubtle}`,
  borderRadius: vars.radii.lg,
  boxShadow: vars.shadow.lg,
  padding: vars.spacing[1],
  minWidth: '12rem',
  display: 'flex',
  flexDirection: 'column',
  gap: vars.spacing['0.5'],
});

export const contextMenuPositioned = style([
  contextMenu,
  {
    left: 'var(--menu-left)',
    top: 'var(--menu-top)',
  },
]);

export const contextMenuItem = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: `${vars.spacing[1.5]} ${vars.spacing[3]}`,
  borderRadius: vars.radii.md,
  fontSize: vars.typography.size.xs,
  color: vars.color.textHigh,
  backgroundColor: 'transparent',
  border: 'none',
  width: '100%',
  textAlign: 'left',
  cursor: 'pointer',

  ':hover': {
    backgroundColor: vars.color.bgSurfaceHover,
  },
});

export const contextMenuDivider = style({
  height: '1px',
  backgroundColor: vars.color.borderSubtle,
  marginBlock: vars.spacing[1],
});

export const itemLabelGroup = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.spacing[1.5],
});

export const shortcutBadge = style({
  color: vars.color.textMuted,
  fontSize: vars.typography.size.caption,
});

export const dangerItem = style({
  color: vars.color.sold,
});
