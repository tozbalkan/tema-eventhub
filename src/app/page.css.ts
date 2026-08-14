import { style } from '@vanilla-extract/css';
import { vars, breakpoints } from '@/styles/tokens.css';

export const pageContainer = style({
  minHeight: '100dvh',
  backgroundColor: vars.color.bgPrimary,
  color: vars.color.textHigh,
  display: 'flex',
  flexDirection: 'column',
});

/* ─── Header ─────────────────────────────────────────────── */

export const header = style({
  minHeight: '4rem',
  borderBottom: `1px solid ${vars.color.borderSubtle}`,
  backgroundColor: vars.color.bgGlass,
  backdropFilter: 'blur(0.5rem)',
  display: 'flex',
  flexDirection: 'column',
  gap: vars.spacing[2],
  paddingBlock: vars.spacing[3],
  paddingInline: vars.spacing[4],
  position: 'sticky',
  top: 0,
  zIndex: vars.zIndex.overlay,

  [`@media (min-width: ${breakpoints.md})`]: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingInline: vars.spacing[6],
  },
});

export const logoGroup = style({
  display: 'flex',
  alignItems: 'center',
  flexWrap: 'wrap',
  gap: vars.spacing[3],
});

export const logoBadge = style({
  backgroundColor: vars.color.primary,
  color: vars.color.textHigh,
  paddingBlock: vars.spacing[1],
  paddingInline: vars.spacing[3],
  borderRadius: vars.radii.full,
  fontSize: vars.typography.size.xs,
  fontWeight: vars.typography.weight.bold,
  letterSpacing: '0.05em',
});

export const headerTitle = style({
  fontSize: vars.typography.size.lg,
  fontWeight: vars.typography.weight.bold,
  display: 'flex',
  alignItems: 'center',
  gap: vars.spacing[2],
});

export const headerSubtitle = style({
  fontSize: vars.typography.size.xs,
  color: vars.color.textMed,
});

export const headerBadgeGroup = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.spacing[2],
  flexWrap: 'wrap',
});

/* ─── Main Grid ──────────────────────────────────────────── */

export const mainGrid = style({
  display: 'grid',
  gridTemplateColumns: '1fr',
  gap: vars.spacing[4],
  padding: vars.spacing[4],
  flex: 1,

  [`@media (min-width: ${breakpoints.md})`]: {
    gridTemplateColumns: 'minmax(0, 3.5fr) minmax(18rem, 21rem)',
    gap: vars.spacing[5],
    padding: vars.spacing[5],
  },
});

/* ─── Floor Plan Panel ───────────────────────────────────── */

export const floorPlanPanel = style({
  backgroundColor: vars.color.bgSurface,
  border: `1px solid ${vars.color.borderSubtle}`,
  borderRadius: vars.radii.xl,
  padding: vars.spacing[4],
  display: 'flex',
  flexDirection: 'column',
  gap: vars.spacing[4],
  minHeight: '44rem',
  flex: 1,

  [`@media (min-width: ${breakpoints.md})`]: {
    padding: vars.spacing[5],
  },
});

export const floorPlanHeader = style({
  display: 'flex',
  flexDirection: 'column',
  gap: vars.spacing[2],

  [`@media (min-width: ${breakpoints.sm})`]: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
});

export const floorPlanTitle = style({
  fontSize: vars.typography.size.lg,
  fontWeight: vars.typography.weight.bold,
});

export const floorPlanSubTitle = style({
  fontSize: vars.typography.size.sm,
  color: vars.color.textMed,
  marginTop: vars.spacing[1],
});

/* ─── Sidebar ────────────────────────────────────────────── */

export const sidebarPanel = style({
  display: 'flex',
  flexDirection: 'column',
  gap: vars.spacing[3],
});

/* ─── Cards (for timeline and tasks) ─────────────────────── */

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

export const cardTitle = style({
  fontSize: vars.typography.size.base,
  fontWeight: vars.typography.weight.semibold,
  color: vars.color.textHigh,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  cursor: 'pointer',
  userSelect: 'none',
});

export const cardTitleGroup = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.spacing[2],
});

export const accordionContent = style({
  display: 'flex',
  flexDirection: 'column',
  gap: vars.spacing[3],
});

/* ─── KPI Grid ───────────────────────────────────────────── */

export const kpiGrid = style({
  display: 'grid',
  gridTemplateColumns: 'repeat(2, 1fr)',
  gap: vars.spacing[2],

  [`@media (min-width: ${breakpoints.sm})`]: {
    gap: vars.spacing[3],
  },
});

