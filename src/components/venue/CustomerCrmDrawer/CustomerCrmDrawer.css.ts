import { style } from '@vanilla-extract/css';
import { vars, breakpoints } from '@/styles/tokens.css';

export const drawerOverlay = style({
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: 'hsl(0 0% 0% / 0.65)',
  backdropFilter: 'blur(0.25rem)',
  WebkitBackdropFilter: 'blur(0.25rem)',
  zIndex: vars.zIndex.modal,
  display: 'flex',
  justifyContent: 'flex-end',
});

export const drawerContainer = style({
  width: '100%',
  maxWidth: '28rem',
  height: '100%',
  backgroundColor: vars.color.bgSurface,
  borderLeft: `1px solid ${vars.color.borderSubtle}`,
  boxShadow: vars.shadow.lg,
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  transition: `transform ${vars.transition.normal}`,

  [`@media (min-width: ${breakpoints.md})`]: {
    maxWidth: '32rem',
  },
});

export const drawerHeader = style({
  padding: vars.spacing[4],
  borderBottom: `1px solid ${vars.color.borderSubtle}`,
  backgroundColor: vars.color.bgGlass,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
});

export const drawerTitleGroup = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.spacing[2],
});

export const drawerTitle = style({
  fontSize: vars.typography.size.lg,
  fontWeight: vars.typography.weight.bold,
  color: vars.color.textHigh,
});

export const closeBtn = style({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: vars.spacing[8],
  height: vars.spacing[8],
  borderRadius: vars.radii.full,
  border: 'none',
  backgroundColor: 'transparent',
  color: vars.color.textMed,
  cursor: 'pointer',

  ':hover': {
    backgroundColor: vars.color.bgSurfaceHover,
    color: vars.color.textHigh,
  },
});

export const drawerContent = style({
  padding: vars.spacing[4],
  overflowY: 'auto',
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  gap: vars.spacing[4],
});

export const searchBox = style({
  display: 'flex',
  flexDirection: 'column',
  gap: vars.spacing[2],
});

export const profileCard = style({
  backgroundColor: vars.color.bgPrimary,
  border: `1px solid ${vars.color.borderMuted}`,
  borderRadius: vars.radii.lg,
  padding: vars.spacing[4],
  display: 'flex',
  flexDirection: 'column',
  gap: vars.spacing[3],
});

export const profileHeader = style({
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
});

export const profileName = style({
  fontSize: vars.typography.size.base,
  fontWeight: vars.typography.weight.bold,
  color: vars.color.textHigh,
});

export const profileMeta = style({
  fontSize: vars.typography.size.xs,
  color: vars.color.textMed,
  display: 'flex',
  flexDirection: 'column',
  gap: vars.spacing['0.5'],
  marginTop: vars.spacing[1],
});

export const tagGroup = style({
  display: 'flex',
  flexWrap: 'wrap',
  gap: vars.spacing[1],
});

export const kpiGrid = style({
  display: 'grid',
  gridTemplateColumns: 'repeat(3, 1fr)',
  gap: vars.spacing[2],
  marginTop: vars.spacing[2],
});

export const kpiBox = style({
  backgroundColor: vars.color.bgSurfaceHover,
  borderRadius: vars.radii.md,
  padding: vars.spacing[2],
  display: 'flex',
  flexDirection: 'column',
  gap: vars.spacing['0.5'],
});

export const kpiVal = style({
  fontSize: vars.typography.size.base,
  fontWeight: vars.typography.weight.bold,
  color: vars.color.primary,
  fontVariantNumeric: 'tabular-nums',
});

export const kpiLbl = style({
  fontSize: vars.typography.size.caption,
  color: vars.color.textMuted,
});

export const sectionTitle = style({
  fontSize: vars.typography.size.xs,
  fontWeight: vars.typography.weight.bold,
  color: vars.color.primary,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  marginTop: vars.spacing[2],
  display: 'flex',
  alignItems: 'center',
  gap: vars.spacing[2],
});

export const historyList = style({
  display: 'flex',
  flexDirection: 'column',
  gap: vars.spacing[2],
});

export const historyItem = style({
  backgroundColor: vars.color.bgPrimary,
  border: `1px solid ${vars.color.borderSubtle}`,
  borderRadius: vars.radii.md,
  padding: vars.spacing[3],
  display: 'flex',
  flexDirection: 'column',
  gap: vars.spacing[1],
});

export const historyItemHeader = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  fontSize: vars.typography.size.xs,
});

export const historyItemTitle = style({
  fontWeight: vars.typography.weight.bold,
  color: vars.color.textHigh,
});

export const historyItemSub = style({
  fontSize: vars.typography.size.xs,
  color: vars.color.textMed,
});

export const noteForm = style({
  display: 'flex',
  flexDirection: 'column',
  gap: vars.spacing[2],
  marginTop: vars.spacing[2],
});

export const noteInput = style({
  width: '100%',
  backgroundColor: vars.color.bgPrimary,
  border: `1px solid ${vars.color.borderSubtle}`,
  borderRadius: vars.radii.md,
  padding: vars.spacing[2],
  fontSize: vars.typography.size.xs,
  color: vars.color.textHigh,
  outline: 'none',
  resize: 'vertical',
  minHeight: '4rem',

  ':focus': {
    borderColor: vars.color.borderFocus,
  },
});

export const emptyState = style({
  fontSize: vars.typography.size.sm,
  color: vars.color.textMuted,
  textAlign: 'center',
  paddingBlock: vars.spacing[6],
});

export const iconInline = style({
  display: 'inline',
  marginRight: vars.spacing[1],
});

export const netRevenueHighlight = style({
  color: vars.color.available,
});

export const textMutedSub = style({
  color: vars.color.textMuted,
});

export const textHighSub = style({
  color: vars.color.textHigh,
});

export const sectionMarginTop = style({
  marginTop: vars.spacing[3],
});
