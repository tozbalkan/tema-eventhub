import { style } from '@vanilla-extract/css';
import { vars } from '@/styles/tokens.css';

export const rulerContainer = style({
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  pointerEvents: 'none',
  zIndex: vars.zIndex.overlay,
});

export const topRuler = style({
  position: 'absolute',
  top: 0,
  left: '1.5rem',
  right: 0,
  height: '1.25rem',
  backgroundColor: vars.color.bgSurface,
  borderBottom: `1px solid ${vars.color.borderSubtle}`,
  overflow: 'hidden',
});

export const leftRuler = style({
  position: 'absolute',
  top: '1.25rem',
  left: 0,
  bottom: 0,
  width: '1.5rem',
  backgroundColor: vars.color.bgSurface,
  borderRight: `1px solid ${vars.color.borderSubtle}`,
  overflow: 'hidden',
});

export const rulerCorner = style({
  position: 'absolute',
  top: 0,
  left: 0,
  width: '1.5rem',
  height: '1.25rem',
  backgroundColor: vars.color.bgSurface,
  borderRight: `1px solid ${vars.color.borderSubtle}`,
  borderBottom: `1px solid ${vars.color.borderSubtle}`,
});
