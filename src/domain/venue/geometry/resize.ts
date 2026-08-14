import { WorldPoint, VenueGeometry } from './types';

export type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

/**
 * Calculates updated object dimensions and position when dragging a 2D resize handle.
 * Respects minSize (default: 20) and aspect ratio preservation when preserveAspect is true.
 */
export function calculateResize(
  handle: ResizeHandle,
  startBounds: VenueGeometry,
  deltaSvg: WorldPoint,
  preserveAspect: boolean = false,
  minSize: number = 20
): VenueGeometry {
  let newX = startBounds.x;
  let newY = startBounds.y;
  let newW = startBounds.width;
  let newH = startBounds.height;
  const initialAspect = startBounds.width / Math.max(startBounds.height, 1);

  if (handle.includes('e')) {
    newW = Math.max(minSize, startBounds.width + deltaSvg.x);
  }
  if (handle.includes('s')) {
    newH = Math.max(minSize, startBounds.height + deltaSvg.y);
  }
  if (handle.includes('w')) {
    const rawW = startBounds.width - deltaSvg.x;
    newW = Math.max(minSize, rawW);
    newX = startBounds.x + (startBounds.width - newW);
  }
  if (handle.includes('n')) {
    const rawH = startBounds.height - deltaSvg.y;
    newH = Math.max(minSize, rawH);
    newY = startBounds.y + (startBounds.height - newH);
  }

  if (preserveAspect) {
    if (handle === 'e' || handle === 'w') {
      newH = Math.max(minSize, Math.round(newW / initialAspect));
    } else if (handle === 'n' || handle === 's') {
      newW = Math.max(minSize, Math.round(newH * initialAspect));
    } else {
      newH = Math.max(minSize, Math.round(newW / initialAspect));
    }
  }

  return {
    x: Math.round(newX),
    y: Math.round(newY),
    width: Math.round(newW),
    height: Math.round(newH),
    rotation: startBounds.rotation,
  };
}

/**
 * Calculates new rotation angle (in degrees 0..359) from object center to cursor point.
 * Snaps to 15-degree increments when snap15Deg is true.
 */
export function calculateRotation(
  center: WorldPoint,
  cursorSvg: WorldPoint,
  snap15Deg: boolean = false
): number {
  const dx = cursorSvg.x - center.x;
  const dy = cursorSvg.y - center.y;
  let rad = Math.atan2(dy, dx); // Angle relative to horizontal right
  let deg = Math.round((rad * 180) / Math.PI + 90); // Normalize top = 0deg

  if (deg < 0) deg += 360;
  deg = deg % 360;

  if (snap15Deg) {
    deg = Math.round(deg / 15) * 15;
    if (deg === 360) deg = 0;
  }

  return deg;
}
