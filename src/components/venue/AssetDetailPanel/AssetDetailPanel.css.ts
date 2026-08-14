import { style } from '@vanilla-extract/css';
import { vars, breakpoints } from '@/styles/tokens.css';

export const panel = style({
  display: 'flex',
  flexDirection: 'column',
  gap: vars.spacing[3],
});

export const card = style({
  backgroundColor: vars.color.bgSurface,
  border: `1px solid ${vars.color.borderSubtle}`,
  borderRadius: vars.radii.xl,
  padding: vars.spacing[4],
  display: 'flex',
  flexDirection: 'column',
  gap: vars.spacing[3],

  [`@media (min-width: ${breakpoints.md})`]: {
    padding: vars.spacing[5],
  },
});

export const cardHeader = style({
  fontSize: vars.typography.size.base,
  fontWeight: vars.typography.weight.semibold,
  color: vars.color.textHigh,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  cursor: 'pointer',
  userSelect: 'none',
});

export const cardHeaderGroup = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.spacing[2],
});

export const detailGrid = style({
  display: 'grid',
  gridTemplateColumns: '1fr',
  gap: vars.spacing[2],
});

export const detailRow = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  paddingBlock: vars.spacing[1],
  borderBottom: `1px solid ${vars.color.borderMuted}`,
});

export const detailLabel = style({
  fontSize: vars.typography.size.xs,
  color: vars.color.textMuted,
});

export const detailValue = style({
  fontSize: vars.typography.size.sm,
  fontWeight: vars.typography.weight.semibold,
  color: vars.color.textHigh,
});

export const capitalizeText = style({
  textTransform: 'capitalize',
});

export const actions = style({
  display: 'flex',
  flexDirection: 'column',
  gap: vars.spacing[2],
  marginTop: vars.spacing[2],
});

export const sectionTitle = style({
  fontSize: vars.typography.size.xs,
  fontWeight: vars.typography.weight.bold,
  color: vars.color.primary,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  marginTop: vars.spacing[2],
  marginBottom: vars.spacing[1],
});

export const propRow = style({
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: vars.spacing[2],
});

export const propInputGroup = style({
  display: 'flex',
  flexDirection: 'column',
  gap: vars.spacing[1],
});

export const fieldInput = style({
  width: '100%',
  backgroundColor: vars.color.bgPrimary,
  border: `1px solid ${vars.color.borderSubtle}`,
  borderRadius: vars.radii.md,
  padding: `${vars.spacing[1.5]} ${vars.spacing[2.5]}`,
  fontSize: vars.typography.size.xs,
  color: vars.color.textHigh,
  outline: 'none',

  ':focus': {
    borderColor: vars.color.borderFocus,
  },
  ':disabled': {
    opacity: 0.5,
    cursor: 'not-allowed',
  },
});

export const buttonTopMargin = style({
  marginTop: vars.spacing[2],
});

export const netRevenueColor = style({
  color: vars.color.available,
});

export const fieldTitleInput = style([
  fieldInput,
  {
    fontSize: vars.typography.size.base,
    fontWeight: vars.typography.weight.bold,
  },
]);

export const fieldSelect = style({
  fontSize: vars.typography.size.xs,
  fontWeight: vars.typography.weight.medium,
  color: vars.color.textHigh,
  backgroundColor: vars.color.bgPrimary,
  border: `1px solid ${vars.color.borderSubtle}`,
  borderRadius: vars.radii.md,
  padding: `${vars.spacing[1]} ${vars.spacing[2]}`,
  outline: 'none',
  width: '100%',
  cursor: 'pointer',
});

export const actionRow = style({
  display: 'grid',
  gridTemplateColumns: 'repeat(3, 1fr)',
  gap: vars.spacing[2],
  marginTop: vars.spacing[2],
});

export const actionBtn = style({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: vars.spacing[1],
  padding: `${vars.spacing[1]} ${vars.spacing[2]}`,
  fontSize: vars.typography.size.xs,
  fontWeight: vars.typography.weight.semibold,
  color: vars.color.textMed,
  backgroundColor: vars.color.bgSurfaceHover,
  border: `1px solid ${vars.color.borderSubtle}`,
  borderRadius: vars.radii.md,
  cursor: 'pointer',
  transition: `background-color ${vars.transition.fast}, color ${vars.transition.fast}`,

  ':hover': {
    backgroundColor: vars.color.bgSurfaceActive,
    color: vars.color.textHigh,
  },
});

export const dangerActionBtn = style([
  actionBtn,
  {
    color: vars.color.sold,
  },
]);

/* ─── Multi-select Summary ───────────────────────────────── */

export const multiSummary = style({
  display: 'flex',
  flexDirection: 'column',
  gap: vars.spacing[2],
});

export const multiKpiRow = style({
  display: 'flex',
  gap: vars.spacing[3],
});

export const multiKpiBox = style({
  flex: 1,
  backgroundColor: vars.color.bgSurfaceHover,
  borderRadius: vars.radii.md,
  padding: vars.spacing[3],
  display: 'flex',
  flexDirection: 'column',
  gap: vars.spacing[1],
});

export const multiKpiValuePax = style({
  fontSize: vars.typography.size.xl,
  fontWeight: vars.typography.weight.bold,
  color: vars.color.primary,
  fontVariantNumeric: 'tabular-nums',
});

export const multiKpiValuePrice = style({
  fontSize: vars.typography.size.xl,
  fontWeight: vars.typography.weight.bold,
  color: vars.color.available,
  fontVariantNumeric: 'tabular-nums',
});

export const multiKpiLabel = style({
  fontSize: vars.typography.size.xs,
  color: vars.color.textMuted,
});

export const emptyState = style({
  fontSize: vars.typography.size.sm,
  color: vars.color.textMuted,
  textAlign: 'center',
  paddingBlock: vars.spacing[6],
});

export const breadcrumbContainer = style({
  display: 'flex',
  alignItems: 'center',
  flexWrap: 'wrap',
  gap: vars.spacing[1],
  padding: `${vars.spacing[1.5]} ${vars.spacing[2]}`,
  backgroundColor: vars.color.bgPrimary,
  borderRadius: vars.radii.md,
  border: `1px solid ${vars.color.borderSubtle}`,
  fontSize: vars.typography.size.xs,
  color: vars.color.textMed,
  marginBottom: vars.spacing[2],
});

export const breadcrumbItem = style({
  cursor: 'pointer',
  fontWeight: vars.typography.weight.medium,
  ':hover': {
    color: vars.color.primary,
    textDecoration: 'underline',
  },
});