export const kpiBox = style({
  backgroundColor: vars.color.bgSurfaceHover,
  borderRadius: vars.radii.md,
  padding: vars.spacing[3],
  display: 'flex',
  flexDirection: 'column',
  gap: vars.spacing[1],
});

export const kpiValue = style({
  fontSize: vars.typography.size.xl,
  fontWeight: vars.typography.weight.bold,
  color: vars.color.primary,
});

export const kpiLabel = style({
  fontSize: vars.typography.size.xs,
  color: vars.color.textMuted,
});

export const textSubtleSm = style({
  fontSize: vars.typography.size.sm,
  color: vars.color.textMed,
});

/* ─── Timeline ───────────────────────────────────────────── */

export const timelineStream = style({
  display: 'flex',
  flexDirection: 'column',
  gap: vars.spacing[2],
  maxHeight: '16rem',
  overflowY: 'auto',
});

export const timelineItem = style({
  display: 'flex',
  gap: vars.spacing[3],
  padding: vars.spacing[2],
  backgroundColor: vars.color.bgPrimary,
  borderRadius: vars.radii.md,
  borderLeft: `${vars.spacing['0.75']} solid ${vars.color.primary}`,
});

export const timelineTime = style({
  fontSize: vars.typography.size.xs,
  fontFamily: vars.typography.family.mono,
  color: vars.color.primary,
  fontWeight: vars.typography.weight.bold,
});

export const timelineContent = style({
  fontSize: vars.typography.size.xs,
  color: vars.color.textMed,
  display: 'flex',
  flexDirection: 'column',
  gap: vars.spacing[1],
});

/* ─── Modal Styles ───────────────────────────────────────── */

export const modalForm = style({
  display: 'flex',
  flexDirection: 'column',
  gap: vars.spacing[4],
});

export const modalStack = style({
  display: 'flex',
  flexDirection: 'column',
  gap: vars.spacing[4],
});

export const modalPriceSummaryBox = style({
  backgroundColor: vars.color.bgSurfaceHover,
  padding: vars.spacing[4],
  borderRadius: vars.radii.lg,
  display: 'flex',
  flexDirection: 'column',
  gap: vars.spacing[1],
});

export const modalTextBase = style({
  fontSize: vars.typography.size.sm,
  color: vars.color.textHigh,
});

export const modalTextMuted = style({
  fontSize: vars.typography.size.sm,
  color: vars.color.textMed,
});

export const modalTextSuccess = style({
  fontSize: vars.typography.size.sm,
  color: vars.color.available,
  fontWeight: vars.typography.weight.semibold,
});

export const modalTicketTokenBox = style({
  backgroundColor: vars.color.availableBg,
  padding: vars.spacing[4],
  borderRadius: vars.radii.lg,
  border: `1px solid ${vars.color.available}`,
  display: 'flex',
  flexDirection: 'column',
  gap: vars.spacing[1],
});

export const textBold = style({
  fontWeight: vars.typography.weight.bold,
});

export const modalTokenCode = style({
  fontSize: vars.typography.size.sm,
  fontFamily: vars.typography.family.mono,
  marginTop: vars.spacing[1],
  color: vars.color.available,
});

export const modalTextError = style({
  fontSize: vars.typography.size.sm,
  color: vars.color.sold,
});

/* ─── Stats Bar Gap ──────────────────────────────────────── */

export const statsSection = style({
  paddingBlock: vars.spacing[3],
});

export const selectField = style({
  width: '100%',
  paddingBlock: vars.spacing[2],
  paddingInline: vars.spacing[3],
  borderRadius: vars.radii.md,
  backgroundColor: vars.color.bgPrimary,
  color: vars.color.textHigh,
  border: `1px solid ${vars.color.borderSubtle}`,
  fontSize: vars.typography.size.sm,
  outline: 'none',
});

export const canvasFlexWorkspace = style({
  display: 'flex',
  flex: 1,
  minHeight: 0,
  position: 'relative',
});

export const modalNoticeBox = style({
  fontSize: vars.typography.size.xs,
  color: vars.color.available,
  display: 'flex',
  alignItems: 'center',
  gap: vars.spacing[1.5],
});

export const modalReservedText = style({
  color: vars.color.reserved,
});

export const modalTextMarginBottom = style({
  marginBottom: vars.spacing[2],
});

