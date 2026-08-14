'use client';

import React from 'react';
import { ViewBox, generateRulerTicks } from '@/domain/venue/geometry';
import { vars } from '@/styles/tokens.css';
import * as s from './VenueRulers.css';

export interface VenueRulersProps {
  viewBox: ViewBox;
}

export function VenueRulers({ viewBox }: VenueRulersProps) {
  const xTicks = generateRulerTicks(viewBox.x, viewBox.x + viewBox.w, 100);
  const yTicks = generateRulerTicks(viewBox.y, viewBox.y + viewBox.h, 100);

  return (
    <div className={s.rulerContainer}>
      <div className={s.rulerCorner} />

      {/* Top X Ruler */}
      <div className={s.topRuler}>
        <svg width="100%" height="100%" viewBox={`${viewBox.x} 0 ${viewBox.w} 20`} preserveAspectRatio="none">
          {xTicks.map((t) => (
            <g key={`x_${t.position}`}>
              <line
                x1={t.position} y1={t.isMajor ? 0 : 10}
                x2={t.position} y2={20}
                stroke={vars.color.borderSubtle} strokeWidth={1}
              />
              {t.isMajor && (
                <text x={t.position + 2} y={12} fontSize="9" fill={vars.color.textMuted}>
                  {t.label}
                </text>
              )}
            </g>
          ))}
        </svg>
      </div>

      {/* Left Y Ruler */}
      <div className={s.leftRuler}>
        <svg width="100%" height="100%" viewBox={`0 ${viewBox.y} 24 ${viewBox.h}`} preserveAspectRatio="none">
          {yTicks.map((t) => (
            <g key={`y_${t.position}`}>
              <line
                x1={t.isMajor ? 0 : 12} y1={t.position}
                x2={24} y2={t.position}
                stroke={vars.color.borderSubtle} strokeWidth={1}
              />
              {t.isMajor && (
                <text x={2} y={t.position - 2} fontSize="9" fill={vars.color.textMuted}>
                  {t.label}
                </text>
              )}
            </g>
          ))}
        </svg>
      </div>
    </div>
  );
}
