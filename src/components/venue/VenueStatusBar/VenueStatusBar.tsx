'use client';

import React from 'react';
import { ZoomIn, MousePointer, Grid3X3, Layers } from 'lucide-react';
import * as s from './VenueStatusBar.css';

export interface VenueStatusBarProps {
  zoomPct: number;
  cursorWorld: { x: number; y: number };
  selectedCount: number;
  gridSnap: number;
  showRulers?: boolean;
}

export function VenueStatusBar({
  zoomPct,
  cursorWorld,
  selectedCount,
  gridSnap,
  showRulers = true,
}: VenueStatusBarProps) {
  return (
    <div className={s.statusBar}>
      <div className={s.statusGroup}>
        <span className={s.statusItem}>
          <ZoomIn size={12} /> Yakınlaştırma: <strong className={s.statusValue}>{zoomPct}%</strong>
        </span>
        <span className={s.statusItem}>
          <MousePointer size={12} /> İmleç X/Y: <strong className={s.statusValue}>{Math.round(cursorWorld.x)}, {Math.round(cursorWorld.y)}</strong>
        </span>
        <span className={s.statusItem}>
          <Layers size={12} /> Seçili: <strong className={s.statusValue}>{selectedCount} Nesne</strong>
        </span>
      </div>

      <div className={s.statusGroup}>
        <span className={s.statusItem}>
          <Grid3X3 size={12} /> Izgara Snap: <strong className={s.statusValue}>{gridSnap === 0 ? 'KAPALI' : `${gridSnap}px`}</strong>
        </span>
        <span className={s.statusItem}>
          Cetveller: <strong className={s.statusValue}>{showRulers ? 'AÇIK' : 'KAPALI'}</strong>
        </span>
      </div>
    </div>
  );
}
