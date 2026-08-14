import { style, keyframes } from '@vanilla-extract/css';
import { vars } from '@/styles/tokens.css';

/* ─── Canvas Container ───────────────────────────────────── */

export const canvasWrapper = style({
  position: 'relative',
  flex: 1,
  minHeight: '38rem',
  height: '100%',
  backgroundColor: vars.color.bgPrimary,
  borderRadius: vars.radii.lg,
  border: `1px solid ${vars.color.borderMuted}`,
  overflow: 'hidden',
  touchAction: 'none',
  cursor: 'grab',

  selectors: {
    '&[data-panning="true"]': {
      cursor: 'grabbing',
    },
    '&[data-dragging="true"]': {
      cursor: 'move',
    },
  },
});

export const svgCanvas = style({
  display: 'block',
  width: '100%',
  height: '100%',
  userSelect: 'none',
});

/* ─── Floating Toolbar ───────────────────────────────────── */

export const toolbar = style({
  position: 'absolute',
  bottom: vars.spacing[3],
  left: '50%',
  transform: 'translateX(-50%)',
  display: 'flex',
  alignItems: 'center',
  gap: vars.spacing[1],
  padding: vars.spacing[1],
  backgroundColor: vars.color.bgToolbar,
  backdropFilter: 'blur(0.75rem)',
  WebkitBackdropFilter: 'blur(0.75rem)',
  borderRadius: vars.radii.lg,
  border: `1px solid ${vars.color.borderSubtle}`,
  boxShadow: vars.shadow.lg,
  zIndex: vars.zIndex.toolbar,
});

export const toolbarBtn = style({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: vars.spacing[8],
  height: vars.spacing[8],
  borderRadius: vars.radii.md,
  border: 'none',
  backgroundColor: 'transparent',
  color: vars.color.textMed,
  cursor: 'pointer',
  transition: `background-color ${vars.transition.fast}, color ${vars.transition.fast}`,
  fontSize: vars.typography.size.sm,

  ':hover': {
    backgroundColor: vars.color.bgSurfaceHover,
    color: vars.color.textHigh,
  },
  ':active': {
    backgroundColor: vars.color.bgSurfaceActive,
  },
});

export const toolbarDivider = style({
  width: '1px',
  height: vars.spacing[5],
  backgroundColor: vars.color.borderMuted,
  marginInline: vars.spacing[1],
});

/* ─── Status Legend (inside toolbar) ─────────────────────── */

export const legendDot = style({
  display: 'inline-block',
  width: vars.spacing[2],
  height: vars.spacing[2],
  borderRadius: vars.radii.full,
  marginRight: vars.spacing[1],
});

export const legendDotAvailable = style([
  legendDot,
  { backgroundColor: vars.color.available },
]);

export const legendDotReserved = style([
  legendDot,
  { backgroundColor: vars.color.reserved },
]);

export const legendDotSold = style([
  legendDot,
  { backgroundColor: vars.color.sold },
]);

export const legendDotBlocked = style([
  legendDot,
  { backgroundColor: vars.color.blocked },
]);

export const legendItem = style({
  display: 'flex',
  alignItems: 'center',
  fontSize: vars.typography.size.xs,
  color: vars.color.textMuted,
  whiteSpace: 'nowrap',
  paddingInline: vars.spacing[1],
});

/* ─── Hover Tooltip ──────────────────────────────────────── */

export const tooltip = style({
  position: 'absolute',
  pointerEvents: 'none',
  zIndex: vars.zIndex.tooltip,
  padding: vars.spacing[3],
  backgroundColor: vars.color.bgTooltip,
  backdropFilter: 'blur(1rem)',
  WebkitBackdropFilter: 'blur(1rem)',
  borderRadius: vars.radii.lg,
  border: `1px solid ${vars.color.borderSubtle}`,
  boxShadow: vars.shadow.md,
  minWidth: vars.sizing.tooltipMinWidth,
  maxWidth: vars.sizing.tooltipMaxWidth,
  transition: `opacity ${vars.transition.fast}`,
});

