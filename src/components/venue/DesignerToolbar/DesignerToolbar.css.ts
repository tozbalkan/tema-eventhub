import { style } from '@vanilla-extract/css';
import { vars } from '@/styles/tokens.css';

export const toolbarContainer = style({
  backgroundColor: vars.color.bgSurface,
  border: `1px solid ${vars.color.borderSubtle}`,
  borderRadius: vars.radii.xl,
  padding: `${vars.spacing[2]} ${vars.spacing[3]}`,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  flexWrap: 'wrap',
  gap: vars.spacing[2],
  boxShadow: vars.shadow.md,
});

export const groupLeft = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.spacing[1],
  flexWrap: 'wrap',
});

export const groupRight = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.spacing[2],
});

export const btn = style({
  display: 'inline-flex',
  alignItems: 'center',
  gap: vars.spacing[1],
  padding: `${vars.spacing[1]} ${vars.spacing[2]}`,
  height: vars.sizing.toolbarBtnHeight,
  borderRadius: vars.radii.md,
  border: '1px solid transparent',
  backgroundColor: 'transparent',
  color: vars.color.textMed,
  fontSize: vars.typography.size.xs,
  fontWeight: vars.typography.weight.medium,
  cursor: 'pointer',
  transition: `background-color ${vars.transition.fast}, color ${vars.transition.fast}, border-color ${vars.transition.fast}, opacity ${vars.transition.fast}`,
  userSelect: 'none',

  ':hover': {
    backgroundColor: vars.color.bgSurfaceHover,
    color: vars.color.textHigh,
  },
  ':active': {
    backgroundColor: vars.color.bgSurfaceActive,
  },
  selectors: {
    '&[data-active="true"]': {
      backgroundColor: vars.color.primaryLight,
      color: vars.color.primary,
      borderColor: vars.color.primary,
    },
    '&:disabled': {
      opacity: 0.4,
      cursor: 'not-allowed',
      backgroundColor: 'transparent',
    },
  },
});

export const primaryBtn = style({
  backgroundColor: vars.color.primary,
  color: vars.color.textHigh,
  fontWeight: vars.typography.weight.semibold,
  border: 'none',

  ':hover': {
    backgroundColor: vars.color.primaryHover,
    color: vars.color.textHigh,
  },
});

export const divider = style({
  width: '1px',
  height: vars.spacing[5],
  backgroundColor: vars.color.borderMuted,
  marginInline: vars.spacing[1],
});

/* ── Dropdowns ── */

export const dropdownWrapper = style({
  position: 'relative',
  display: 'inline-block',
});

export const dropdownMenu = style({
  position: 'absolute',
  top: `calc(100% + ${vars.spacing[1]})`,
  left: 0,
  zIndex: vars.zIndex.modal,
  minWidth: vars.sizing.dropdownMinWidth,
  backgroundColor: vars.color.bgElevated,
  backdropFilter: 'blur(1rem)',
  WebkitBackdropFilter: 'blur(1rem)',
  border: `1px solid ${vars.color.borderSubtle}`,
  borderRadius: vars.radii.lg,
  padding: vars.spacing[1],
  boxShadow: vars.shadow.lg,
  display: 'flex',
  flexDirection: 'column',
  gap: vars.spacing['0.5'],
});

export const dropdownItem = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: `${vars.spacing[2]} ${vars.spacing[3]}`,
  fontSize: vars.typography.size.xs,
  color: vars.color.textMed,
  borderRadius: vars.radii.md,
  border: 'none',
  backgroundColor: 'transparent',
  cursor: 'pointer',
  textAlign: 'left',
  width: '100%',
  transition: `background-color ${vars.transition.fast}, color ${vars.transition.fast}`,

  ':hover': {
    backgroundColor: vars.color.bgSurfaceHover,
    color: vars.color.textHigh,
  },
});

export const menuDivider = style({
  height: '1px',
  backgroundColor: vars.color.borderSubtle,
  marginBlock: vars.spacing[1],
});

export const dropdownLabelGroup = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.spacing[2],
});

export const shortcutBadge = style({
  fontSize: vars.typography.size.badge,
  fontFamily: vars.typography.family.mono,
  color: vars.color.textMuted,
  backgroundColor: vars.color.bgPrimary,
  paddingBlock: vars.spacing['0.5'],
  paddingInline: vars.spacing[1],
  borderRadius: vars.radii.sm,
});

/* ── Save indicator & Preview mode toggle ── */

export const saveIndicator = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.spacing[1],
  fontSize: vars.typography.size.xs,
  color: vars.color.textMuted,
  fontVariantNumeric: 'tabular-nums',
});

export const saveDot = style({
  width: vars.spacing[2],
  height: vars.spacing[2],
  borderRadius: vars.radii.full,
});

export const saveDotSaved = style([
  saveDot,
  { backgroundColor: vars.color.available },
]);

export const saveDotUnsaved = style([
  saveDot,
  { backgroundColor: vars.color.reserved },
]);

export const modeToggle = style({
  display: 'inline-flex',
  alignItems: 'center',
  backgroundColor: vars.color.bgPrimary,
  border: `1px solid ${vars.color.borderSubtle}`,
  borderRadius: vars.radii.full,
  padding: vars.spacing['0.75'],
  gap: vars.spacing['0.5'],
});

export const modeIcon = style({
  marginRight: vars.spacing[1],
});

export const modeOption = style({
  padding: `${vars.spacing[1]} ${vars.spacing[3]}`,
  fontSize: vars.typography.size.xs,
  fontWeight: vars.typography.weight.semibold,
  borderRadius: vars.radii.full,
  border: 'none',
  backgroundColor: 'transparent',
  color: vars.color.textMuted,
  cursor: 'pointer',
  transition: `background-color ${vars.transition.fast}, color ${vars.transition.fast}`,

  selectors: {
    '&[data-active="true"]': {
      backgroundColor: vars.color.primary,
      color: vars.color.textHigh,
    },
  },
});
