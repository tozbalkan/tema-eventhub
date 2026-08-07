import { style, styleVariants } from '@vanilla-extract/css';
import { vars } from '@/styles/tokens.css';

export const badgeBase = style({
  display: 'inline-flex',
  alignItems: 'center',
  gap: vars.spacing[1],
  borderRadius: vars.radii.full,
  fontSize: vars.typography.size.xs,
  fontWeight: vars.typography.weight.semibold,
  paddingBlock: vars.spacing[1],
  paddingInline: vars.spacing[3],
  border: '1px solid transparent',
  lineHeight: vars.typography.lineHeight.tight,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
});

export const badgeVariants = styleVariants({
  Available: {
    backgroundColor: vars.color.availableBg,
    color: vars.color.available,
    borderColor: vars.color.available,
  },
  Reserved: {
    backgroundColor: vars.color.reservedBg,
    color: vars.color.reserved,
    borderColor: vars.color.reserved,
  },
  Sold: {
    backgroundColor: vars.color.soldBg,
    color: vars.color.sold,
    borderColor: vars.color.sold,
  },
  Blocked: {
    backgroundColor: vars.color.blockedBg,
    color: vars.color.blocked,
    borderColor: vars.color.blocked,
  },
  Neutral: {
    backgroundColor: vars.color.bgSurfaceHover,
    color: vars.color.textMed,
    borderColor: vars.color.borderSubtle,
  },
});
