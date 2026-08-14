import { style } from '@vanilla-extract/css';
import { vars } from '@/styles/tokens.css';

export const treePanel = style({
  width: '18rem',
  backgroundColor: vars.color.bgSurface,
  borderRight: `1px solid ${vars.color.borderSubtle}`,
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  overflow: 'hidden',
  userSelect: 'none',
});

export const treeHeader = style({
  padding: vars.spacing[3],
  borderBottom: `1px solid ${vars.color.borderSubtle}`,
  backgroundColor: vars.color.bgGlass,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  fontSize: vars.typography.size.sm,
  fontWeight: vars.typography.weight.bold,
  color: vars.color.textHigh,
});

export const treeHeaderTitleGroup = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.spacing[1.5],
});

export const treeHeaderActionGroup = style({
  display: 'flex',
  gap: vars.spacing[1],
});

export const treeList = style({
  flex: 1,
  overflowY: 'auto',
  padding: vars.spacing[2],
  display: 'flex',
  flexDirection: 'column',
  gap: vars.spacing[1],
});

export const treeItem = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: `${vars.spacing[1.5]} ${vars.spacing[2]}`,
  borderRadius: vars.radii.md,
  fontSize: vars.typography.size.xs,
  color: vars.color.textMed,
  cursor: 'pointer',
  transition: `background-color ${vars.transition.fast}, color ${vars.transition.fast}`,

  selectors: {
    '&:hover': {
      backgroundColor: vars.color.bgSurfaceHover,
      color: vars.color.textHigh,
    },
    '&[data-selected="true"]': {
      backgroundColor: vars.color.primaryLight,
      color: vars.color.primary,
      fontWeight: vars.typography.weight.semibold,
    },
    '&[data-hidden="true"]': {
      opacity: 0.45,
    },
  },
});

export const treeItemContent = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.spacing[2],
  minWidth: 0,
});

export const treeItemName = style({
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const treeItemActions = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.spacing[1],
});

export const treeActionBtn = style({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: vars.spacing[6],
  height: vars.spacing[6],
  borderRadius: vars.radii.sm,
  border: 'none',
  backgroundColor: 'transparent',
  color: vars.color.textMuted,
  cursor: 'pointer',

  ':hover': {
    color: vars.color.textHigh,
    backgroundColor: vars.color.bgSurfaceHover,
  },
});

export const treeIndent0 = style({ paddingLeft: vars.spacing[2] });
export const treeIndent1 = style({ paddingLeft: vars.spacing[5] });
export const treeIndent2 = style({ paddingLeft: vars.spacing[8] });
export const treeIndent3 = style({ paddingLeft: vars.spacing[10] });

export const treeIconSpacer = style({
  width: vars.spacing[4],
});