export const tooltipPositioned = style([
  tooltip,
  {
    left: 'var(--tooltip-left)',
    top: 'var(--tooltip-top)',
    opacity: 1,
  },
]);

export const tooltipName = style({
  fontSize: vars.typography.size.sm,
  fontWeight: vars.typography.weight.bold,
  color: vars.color.textHigh,
  marginBottom: vars.spacing[1],
});

export const tooltipRow = style({
  display: 'flex',
  justifyContent: 'space-between',
  fontSize: vars.typography.size.xs,
  color: vars.color.textMed,
  paddingBlock: vars.spacing[1],
});

export const tooltipValue = style({
  fontWeight: vars.typography.weight.semibold,
  color: vars.color.textHigh,
});

/* ─── Selection Pulse Keyframe ───────────────────────────── */

const selectionPulse = keyframes({
  '0%, 100%': { opacity: 0.6 },
  '50%': { opacity: 1 },
});

export const selectionRing = style({
  animation: `${selectionPulse} 2s ease-in-out infinite`,
  pointerEvents: 'none',
});

/* ─── Zoom Label ─────────────────────────────────────────── */

export const zoomLabel = style({
  fontSize: vars.typography.size.xs,
  color: vars.color.textMuted,
  minWidth: vars.spacing[10],
  textAlign: 'center',
  fontVariantNumeric: 'tabular-nums',
});

/* ─── Resize & Rotation Handles ─────────────────────────── */

export const handleNW = style({ cursor: 'nwse-resize' });
export const handleNE = style({ cursor: 'nesw-resize' });
export const handleSE = style({ cursor: 'nwse-resize' });
export const handleSW = style({ cursor: 'nesw-resize' });
export const handleRotate = style({ cursor: 'grab' });

/* ─── Alignment Guides & Selection Box ──────────────────── */

export const alignGuide = style({
  stroke: vars.color.primary,
  strokeWidth: 1,
  strokeDasharray: '4 4',
  pointerEvents: 'none',
});

export const marqueeSelectionBox = style({
  fill: 'hsl(260 85% 65% / 0.15)',
  stroke: vars.color.primary,
  strokeWidth: 1,
  strokeDasharray: '4 4',
  pointerEvents: 'none',
});

export const selectionBoundingBox = style({
  stroke: vars.color.primary,
  strokeWidth: 1.5,
  strokeDasharray: '4 2',
  fill: 'none',
  pointerEvents: 'none',
});

export const handleCircle = style({
  fill: vars.color.textHigh,
  stroke: vars.color.primary,
  strokeWidth: 1.5,
});

export const rotateHandleLine = style({
  stroke: vars.color.primary,
  strokeWidth: 1.5,
});

export const rotateHandleCircle = style({
  fill: vars.color.primary,
  stroke: vars.color.textHigh,
  strokeWidth: 1.5,
});

export const groupBoundaryRect = style({
  stroke: vars.color.borderSubtle,
  strokeWidth: 1,
  strokeDasharray: '6 3',
  fill: 'none',
});

export const gridPatternPath = style({
  stroke: vars.color.borderMuted,
  strokeWidth: 0.5,
  fill: 'none',
});

/* ─── SVG Text & Label Classes (no presentational TSX props) ── */

export const svgTextLabel = style({
  fontWeight: vars.typography.weight.semibold,
  fontSize: vars.typography.size.label,
  fill: vars.color.textHigh,
  pointerEvents: 'none',
});

export const svgTextStage = style({
  fontWeight: vars.typography.weight.semibold,
  fontSize: vars.typography.size.sm,
  fill: vars.color.textMed,
  pointerEvents: 'none',
});

export const svgTextSub = style({
  fontWeight: vars.typography.weight.medium,
  fontSize: vars.typography.size.caption,
  fill: vars.color.textMuted,
  pointerEvents: 'none',
});

export const svgGroupTag = style({
  fontWeight: vars.typography.weight.semibold,
  fontSize: vars.typography.size.tag,
  fill: vars.color.textMuted,
  pointerEvents: 'none',
});
